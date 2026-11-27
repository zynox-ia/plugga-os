import type { Acesso, Movimentacao } from "@plugga/shared";

import { podeAbrirPagina } from "./acesso-paginas.ts";
import { hrefDeCompras, numeroDoPedido } from "./compras.ts";
import { hrefDasObras } from "./obras.ts";
import { podeCriarPedido } from "./papel-em-compras.ts";
import type { AmbienteDosRecursos } from "./recursos.ts";

/**
 * Estoque (PLU-333): o que a pessoa alcança fora da tela. As telas de Estoque
 * mostram sempre o texto; o link e o botão só vão para quem chega ao destino.
 */

export type AcessoDoEstoque = {
  /** Abre a ficha do pedido: Compras, ou o Financeiro, que aprova e paga. */
  abrePedidos: boolean;
  /** A reposição cria um pedido, e a API exige a tela de Compras para isso. */
  criaPedidos: boolean;
  abreObras: boolean;
  abreClientes: boolean;
};

/** `ambiente` só existe para o teste do portão da Engenharia; a tela usa o do build. */
export function acessoDoEstoque(acesso: Acesso, ambiente?: AmbienteDosRecursos): AcessoDoEstoque {
  return {
    abrePedidos: podeAbrirPagina(acesso, "/suprimentos/compras", ambiente),
    criaPedidos: podeCriarPedido(acesso),
    abreObras: podeAbrirPagina(acesso, "/engenharia/obras", ambiente),
    abreClientes: podeAbrirPagina(acesso, "/clientes", ambiente),
  };
}

/** A ficha do pedido, na lista que inclui concluídos e cancelados. Nulo para quem não abre Compras. */
export const hrefDoPedido = (id: string, acesso: AcessoDoEstoque): string | null =>
  acesso.abrePedidos ? hrefDeCompras({ visao: "lista", situacao: "todos" }, id) : null;

export type ParteDaOrigem = { texto: string; href: string | null };

/**
 * "Origem ou destino" em trechos, cada um com a sua tela: a obra ou o cliente da
 * saída e, no fim, o pedido ("Obra Santa Tereza · PC-0012"). O texto é o da API;
 * nos outros tipos o primeiro trecho é o motivo ("Compra", "Reserva"), sem link.
 */
export function partesDaOrigem(m: Pick<Movimentacao, "tipo" | "destino" | "obra" | "cliente" | "pedido" | "origemOuDestino">, acesso: AcessoDoEstoque): ParteDaOrigem[] {
  const numero = m.pedido ? numeroDoPedido(m.pedido.numero) : null;
  const comPedido = numero !== null && m.origemOuDestino.endsWith(` · ${numero}`);
  const texto = comPedido ? m.origemOuDestino.slice(0, -` · ${numero}`.length) : m.origemOuDestino;
  let href: string | null = null;
  if (m.tipo === "saida" && m.destino === "obra" && m.obra && acesso.abreObras) href = hrefDasObras({}, m.obra.id);
  if (m.tipo === "saida" && m.destino === "cliente" && m.cliente && acesso.abreClientes) href = `/clientes?cliente=${m.cliente.id}`;
  return [{ texto, href }, ...(comPedido ? [{ texto: numero, href: hrefDoPedido(m.pedido!.id, acesso) }] : [])];
}
