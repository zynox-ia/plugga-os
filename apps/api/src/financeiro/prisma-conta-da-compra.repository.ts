import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import type { ContaAPagarDoPedido } from "@plugga/shared";

import { codigoDoLancamento } from "./financeiro.rules";

/**
 * A conta a pagar que nasce do pedido de compra aprovado (W3, PLU-341). Compras chama na
 * transação da aprovação; o banco cria a conta pela função do Financeiro, que deriva tudo
 * do pedido (empresa, fornecedor, valor da cotação vencedora e vencimento), porque quem
 * aprova em Compras não precisa ter o Financeiro. Com o Financeiro desligado (o portão),
 * nada acontece e Compras segue como antes.
 */
@Injectable()
export class PrismaContaDaCompraRepository {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private get ligado(): boolean {
    return this.config.get<boolean>("FINANCEIRO_LIGADO") === true;
  }

  /** Cria a conta do pedido recém-aprovado (ou devolve a que já existe). Nulo com o Financeiro desligado. */
  async criarNaAprovacao(tx: Prisma.TransactionClient, pedidoId: string): Promise<string | null> {
    if (!this.ligado) return null;
    const [linha] = await tx.$queryRaw<{ id: string }[]>`SELECT plugga_security.financeiro_conta_da_compra(${pedidoId}::uuid) AS id`;
    return linha?.id ?? null;
  }

  /** A conta de cada pedido, para a ficha de Compras. Vazio com o Financeiro desligado. */
  async contasDosPedidos(tx: Prisma.TransactionClient, pedidoIds: readonly string[]): Promise<Map<string, ContaAPagarDoPedido>> {
    if (!this.ligado || pedidoIds.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ pedido_id: string; id: string; numero: number; etapa: ContaAPagarDoPedido["etapa"]; cancelado: boolean }[]>`
      SELECT pedido_id, id, numero, etapa, cancelado FROM plugga_security.contas_a_pagar_dos_pedidos(${[...pedidoIds]}::uuid[])`;
    return new Map(linhas.map((l) => [l.pedido_id, { id: l.id, codigo: codigoDoLancamento("saida", l.numero), etapa: l.etapa, cancelado: l.cancelado }]));
  }
}
