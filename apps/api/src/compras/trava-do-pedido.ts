import type { Prisma } from "@prisma/client";

/**
 * A trava comum do pedido de compra, até o fim da transação.
 *
 * Tudo que muda o pedido (as ações de Compras e do Financeiro, a edição, os
 * vínculos, cotação e comprovante) e tudo que depende do estado dele para
 * gravar no estoque (a entrada por compra ligada ao pedido) passa por aqui
 * ANTES de travar qualquer item de estoque. A ordem é sempre pedido → item, e
 * a entrada confere o pedido já com as mudanças confirmadas de quem segurou a
 * trava antes (auditoria e revisão de 27/11/2026).
 *
 * É uma trava consultiva (`pg_advisory_xact_lock`), não um `FOR UPDATE` na
 * linha: quem só tem a tela de Estoque não tem política de UPDATE em
 * `pedidos_de_compra`, e um `FOR UPDATE` dentro de função SECURITY DEFINER
 * dependeria de o dono da tabela não estar sob o RLS forçado (o migrador pode
 * não ser superusuário). A trava não lê nem expõe nada do pedido.
 */
export async function travarPedidoDeCompra(tx: Prisma.TransactionClient, pedidoId: string): Promise<void> {
  // A chave vem do uuid canônico (o banco reescreve em minúsculas): o mesmo pedido em outra grafia é a mesma trava.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('compras.pedido'), hashtext(${pedidoId}::uuid::text))`;
}
