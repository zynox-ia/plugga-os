import type { PedidoParaEntrada } from "@plugga/shared";

import { numeroDoPedido } from "./compras.ts";
import { qtd } from "./estoque.ts";

/**
 * Entrada de origem "Compra" do registro de movimentação (PLU-333): a escolha do
 * pedido vem da rota do Estoque, com os pedidos que ainda aceitam entrada do
 * item escolhido. Quem só tem a tela de Estoque não lê a lista de Compras.
 */

/** Estado da lista de pedidos do item: ainda sem item, carregando, falhou ou carregada. */
export type PedidosDoItem = PedidoParaEntrada[] | "erro" | "carregando" | "sem_item";

export function opcaoDoPedido(p: PedidoParaEntrada, unidade: string): { value: string; label: string; description: string } {
  return { value: p.id, label: `${numeroDoPedido(p.numero)} · ${p.titulo}`, description: `Faltam ${qtd(p.falta, unidade)} de ${qtd(p.pedida, unidade)}` };
}

/** A dica abaixo do campo Pedido de compra. */
export function dicaDoPedido(pedidos: PedidosDoItem, escolhido: PedidoParaEntrada | null, unidade: string): string {
  if (escolhido) return `Faltam ${qtd(escolhido.falta, unidade)} de ${qtd(escolhido.pedida, unidade)} pedidos deste item.`;
  if (pedidos === "sem_item") return "Escolha o item para ver os pedidos com ele.";
  if (pedidos === "carregando") return "Carregando os pedidos deste item…";
  if (pedidos === "erro") return "Não foi possível carregar os pedidos. Registre sem pedido ou tente de novo.";
  return pedidos.length ? "Opcional: ligue a entrada ao pedido que trouxe o material." : "Nenhum pedido em aberto espera este item.";
}

/** A quantidade não passa do que o pedido ainda espera do item (a API confere de novo, com o item travado). */
export function problemaDaQuantidadeDoPedido(escolhido: PedidoParaEntrada | null, quantidade: number | null, unidade: string): string | null {
  if (!escolhido || quantidade === null) return null;
  return quantidade > Number(escolhido.falta)
    ? `o pedido ${numeroDoPedido(escolhido.numero)} só espera mais ${qtd(escolhido.falta, unidade)} deste item.`
    : null;
}
