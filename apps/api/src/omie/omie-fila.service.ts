import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import type { OperacaoNoOmie } from "../financeiro/omie-envios.rules";
import { IntegrationGate } from "../integrations/integration-gate";
import { JobsQueue } from "../jobs/queue/jobs-queue.port";
import { PrismaJobsService } from "../prisma/prisma-jobs.service";
import { OmieEscrita } from "./omie-escrita";
import { PAUSA_MS, TODA_A_EMPRESA, destinoDaFalha, estaPausada, metodoDoEnvio } from "./omie-fila.rules";

export const OMIE_DESPACHAR_JOB = "omie.despachar";
export const OMIE_ENVIAR_JOB = "omie.enviar";
/** Quanto um envio pode ficar em `enviando` antes de contar como queda do worker. */
const PRESO_APOS_MS = 15 * 60_000;
const LOTE_DO_DESPACHO = 100;

type Estado = "pendente" | "enviando" | "enviado" | "erro" | "descartado";
type EnvioDevido = { id: string; lancamento_id: string; company_id: string; tipo: "saida" | "entrada"; operacao: OperacaoNoOmie; tentativas: number };
type Pausa = { company_id: string; metodo: string };

export type ResultadoDaFila =
  | { skipped: true; motivo: string }
  | { skipped: false; enfileirados?: number; recuperados?: number; resultado?: "enviado" | "erro" | "retentar" | "adiar" };

/**
 * A fila do OMIE (PLU-342, seção 5 do desenho). Lê e muda o outbox só pelas funções
 * do banco, com o pool dos jobs (sem acesso aos dados do lançamento). Nunca chama o
 * OMIE fora do modo `write`: o despacho nem enfileira, e o envio confere de novo.
 */
@Injectable()
export class OmieFilaService {
  private readonly logger = new Logger(OmieFilaService.name);

  constructor(
    @Inject(PrismaJobsService) private readonly banco: PrismaClient,
    @Inject(IntegrationGate) private readonly gate: IntegrationGate,
    @Inject(JobsQueue) private readonly fila: JobsQueue,
    @Inject(OmieEscrita) private readonly escrita: OmieEscrita,
  ) {}

  /** Recupera os presos e enfileira um `omie.enviar` por envio devido, fora das pausas. */
  async despachar(agora: Date): Promise<ResultadoDaFila> {
    const modo = await this.gate.modoDe("omie");
    if (modo !== "write") return { skipped: true, motivo: `modo_${modo}` };
    const [presos] = await this.banco.$queryRaw<{ recuperados: number }[]>`
      SELECT plugga_security.omie_envios_recuperar_presos(${new Date(agora.getTime() - PRESO_APOS_MS)}::timestamptz) AS recuperados`;
    const pausas = await this.pausas();
    const devidos = await this.banco.$queryRaw<EnvioDevido[]>`
      SELECT * FROM plugga_security.omie_envios_devidos(${LOTE_DO_DESPACHO}::integer)`;
    let enfileirados = 0;
    for (const envio of devidos) {
      if (estaPausada(pausas, envio.company_id, metodoDoEnvio(envio.tipo, envio.operacao))) continue;
      // A chave leva o id do envio: a dedupe por lançamento e operação é do outbox, e um
      // segundo envio da mesma operação, dias depois, é outra linha e outra chave.
      await this.fila.enqueue(OMIE_ENVIAR_JOB, { envioId: envio.id }, { dedupeKey: `omie:envio:${envio.id}`, attempts: 1, triggeredBy: OMIE_DESPACHAR_JOB });
      enfileirados++;
    }
    return { skipped: false, enfileirados, recuperados: Number(presos?.recuperados ?? 0) };
  }

  /** Um envio: confere modo, estado e pausa; marca `enviando`; chama o OMIE; grava o destino. */
  async enviar(envioId: string, agora: Date): Promise<ResultadoDaFila> {
    const modo = await this.gate.modoDe("omie");
    if (modo !== "write") return { skipped: true, motivo: `modo_${modo}` };
    const [envio] = await this.banco.$queryRaw<(EnvioDevido & { estado: Estado })[]>`
      SELECT * FROM plugga_security.omie_envio_para_enviar(${envioId}::uuid)`;
    if (!envio || envio.estado !== "pendente") return { skipped: true, motivo: "nao_pendente" };
    const metodo = metodoDoEnvio(envio.tipo, envio.operacao);
    if (estaPausada(await this.pausas(), envio.company_id, metodo)) return { skipped: true, motivo: "pausada" };
    if (!(await this.transicao(envio.id, "pendente", "enviando"))) return { skipped: true, motivo: "fora_da_vez" };

    try {
      const { codigo } = await this.escrita.enviar({ envioId: envio.id, lancamentoId: envio.lancamento_id, empresa: envio.company_id, tipo: envio.tipo, operacao: envio.operacao });
      await this.transicao(envio.id, "enviando", "enviado", { codigo });
      return { skipped: false, resultado: "enviado" };
    } catch (erro) {
      const destino = destinoDaFalha(erro, envio.tentativas, agora);
      // Só o motivo curto vai ao log e ao banco: nunca a resposta do OMIE.
      this.logger.warn(`envio ${envio.id} (${metodo}, ${envio.company_id}): ${destino.tipo} ${destino.motivo}`);
      if (destino.tipo === "erro") {
        await this.transicao(envio.id, "enviando", "erro", { erro: destino.motivo });
        if (destino.motivo === "credenciais_invalidas") await this.pausar(envio.company_id, TODA_A_EMPRESA, new Date(agora.getTime() + PAUSA_MS), destino.motivo);
      } else if (destino.tipo === "retentar") {
        await this.transicao(envio.id, "enviando", "pendente", { tentativas: destino.tentativas, proxima: destino.proximaEm, erro: destino.motivo });
      } else {
        await this.transicao(envio.id, "enviando", "pendente", { proxima: destino.proximaEm, erro: destino.motivo });
        if (destino.motivo === "limite_de_consumo") await this.pausar(envio.company_id, metodo, destino.proximaEm, destino.motivo);
      }
      return { skipped: false, resultado: destino.tipo };
    }
  }

  private async pausas(): Promise<Pausa[]> {
    return this.banco.$queryRaw<Pausa[]>`SELECT company_id, metodo FROM plugga_security.omie_pausas_ativas()`;
  }

  private async pausar(empresa: string, metodo: string, ate: Date, motivo: string): Promise<void> {
    await this.banco.$executeRaw`SELECT plugga_security.omie_pausar(${empresa}::text, ${metodo}::text, ${ate}::timestamptz, ${motivo}::text)`;
  }

  private async transicao(
    envioId: string,
    de: Estado,
    para: Estado,
    o: { tentativas?: number; proxima?: Date; erro?: string; codigo?: string | null } = {},
  ): Promise<boolean> {
    const [linha] = await this.banco.$queryRaw<{ ok: boolean }[]>`
      SELECT plugga_security.omie_envio_transicao(${envioId}::uuid, ${de}::public.omie_estado_do_envio, ${para}::public.omie_estado_do_envio,
        ${o.tentativas ?? null}::integer, ${o.proxima ?? null}::timestamptz, ${o.erro ?? null}::text, ${o.codigo ?? null}::text) AS ok`;
    return linha?.ok === true;
  }
}
