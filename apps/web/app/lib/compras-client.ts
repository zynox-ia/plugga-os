"use client";

import {
  confirmarRecebimentoRequestSchema,
  criarFornecedorRequestSchema,
  criarObraRequestSchema,
  criarPedidoRequestSchema,
  decisaoAprovacaoRequestSchema,
  decisaoEstoqueRequestSchema,
  registrarPagamentoRequestSchema,
  renegociarPrazoRequestSchema,
  selecionarCotacaoRequestSchema,
  triagemRequestSchema,
  validarNecessidadeRequestSchema,
} from "@plugga/shared";

import { mensagemDeFalha, postarJson, validarCorpo, type EntradaDe } from "./requisicao";

/**
 * Mutações de Compras a partir do navegador. Batem nas rotas deste app
 * (`app/api/compras/**`), nunca em apps/api direto — a API só escuta na rede
 * interna (ver `lib/proxy.ts`). Cada corpo é validado com o schema de
 * `@plugga/shared` antes do envio (US12, T122, FR-060).
 */

export type ComprasResult<T> = { ok: true; data: T } | { ok: false; message: string };

const SEM_SERVICO = "não foi possível falar com o serviço de compras agora";

/**
 * Criação do pedido: JSON e orçamentos no mesmo envio.
 *
 * Os arquivos vão na ordem do array `cotacoes` do payload — é assim que a API
 * casa cada orçamento com a proposta que ele documenta.
 */
export async function criarPedido(
  payload: EntradaDe<typeof criarPedidoRequestSchema>,
  arquivos: File[],
): Promise<ComprasResult<unknown>> {
  const validado = validarCorpo(criarPedidoRequestSchema, payload);
  if (!validado.ok) return { ok: false, message: validado.message };

  const corpo = new FormData();
  corpo.append("payload", JSON.stringify(validado.dados));
  for (const arquivo of arquivos) {
    corpo.append("cotacoes", arquivo);
  }

  try {
    const resposta = await fetch("/api/compras/pedidos", { method: "POST", body: corpo });
    const conteudo = await resposta.json().catch(() => null);
    if (!resposta.ok) return { ok: false, message: mensagemDeFalha(conteudo, resposta.status) };
    return { ok: true, data: conteudo };
  } catch {
    return { ok: false, message: "não foi possível enviar o pedido agora" };
  }
}

const rotaDoPedido = (id: string, etapa: string, companyId: string) =>
  `/api/compras/pedidos/${encodeURIComponent(id)}/${etapa}?${new URLSearchParams({ companyId })}`;

export const triagem = (id: string, companyId: string, corpo: EntradaDe<typeof triagemRequestSchema>) =>
  postarJson(rotaDoPedido(id, "triagem", companyId), triagemRequestSchema, corpo, SEM_SERVICO);

export const decidirEstoque = (id: string, companyId: string, corpo: EntradaDe<typeof decisaoEstoqueRequestSchema>) =>
  postarJson(rotaDoPedido(id, "estoque", companyId), decisaoEstoqueRequestSchema, corpo, SEM_SERVICO);

export const validarNecessidade = (
  id: string,
  companyId: string,
  corpo: EntradaDe<typeof validarNecessidadeRequestSchema>,
) => postarJson(rotaDoPedido(id, "necessidade", companyId), validarNecessidadeRequestSchema, corpo, SEM_SERVICO);

export const selecionarCotacao = (
  id: string,
  companyId: string,
  corpo: EntradaDe<typeof selecionarCotacaoRequestSchema>,
) => postarJson(rotaDoPedido(id, "cotacao-selecionada", companyId), selecionarCotacaoRequestSchema, corpo, SEM_SERVICO);

export const decidirAprovacao = (
  id: string,
  companyId: string,
  corpo: EntradaDe<typeof decisaoAprovacaoRequestSchema>,
) => postarJson(rotaDoPedido(id, "aprovacao", companyId), decisaoAprovacaoRequestSchema, corpo, SEM_SERVICO);

export const registrarPagamento = (
  id: string,
  companyId: string,
  corpo: EntradaDe<typeof registrarPagamentoRequestSchema>,
) => postarJson(rotaDoPedido(id, "pagamento", companyId), registrarPagamentoRequestSchema, corpo, SEM_SERVICO);

export const confirmarRecebimento = (
  id: string,
  companyId: string,
  corpo: EntradaDe<typeof confirmarRecebimentoRequestSchema>,
) => postarJson(rotaDoPedido(id, "recebimento", companyId), confirmarRecebimentoRequestSchema, corpo, SEM_SERVICO);

export const renegociarPrazo = (
  id: string,
  companyId: string,
  corpo: EntradaDe<typeof renegociarPrazoRequestSchema>,
) => postarJson(rotaDoPedido(id, "prazo", companyId), renegociarPrazoRequestSchema, corpo, SEM_SERVICO);

export const criarFornecedor = (corpo: EntradaDe<typeof criarFornecedorRequestSchema>) =>
  postarJson("/api/compras/fornecedores", criarFornecedorRequestSchema, corpo, SEM_SERVICO);

export const criarObra = (corpo: EntradaDe<typeof criarObraRequestSchema>) =>
  postarJson("/api/compras/obras", criarObraRequestSchema, corpo, SEM_SERVICO);
