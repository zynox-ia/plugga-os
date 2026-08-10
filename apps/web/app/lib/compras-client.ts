"use client";

/**
 * Mutações de Compras a partir do navegador. Batem nas rotas deste app
 * (`app/api/compras/**`), nunca em apps/api direto — a API só escuta na rede
 * interna (ver `lib/compras-proxy.ts`).
 */

export type ComprasResult<T> = { ok: true; data: T } | { ok: false; message: string };

function mensagemDeErro(payload: { issues?: { message: string }[]; message?: string } | null, status: number): string {
  const issues = Array.isArray(payload?.issues)
    ? payload.issues.map((issue) => issue.message).join("; ")
    : null;
  return issues || payload?.message || `falha (${status})`;
}

async function post<T>(caminho: string, corpo: unknown): Promise<ComprasResult<T>> {
  try {
    const resposta = await fetch(`/api/compras/${caminho}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo ?? {}),
    });
    const payload = await resposta.json().catch(() => null);
    if (!resposta.ok) return { ok: false, message: mensagemDeErro(payload, resposta.status) };
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, message: "não foi possível falar com o serviço de compras agora" };
  }
}

/**
 * Criação do pedido: JSON e orçamentos no mesmo envio.
 *
 * Os arquivos vão na ordem do array `cotacoes` do payload — é assim que a API
 * casa cada orçamento com a proposta que ele documenta.
 */
export async function criarPedido(payload: unknown, arquivos: File[]): Promise<ComprasResult<unknown>> {
  const corpo = new FormData();
  corpo.append("payload", JSON.stringify(payload));
  for (const arquivo of arquivos) {
    corpo.append("cotacoes", arquivo);
  }

  try {
    const resposta = await fetch("/api/compras/pedidos", { method: "POST", body: corpo });
    const conteudo = await resposta.json().catch(() => null);
    if (!resposta.ok) return { ok: false, message: mensagemDeErro(conteudo, resposta.status) };
    return { ok: true, data: conteudo };
  } catch {
    return { ok: false, message: "não foi possível enviar o pedido agora" };
  }
}

const comEmpresa = (caminho: string, companyId: string) => `${caminho}?companyId=${companyId}`;

export const triagem = (id: string, companyId: string, corpo: unknown) =>
  post(comEmpresa(`pedidos/${id}/triagem`, companyId), corpo);

export const decidirEstoque = (id: string, companyId: string, corpo: unknown) =>
  post(comEmpresa(`pedidos/${id}/estoque`, companyId), corpo);

export const validarNecessidade = (id: string, companyId: string, corpo: unknown) =>
  post(comEmpresa(`pedidos/${id}/necessidade`, companyId), corpo);

export const selecionarCotacao = (id: string, companyId: string, corpo: unknown) =>
  post(comEmpresa(`pedidos/${id}/cotacao-selecionada`, companyId), corpo);

export const decidirAprovacao = (id: string, companyId: string, corpo: unknown) =>
  post(comEmpresa(`pedidos/${id}/aprovacao`, companyId), corpo);

export const registrarPagamento = (id: string, companyId: string, corpo: unknown) =>
  post(comEmpresa(`pedidos/${id}/pagamento`, companyId), corpo);

export const confirmarRecebimento = (id: string, companyId: string, corpo: unknown) =>
  post(comEmpresa(`pedidos/${id}/recebimento`, companyId), corpo);

export const renegociarPrazo = (id: string, companyId: string, corpo: unknown) =>
  post(comEmpresa(`pedidos/${id}/prazo`, companyId), corpo);

export const criarFornecedor = (corpo: unknown) => post("fornecedores", corpo);
export const criarObra = (corpo: unknown) => post("obras", corpo);
