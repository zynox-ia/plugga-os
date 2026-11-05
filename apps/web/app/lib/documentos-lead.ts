import { LEAD_DOCUMENT_MAX_BYTES, leadDocumentSchema, type LeadDocument, type LeadDocumentCategory } from "@plugga/shared";
import { lerErro } from "./clientes.ts";

export function validarArquivoDocumento(arquivo: Pick<File, "size">): string | null {
  if (arquivo.size === 0) return "O arquivo está vazio.";
  if (arquivo.size > LEAD_DOCUMENT_MAX_BYTES) return "O arquivo deve ter até 25 MB.";
  return null;
}

export async function enviarDocumentoDoLead(id: string, arquivo: File, categoria: LeadDocumentCategory): Promise<LeadDocument> {
  const erro = validarArquivoDocumento(arquivo);
  if (erro) throw new Error(erro);
  const body = new FormData(); body.append("arquivo", arquivo); body.append("category", categoria);
  let resposta: Response;
  try { resposta = await fetch(`/api/leads/${id}/documentos`, { method: "POST", body }); }
  catch { throw new Error("Sem conexão. O arquivo foi preservado; confira a lista antes de tentar novamente."); }
  let dados: unknown;
  try { dados = await resposta.json(); }
  catch { throw new Error("Não foi possível confirmar o envio. Atualize a lista antes de tentar novamente."); }
  if (!resposta.ok) throw new Error(lerErro(dados, "Não foi possível enviar o arquivo.").mensagem);
  const documento = leadDocumentSchema.safeParse(dados);
  if (!documento.success || documento.data.dealId !== id) throw new Error("Resposta incompleta. Atualize a lista para conferir se o arquivo foi enviado.");
  return documento.data;
}

export const CATEGORIAS_DOCUMENTOS: Record<LeadDocumentCategory, string> = {
  proposta: "Proposta", conta_de_energia: "Conta de energia", documento_do_cliente: "Documento", procuracao_contrato: "Contrato", outros: "Outros",
};
export const FORMATOS_DOCUMENTO = ".pdf,.jpg,.jpeg,.png,.docx,.xlsx";
export function tamanhoDocumento(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
