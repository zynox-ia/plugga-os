import type { ConvertLeadResponse, Deal } from "@plugga/shared";
import { enviar, type RespostaDeEnvio } from "./clientes.ts";

export type DadosDeConversao = { nome: string; documento: string; telefone: string; email: string };

export function dadosDeConversao(lead: Deal["lead"]): DadosDeConversao {
  return { nome: lead.name, documento: lead.document ?? "", telefone: lead.phone ?? "", email: lead.email ?? "" };
}

export function erroCampoConversao(erros: Record<string, string>, campo: "name" | "document" | "phone" | "email") {
  const aliases = { name: "nome", document: "documento", phone: "telefone", email: "email" };
  return erros[`lead.${campo}`] || erros[campo] || erros[aliases[campo]];
}

/** Salva o perfil editado antes de pedir sua conversão em cliente. */
export async function converterLead(
  negocio: Pick<Deal, "id" | "lead">,
  rascunho: DadosDeConversao,
  destino: string,
  aoAtualizar: (negocio: Deal) => void,
): Promise<RespostaDeEnvio<ConvertLeadResponse>> {
  const original = dadosDeConversao(negocio.lead);
  const alterou = rascunho.nome !== original.nome || rascunho.documento !== original.documento || rascunho.telefone !== original.telefone || rascunho.email !== original.email;
  if (alterou) {
    const resposta = await enviar<Deal>(`/api/leads/${negocio.id}`, "PATCH", {
      lead: { name: rascunho.nome.trim(), document: rascunho.documento.trim() || null, phone: rascunho.telefone.trim() || null, email: rascunho.email.trim() || null },
    });
    if (!resposta.ok) return resposta;
    aoAtualizar(resposta.dados);
  }
  const resolution = destino === "novo" ? { type: "create" } : destino ? { type: "link", clientId: destino } : undefined;
  return enviar<ConvertLeadResponse>(`/api/leads/${negocio.id}/converter`, "POST", resolution ? { resolution } : {});
}
