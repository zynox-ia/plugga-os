import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
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
import { CliProxyFalhouError, CliProxyPort } from "./cliproxy.port";

/**
 * IA pela assinatura (Claude e Codex) por um proxy de CLI. O login, a lista de contas
 * e o teste passam por aqui; o token mora no proxy e nunca chega ao Plugga OS.
 *
 * Esta porta serve só tarefa interna, sem dado de cliente: a leitura de fatura e
 * qualquer fluxo com dado pessoal usam a porta do OpenRouter (roteamento sem
 * retenção) e NÃO importam este serviço. Um teste garante que nenhum arquivo fora
 * do módulo o importe.
 */
@Injectable()
export class AssinaturaIaService {
  private readonly logger = new Logger(AssinaturaIaService.name);

  constructor(
    @Inject(CliProxyPort) private readonly proxy: CliProxyPort,
    @Inject(AuditPort) private readonly auditoria: AuditPort,
  ) {}

  async estado(provedor: ProvedorDeAssinatura): Promise<EstadoDaAssinatura> {
    if (!this.proxy.configurado()) return { provedor, proxy: "nao_configurado", contas: [] };

    let contas: ContaDeAssinatura[] = [];
    try {
      if (!(await this.proxy.saude())) return { provedor, proxy: "fora_do_ar", contas: [] };
      contas = await this.proxy.listarContas(provedor);
    } catch (erro) {
      this.logger.warn(`proxy de assinatura sem estado: ${erro instanceof CliProxyFalhouError ? erro.motivo : "erro inesperado"}`);
      return { provedor, proxy: "fora_do_ar", contas: [] };
    }
    return { provedor, proxy: "ok", contas };
  }

  /** Pede ao proxy o link de login do provedor. */
  async iniciarLogin(provedor: ProvedorDeAssinatura, quem: string): Promise<LoginDeAssinatura> {
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

  private async registrar(evento: EventName, provedor: ProvedorDeAssinatura, quem: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "integracao",
        entityId: `ia-assinatura.${provedor}`,
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
