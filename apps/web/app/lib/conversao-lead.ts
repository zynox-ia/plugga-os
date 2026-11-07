import { convertLeadResponseSchema, problemasDaConversaoDoLead, type ConvertLeadResponse, type Deal } from "@plugga/shared";
import { enviar, type RespostaDeEnvio } from "./clientes.ts";
import { negocioConvertido } from "./negocios.ts";

/** Converte usando somente o perfil já salvo; edição acontece na ficha do lead. */
export async function converterLead(
  negocio: Pick<Deal, "id" | "lead" | "client"> & { converted?: boolean },
  destino?: string,
  podeVerClientes = true,
): Promise<RespostaDeEnvio<ConvertLeadResponse>> {
  if (destino && !podeVerClientes) {
    return { ok: false, erro: { mensagem: "A escolha de cadastro exige acesso à tela Clientes.", porCampo: {} } };
  }
  const problemas = negocioConvertido(negocio) ? [] : problemasDaConversaoDoLead(negocio.lead);
  if (problemas.length) {
    return { ok: false, erro: {
      mensagem: problemas.map((p) => p.problema).join(" "),
      porCampo: Object.fromEntries(problemas.map((p) => [`lead.${p.campo}`, p.problema])),
    } };
  }
  const resolution = destino === "novo" ? { type: "create" } : destino ? { type: "link", clientId: destino } : undefined;
  const resposta = await enviar<unknown>(`/api/leads/${negocio.id}/converter`, "POST", resolution ? { resolution } : {});
  if (!resposta.ok) {
    if (!podeVerClientes && resposta.erro.candidatos?.length) {
      return { ok: false, erro: { mensagem: "Não foi possível concluir a conversão. Peça à gestão para verificar os cadastros.", porCampo: {} } };
    }
    const problemas = [...new Set(Object.values(resposta.erro.porCampo))];
    return { ok: false, erro: { ...resposta.erro, mensagem: problemas.length ? problemas.join(" ") : resposta.erro.mensagem } };
  }
  const resultado = convertLeadResponseSchema.safeParse(resposta.dados);
  if (!resultado.success || resultado.data.lead.id !== negocio.id || !negocioConvertido(resultado.data.lead)
    || (resultado.data.client !== null && resultado.data.lead.client?.id !== resultado.data.client.id)
    || (resultado.data.client === null && resultado.data.lead.client !== null)
    || resultado.data.lead.status !== "won" || !resultado.data.lead.closedAt) {
    return { ok: false, erro: { mensagem: "Não foi possível confirmar a conversão. Atualize o quadro para conferir o lead.", porCampo: {} } };
  }
  return { ok: true, dados: resultado.data };
}
