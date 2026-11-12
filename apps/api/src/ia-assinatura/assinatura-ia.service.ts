import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  eventNames,
  type ContaDeAssinatura,
  type EstadoDaAssinatura,
  type EventName,
  type LoginDeAssinatura,
  type ProvedorDeAssinatura,
  type SituacaoDoLogin,
} from "@plugga/shared";

import { AuditPort } from "../audit/audit.port";
import { cifrar, decifrar } from "../llm/cripto.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { CliProxyFalhouError, CliProxyPort } from "./cliproxy.port";

/** Uma linha cifrada por provedor com o aceite do risco: `integracao.assinatura.<provedor>`. */
export const chaveDaAssinatura = (provedor: ProvedorDeAssinatura): string => `integracao.assinatura.${provedor}`;

/**
 * IA pela assinatura (Claude e Codex) por um proxy de CLI. Duas travas valem aqui:
 *
 * 1. Sem o aceite do risco registrado, o login nem começa: usar plano de consumidor
 *    assim contraria os termos da Anthropic e não é o caminho oficial da OpenAI.
 * 2. Esta porta serve só tarefa interna, sem dado de cliente. A leitura de fatura e
 *    qualquer fluxo com dado pessoal usam a porta do OpenRouter (roteamento sem
 *    retenção) e NÃO importam este serviço.
 */
@Injectable()
export class AssinaturaIaService {
  private readonly logger = new Logger(AssinaturaIaService.name);

  constructor(
    @Inject(SegredoRepository) private readonly segredos: SegredoRepository,
    @Inject(CliProxyPort) private readonly proxy: CliProxyPort,
    @Inject(AuditPort) private readonly auditoria: AuditPort,
  ) {}

  async estado(provedor: ProvedorDeAssinatura): Promise<EstadoDaAssinatura> {
    const risco = await this.risco(provedor);
    const base = { provedor, riscoAceito: risco !== null, riscoAceitoEm: risco?.em ?? null, riscoAceitoPor: risco?.por ?? null };
    if (!this.proxy.configurado()) return { ...base, proxy: "nao_configurado", contas: [] };

    let contas: ContaDeAssinatura[] = [];
    try {
      if (!(await this.proxy.saude())) return { ...base, proxy: "fora_do_ar", contas: [] };
      contas = await this.proxy.listarContas(provedor);
    } catch (erro) {
      this.logger.warn(`proxy de assinatura sem estado: ${erro instanceof CliProxyFalhouError ? erro.motivo : "erro inesperado"}`);
      return { ...base, proxy: "fora_do_ar", contas: [] };
    }
    return { ...base, proxy: "ok", contas };
  }

  async aceitarRisco(provedor: ProvedorDeAssinatura, quem: string): Promise<EstadoDaAssinatura> {
    const cifrada = cifrar(JSON.stringify({ em: new Date().toISOString(), por: quem }));
    await this.segredos.gravar({ chave: chaveDaAssinatura(provedor), valorCifrado: cifrada.conteudo, iv: cifrada.iv, tag: cifrada.tag, ultimosQuatro: "", atualizadoPor: quem });
    await this.registrar(eventNames.iaAssinaturaRiscoAceito, provedor, quem);
    return this.estado(provedor);
  }

  /** Pede ao proxy o link de login. Exige o aceite do risco já registrado. */
  async iniciarLogin(provedor: ProvedorDeAssinatura, quem: string): Promise<LoginDeAssinatura> {
    if ((await this.risco(provedor)) === null) {
      throw new ConflictException("Registre antes que você entende o risco de usar a assinatura por este caminho.");
    }
    const login = await this.proxy.iniciarLogin(provedor);
    await this.registrar(eventNames.iaAssinaturaLoginIniciado, provedor, quem);
    return login;
  }

  situacaoDoLogin(estado: string): Promise<SituacaoDoLogin> {
    return this.proxy.situacaoDoLogin(estado);
  }

  /** Remove uma conta, e só se ela é deste provedor: o nome do arquivo vem da tela e não vale por si. */
  async removerConta(provedor: ProvedorDeAssinatura, arquivo: string, quem: string): Promise<EstadoDaAssinatura> {
    const contas = await this.proxy.listarContas(provedor);
    if (!contas.some((c) => c.arquivo === arquivo)) throw new NotFoundException("Conta não encontrada neste provedor.");
    await this.proxy.removerConta(arquivo);
    await this.registrar(eventNames.iaAssinaturaContaRemovida, provedor, quem);
    return this.estado(provedor);
  }

  /** Confere a conexão listando os modelos do provedor no proxy. Não gasta cota da assinatura. */
  async testar(provedor: ProvedorDeAssinatura): Promise<{ modelos: string[] }> {
    const modelos = await this.proxy.listarModelos(provedor);
    if (modelos.length === 0) throw new CliProxyFalhouError("resposta_inesperada");
    return { modelos: modelos.slice(0, 20) };
  }

  private async risco(provedor: ProvedorDeAssinatura): Promise<{ em: string; por: string } | null> {
    const linha = await this.segredos.buscar(chaveDaAssinatura(provedor));
    if (!linha) return null;
    try {
      const d = JSON.parse(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag })) as { em?: unknown; por?: unknown };
      return typeof d.em === "string" && typeof d.por === "string" ? { em: d.em, por: d.por } : null;
    } catch {
      // Aceite ilegível não vale como aceite: pede de novo.
      return null;
    }
  }

  private async registrar(evento: EventName, provedor: ProvedorDeAssinatura, quem: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "segredo",
        entityId: chaveDaAssinatura(provedor),
        actorType: "user",
        actorId: quem,
        payload: { provedor },
        occurredAt: new Date(),
      });
    } catch (erro) {
      this.logger.error(`alteração da assinatura de IA (${provedor}) não auditada: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
}
