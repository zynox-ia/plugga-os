import {
  leadProposalResponseSchema, listLeadProposalsResponseSchema, listLeadProposalTemplatesResponseSchema,
  type LeadProposal, type LeadProposalContent,
} from "@plugga/shared";
import { lerErro } from "./clientes.ts";

export class FalhaProposta extends Error {
  readonly conflito: boolean;
  readonly incerta: boolean;
  constructor(mensagem: string, conflito = false, incerta = false) {
    super(mensagem); this.conflito = conflito; this.incerta = incerta;
  }
}
export const caminhoPropostas = (id: string) => `/api/leads/${id}/propostas`;
export const codigoProposta = (proposta: Pick<LeadProposal, "number">) => `PC-${String(proposta.number).padStart(4, "0")}`;
export const dataDaProposta = (data: string) => data.split("-").reverse().join("/");

async function requisitar(url: string, init?: RequestInit): Promise<unknown> {
  const mutacao = init?.method === "POST" || init?.method === "PATCH";
  let resposta: Response;
  try { resposta = await fetch(url, { cache: "no-store", ...init }); }
  catch { throw new FalhaProposta(mutacao ? "Não foi possível confirmar a operação. Confira a lista antes de tentar novamente; seu texto foi preservado." : "Sem conexão. Tente carregar as propostas novamente.", false, mutacao); }
  let corpo: unknown;
  try { corpo = await resposta.json(); }
  catch { throw new FalhaProposta("Resposta incompleta. Confira a lista para confirmar a operação.", false, mutacao); }
  if (!resposta.ok) throw new FalhaProposta(lerErro(corpo, "Não foi possível concluir a operação.").mensagem, resposta.status === 409, mutacao && resposta.status >= 500);
  return corpo;
}
export async function carregarPropostas(id: string, signal?: AbortSignal) {
  const resultado = listLeadProposalsResponseSchema.safeParse(await requisitar(caminhoPropostas(id), { signal }));
  if (!resultado.success || resultado.data.proposals.some((proposta) => proposta.dealId !== id)) throw new FalhaProposta("Resposta incompleta ao carregar propostas. Tente novamente.");
  return resultado.data.proposals;
}
export async function carregarModelos(id: string, signal?: AbortSignal) {
  const resultado = listLeadProposalTemplatesResponseSchema.safeParse(await requisitar(`${caminhoPropostas(id)}/modelos`, { signal }));
  if (!resultado.success) throw new FalhaProposta("Resposta incompleta ao carregar modelos. Tente novamente.");
  return resultado.data.templates;
}
async function mutar(id: string, url: string, method: "POST" | "PATCH", body: object) {
  const resultado = leadProposalResponseSchema.safeParse(await requisitar(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  if (!resultado.success || resultado.data.proposal.dealId !== id) throw new FalhaProposta("Não foi possível confirmar a operação. Confira a lista antes de tentar novamente.", false, true);
  return resultado.data.proposal;
}
export function salvarProposta(id: string, templateId: string, content: LeadProposalContent, atual: Pick<LeadProposal, "id" | "revision"> | null) {
  return mutar(id, `${caminhoPropostas(id)}${atual ? `/${atual.id}` : ""}`, atual ? "PATCH" : "POST", { templateId, content, ...(atual ? { revision: atual.revision } : {}) });
}
export function gerarProposta(id: string, atual: Pick<LeadProposal, "id" | "revision">) {
  return mutar(id, `${caminhoPropostas(id)}/${atual.id}/gerar`, "POST", { revision: atual.revision });
}
