import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import {
  PRAZO_PADRAO_DO_TIPO,
  chaveDeIdempotenciaSchema,
  criarOrdemDeServicoSchema,
  type CriarOrdemPeloAgente,
  type OrdemPeloAgenteResposta,
  type TipoDeOrdemDeServico,
} from "@plugga/shared";

import { NaoProcessavel, RequisicaoInvalida } from "../common/errors/dominio";
import { adicionarDiasUteis, diaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { RELOGIO_DA_ENGENHARIA, type Relogio } from "./engenharia.service";
import { PrismaEngenhariaRepository } from "./prisma-engenharia.repository";
import { PrismaOrdensPeloAgenteRepository } from "./prisma-ordens-pelo-agente.repository";

/**
 * O.S. aberta pelo robô (DK JUNIOR) pela entrada de agente (PLU-351). O cliente
 * vem pela chave natural (código da UC ou documento); o pedido é idempotente por
 * agente e chave: o mesmo pedido repetido devolve a O.S. da primeira vez; a mesma
 * chave com outro corpo é 409. A O.S., o registro do pedido e a trilha do agente
 * entram na mesma transação. O documento e quem pediu nunca vão para evento,
 * log ou trilha; o hash do corpo é sha256, nunca o corpo em claro.
 */
@Injectable()
export class OrdensPeloAgenteService {
  constructor(
    @Inject(PrismaOrdensPeloAgenteRepository) private readonly repositorio: PrismaOrdensPeloAgenteRepository,
    @Inject(PrismaEngenhariaRepository) private readonly ordens: PrismaEngenhariaRepository,
    @Inject(RELOGIO_DA_ENGENHARIA) private readonly agora: Relogio,
  ) {}

  async criar(chaveRecebida: string | undefined, input: CriarOrdemPeloAgente, principal: AuthPrincipal): Promise<{ resposta: OrdemPeloAgenteResposta; criada: boolean }> {
    const chave = chaveDeIdempotenciaSchema.safeParse(chaveRecebida);
    if (!chave.success) throw new RequisicaoInvalida("Envie o cabeçalho Idempotency-Key.", [{ campo: "Idempotency-Key", problema: "Use de 8 a 120 letras, números, _ . : ou -." }]);
    if (!input.uc && !input.documento) {
      throw new NaoProcessavel("Informe a UC ou o documento (CNPJ/CPF) do cliente; o nome não basta.", [{ campo: "uc", problema: "Envie o código da UC ou o documento do cliente." }]);
    }
    return this.repositorio.executar({ chave: chave.data, hash: hashDoCorpo(input), input }, principal, async ({ clienteId, ucId }) => {
      const agora = this.agora();
      const prazo = input.prazo ?? await this.prazoPadrao(input.tipo, agora);
      return this.ordens.criar(criarOrdemDeServicoSchema.parse({
        empresa: input.empresa,
        tipo: input.tipo,
        clienteId,
        ucId,
        local: input.local ?? null,
        descricao: input.descricao,
        prioridade: input.prioridade,
        origem: "robo",
        canal: input.origem.canal,
        prazo,
      }), principal, agora, { grupo: input.origem.grupo, solicitante: input.origem.solicitante });
    });
  }

  /** Prazo padrão do tipo (Configurações da Engenharia), em dias úteis a partir de hoje. */
  private async prazoPadrao(tipo: TipoDeOrdemDeServico, agora: Date): Promise<string> {
    const { linhas } = await this.ordens.configuracoes();
    const dias = linhas.find((l) => l.tipo === tipo)?.prazoPadraoDiasUteis ?? PRAZO_PADRAO_DO_TIPO[tipo];
    return dias === 0 ? diaEmManaus(agora) : diaEmManaus(adicionarDiasUteis(agora, dias));
  }
}

/** sha256 do corpo canônico (chaves em ordem): compara pedidos sem guardar o corpo. */
export function hashDoCorpo(corpo: unknown): string {
  const canonico = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonico);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonico(x)]));
    return v;
  };
  return createHash("sha256").update(JSON.stringify(canonico(corpo)), "utf8").digest("hex");
}
