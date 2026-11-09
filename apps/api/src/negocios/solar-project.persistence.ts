import type { Prisma } from "@prisma/client";
import { dealSolarProjectSchema, type DealHistoryValue, type DealSolarProject } from "@plugga/shared";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { lerPerfilDeProcesso } from "../pipelines/solar-profile.rules";

export const lerProjetoSolar = (value: unknown): DealSolarProject | null =>
  value === null || value === undefined ? null : dealSolarProjectSchema.parse(value);

/** Referência igual pode continuar arquivada/reclassificada; gates futuros revalidam avanço. */
export async function prepararProjetoSolar(
  tx: Prisma.TransactionClient, profile: unknown, dealId: string,
  input: DealSolarProject, previous: unknown,
): Promise<{ project: DealSolarProject; changes: { field: string; before: DealHistoryValue; after: DealHistoryValue }[] }> {
  const invalid = (campo: string, message: string) => new RequisicaoInvalida(message, [{ campo: `solarProject.${campo}`, problema: message }]);
  if (!lerPerfilDeProcesso(profile)) throw invalid("", "Esta ficha pertence a um pipeline associado ao processo Solar.");
  const project = dealSolarProjectSchema.parse(input);
  const before = lerProjetoSolar(previous);
  const documentId = project.primaryEnergyBillDocumentId;
  const previousId = before?.primaryEnergyBillDocumentId ?? null;
  const changedDocument = documentId !== previousId;
  if (changedDocument && documentId) {
    // Serializa seleção com arquivamento/reclassificação do próprio documento.
    await tx.$queryRaw`SELECT id FROM lead_documents WHERE id = ${documentId}::uuid AND deal_id = ${dealId}::uuid FOR SHARE`;
    const document = await tx.leadDocument.findFirst({
      where: { id: documentId, dealId, category: "conta_de_energia", uploadState: "ready", archivedAt: null }, select: { id: true },
    });
    if (!document) throw invalid("primaryEnergyBillDocumentId", "Selecione uma conta de energia disponível deste negócio.");
  }
  const changes: { field: string; before: DealHistoryValue; after: DealHistoryValue }[] = [];
  const compare = (field: string, before: DealHistoryValue, after: DealHistoryValue) => {
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ field: `solar:${field}`, before, after });
  };
  compare("principalUc", before?.principalUc?.code ?? null, project.principalUc?.code ?? null);
  compare("beneficiaryUcs", (before?.beneficiaryUcs ?? []).map(({ id, code }) => ({ id, name: code })), project.beneficiaryUcs.map(({ id, code }) => ({ id, name: code })));
  if (changedDocument) {
    const ids = [previousId, documentId].filter((id): id is string => id !== null);
    const documents = ids.length ? await tx.leadDocument.findMany({ where: { id: { in: ids }, dealId }, select: { id: true, originalName: true } }) : [];
    const reference = (id: string | null) => id ? { id, name: documents.find((d) => d.id === id)?.originalName ?? id } : null;
    compare("primaryEnergyBillDocumentId", reference(previousId), reference(documentId));
  }
  return { project, changes };
}
