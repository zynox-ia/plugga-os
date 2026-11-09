import type { LeadDocument } from "@plugga/shared";

type DocumentoDaFicha = Pick<LeadDocument, "id" | "dealId" | "category" | "originalName" | "archivedAt">;

/** A seleção ausente permanece explícita; carregar documentos nunca troca ou limpa o vínculo. */
export function contasDeEnergiaDaFicha(documentos: readonly DocumentoDaFicha[], negocioId: string, selecionadoId: string | null) {
  const doNegocio = documentos.filter((documento) => documento.dealId === negocioId);
  const opcoes = doNegocio
    .filter((documento) => documento.category === "conta_de_energia" && documento.archivedAt === null)
    .map((documento) => ({ id: documento.id, nome: documento.originalName, indisponivel: false }));
  const selecionadaIndisponivel = selecionadoId !== null && !opcoes.some((opcao) => opcao.id === selecionadoId);
  if (selecionadoId && selecionadaIndisponivel) {
    const anterior = doNegocio.find((documento) => documento.id === selecionadoId);
    opcoes.push({ id: selecionadoId, nome: anterior ? `${anterior.originalName} (indisponível)` : "Conta de energia indisponível", indisponivel: true });
  }
  return { opcoes, selecionadaIndisponivel };
}
