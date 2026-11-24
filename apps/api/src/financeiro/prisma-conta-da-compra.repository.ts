import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { ContaAPagarDoPedido } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { EstadoInvalido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { codigoDoLancamento } from "./financeiro.rules";
import { ReflexosDoLancamento } from "./reflexo-do-lancamento";

/** As recusas da função, que não deveriam acontecer logo depois da aprovação. */
const RECUSAS_DA_FUNCAO = /CONTA_DA_COMPRA_(SO_NA_APROVACAO|SEM_SESSAO)/;
const RECUSAS_DO_CANCELAMENTO = /CANCELAMENTO_DA_COMPRA_(SO_COM_O_PEDIDO|SEM_SESSAO)/;

/**
 * A conta a pagar que nasce do pedido de compra aprovado (W3, PLU-341). Compras chama na
 * transação da aprovação; o banco cria a conta pela função do Financeiro, que deriva tudo
 * do pedido (empresa, fornecedor, valor da cotação vencedora e vencimento), porque quem
 * aprova em Compras não precisa ter o Financeiro. Com o Financeiro desligado (o portão),
 * nada acontece e Compras segue como antes.
 */
@Injectable()
export class PrismaContaDaCompraRepository {
  private readonly logger = new Logger(PrismaContaDaCompraRepository.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
    @Optional() @Inject(ReflexosDoLancamento) private readonly reflexos: ReflexosDoLancamento = new ReflexosDoLancamento(),
  ) {}

  private get ligado(): boolean {
    return this.config.get<boolean>("FINANCEIRO_LIGADO") === true;
  }

  /** Cria a conta do pedido recém-aprovado (ou devolve a que já existe). Nulo com o Financeiro desligado. */
  async criarNaAprovacao(tx: Prisma.TransactionClient, pedidoId: string, principal: AuthPrincipal): Promise<string | null> {
    if (!this.ligado) return null;
    let linha: { id: string; criada: boolean; company_id: string } | undefined;
    try {
      [linha] = await tx.$queryRaw<{ id: string; criada: boolean; company_id: string }[]>`
        SELECT id, criada, company_id FROM plugga_security.financeiro_conta_da_compra(${pedidoId}::uuid)`;
    } catch (erro) {
      // Resposta clara em Compras, e o código da recusa no log.
      const motivo = erro instanceof Error ? RECUSAS_DA_FUNCAO.exec(erro.message)?.[0] : undefined;
      if (motivo) {
        this.logger.warn(`conta a pagar do pedido ${pedidoId} recusada pelo banco: ${motivo}`);
        throw new EstadoInvalido("Não foi possível gerar a conta a pagar deste pedido; avise o Financeiro.");
      }
      throw erro;
    }
    if (!linha) return null;
    // O evento da conta nova, como o de toda conta; no retorno idempotente, nada.
    if (linha.criada) {
      await this.auditoria.append(tx, {
        eventName: "financeiro.lancamento.created",
        entityType: "lancamento",
        entityId: linha.id,
        companyId: linha.company_id,
        actorType: principal.kind === "user" ? "user" : "agent",
        actorId: principal.id,
        payload: { tipo: "saida", origem: "pedido_de_compra" },
        occurredAt: new Date(),
      });
    }
    return linha.id;
  }

  /**
   * O pedido recém-cancelado cancela a conta dele (W3c), com o mesmo motivo, se ela ainda
   * não foi paga; a paga fica como está (o estorno é do Financeiro). Os conectores ouvem
   * o cancelamento como o de qualquer conta.
   */
  async cancelarComOPedido(tx: Prisma.TransactionClient, pedidoId: string, motivo: string, principal: AuthPrincipal): Promise<void> {
    if (!this.ligado) return;
    let canceladas: { id: string; company_id: string; etapa: "aberta" | "aprovada" }[];
    try {
      canceladas = await tx.$queryRaw<{ id: string; company_id: string; etapa: "aberta" | "aprovada" }[]>`
        SELECT id, company_id, etapa FROM plugga_security.financeiro_cancelar_conta_da_compra(${pedidoId}::uuid, ${motivo})`;
    } catch (erro) {
      // Resposta clara em Compras, e o código da recusa no log.
      const recusa = erro instanceof Error ? RECUSAS_DO_CANCELAMENTO.exec(erro.message)?.[0] : undefined;
      if (recusa) {
        this.logger.warn(`cancelamento da conta do pedido ${pedidoId} recusado pelo banco: ${recusa}`);
        throw new EstadoInvalido("Não foi possível cancelar a conta a pagar deste pedido; avise o Financeiro.");
      }
      throw erro;
    }
    for (const conta of canceladas) {
      // O motivo fica no lançamento: texto livre não entra no evento.
      await this.auditoria.append(tx, {
        eventName: "financeiro.lancamento.cancelado",
        entityType: "lancamento",
        entityId: conta.id,
        companyId: conta.company_id,
        actorType: principal.kind === "user" ? "user" : "agent",
        actorId: principal.id,
        payload: { etapa: conta.etapa, comMotivo: true, origem: "pedido_de_compra" },
        occurredAt: new Date(),
      });
      await this.reflexos.aoMudar(tx, { lancamentoId: conta.id, empresa: conta.company_id, tipo: "saida", etapaAntes: conta.etapa, mudanca: "cancelado", porId: principal.id });
    }
  }

  /** A conta de cada pedido, para a ficha de Compras. Vazio com o Financeiro desligado. */
  async contasDosPedidos(tx: Prisma.TransactionClient, pedidoIds: readonly string[]): Promise<Map<string, ContaAPagarDoPedido>> {
    if (!this.ligado || pedidoIds.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ pedido_id: string; id: string; numero: number; etapa: ContaAPagarDoPedido["etapa"]; cancelado: boolean }[]>`
      SELECT pedido_id, id, numero, etapa, cancelado FROM plugga_security.contas_a_pagar_dos_pedidos(${[...pedidoIds]}::uuid[])`;
    return new Map(linhas.map((l) => [l.pedido_id, { id: l.id, codigo: codigoDoLancamento("saida", l.numero), etapa: l.etapa, cancelado: l.cancelado }]));
  }
}
