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
  if (pedidos === "erro") return "Não foi possível carregar os pedidos. Recarregue a lista ou escolha Sem pedido.";
  return pedidos.length ? "Opcional: ligue a entrada ao pedido que trouxe o material." : "Nenhum pedido em aberto espera este item.";
}

/**
 * A escolha do pedido vale só se ele está na lista atual do item. Um pedido
 * escolhido que sumiu (recebeu tudo, foi cancelado), ou que não dá para
 * conferir (lista carregando ou com erro), bloqueia o envio: a entrada nunca
 * vira avulsa sem a pessoa escolher "Sem pedido". `pedidoId` vazio é "Sem pedido".
 */
export function problemaDaEscolhaDoPedido(pedidoId: string, pedidos: PedidosDoItem): string | null {
  if (!pedidoId) return null;
  if (pedidos === "carregando" || pedidos === "sem_item") return "aguarde a lista de pedidos carregar.";
  if (pedidos === "erro") return "não foi possível conferir o pedido escolhido: recarregue a lista ou escolha Sem pedido.";
  return pedidos.some((p) => p.id === pedidoId) ? null : "o pedido escolhido não aceita mais entrada deste item: escolha outro ou Sem pedido.";
}

/** A quantidade não passa do que o pedido ainda espera do item (a API confere de novo, com o item travado). */
export function problemaDaQuantidadeDoPedido(escolhido: PedidoParaEntrada | null, quantidade: number | null, unidade: string): string | null {
  if (!escolhido || quantidade === null) return null;
  return quantidade > Number(escolhido.falta)
    ? `o pedido ${numeroDoPedido(escolhido.numero)} só espera mais ${qtd(escolhido.falta, unidade)} deste item.`
    : null;
}
