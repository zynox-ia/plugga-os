import { convertLeadResponseSchema, problemasDaConversaoDoLead, type ConvertLeadResponse, type Deal } from "@plugga/shared";
import { enviar, type RespostaDeEnvio } from "./clientes.ts";

/** Converte usando somente o perfil já salvo; edição acontece na ficha do lead. */
export async function converterLead(
  negocio: Pick<Deal, "id" | "lead" | "client">,
  destino?: string,
): Promise<RespostaDeEnvio<ConvertLeadResponse>> {
  const problemas = negocio.client ? [] : problemasDaConversaoDoLead(negocio.lead);
  if (problemas.length) {
    return { ok: false, erro: {
      mensagem: problemas.map((p) => p.problema).join(" "),
      porCampo: Object.fromEntries(problemas.map((p) => [`lead.${p.campo}`, p.problema])),
    } };
  }
  const resolution = destino === "novo" ? { type: "create" } : destino ? { type: "link", clientId: destino } : undefined;
  const resposta = await enviar<unknown>(`/api/leads/${negocio.id}/converter`, "POST", resolution ? { resolution } : {});
  if (!resposta.ok) {
    const problemas = [...new Set(Object.values(resposta.erro.porCampo))];
    return { ok: false, erro: { ...resposta.erro, mensagem: problemas.length ? problemas.join(" ") : resposta.erro.mensagem } };
  }
  const resultado = convertLeadResponseSchema.safeParse(resposta.dados);
  if (!resultado.success || resultado.data.lead.id !== negocio.id || resultado.data.lead.client?.id !== resultado.data.client.id
    || resultado.data.lead.status !== "won" || !resultado.data.lead.closedAt) {
    return { ok: false, erro: { mensagem: "Não foi possível confirmar a conversão. Atualize o quadro para conferir o cliente.", porCampo: {} } };
  }
  return { ok: true, dados: resultado.data };
}
