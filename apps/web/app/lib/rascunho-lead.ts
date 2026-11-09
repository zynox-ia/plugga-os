import type { DealDetail, LeadContactInput, UpdateLeadRequest } from "@plugga/shared";
import { displayCurrency, parseCurrencyInput } from "../components/ui/currency-value.ts";

type DadosEditaveis = Pick<DealDetail, "lead" | "contact" | "title" | "value" | "expectedCloseDate" | "owner" | "tags" | "customFields" | "solarProject">;

export function criarRascunhoLead(negocio: DadosEditaveis) {
  const contato = negocio.contact;
  return {
    lead: { ...negocio.lead },
    contact: contato ? {
      name: contato.name, jobTitle: contato.jobTitle, role: contato.role,
      phone: contato.phone, phoneIsWhatsapp: contato.phoneIsWhatsapp, email: contato.email,
      isPrimary: contato.isPrimary, cpf: contato.cpf, rg: contato.rg,
    } satisfies LeadContactInput : null as LeadContactInput | null,
    title: negocio.title,
    value: displayCurrency(negocio.value ?? ""),
    expectedCloseDate: negocio.expectedCloseDate ?? "",
    ownerId: negocio.owner.id,
    tagIds: negocio.tags.map((tag) => tag.id),
    customFields: { ...negocio.customFields },
    solarProject: negocio.solarProject === undefined ? undefined : negocio.solarProject === null
      ? { principalUc: null, beneficiaryUcs: [], primaryEnergyBillDocumentId: null }
      : structuredClone(negocio.solarProject),
  };
}

export type RascunhoLead = ReturnType<typeof criarRascunhoLead>;
export const rascunhosIguais = (a: RascunhoLead, b: RascunhoLead) => JSON.stringify(a) === JSON.stringify(b);

/** Só envia campos editados; nomes/IDs e datas de auditoria do contato não são entrada da API. */
export function montarAtualizacaoLead(original: RascunhoLead, atual: RascunhoLead, versao: number): UpdateLeadRequest {
  const corpo: UpdateLeadRequest = { version: versao };
  if (JSON.stringify(original.lead) !== JSON.stringify(atual.lead)) corpo.lead = atual.lead as UpdateLeadRequest["lead"];
  if (JSON.stringify(original.contact) !== JSON.stringify(atual.contact)) corpo.contact = atual.contact;
  if (original.title !== atual.title) corpo.title = atual.title;
  if (original.value !== atual.value) {
    const valor = parseCurrencyInput(atual.value);
    if (valor === undefined) throw new Error("Informe um valor em reais, como 1.234,56.");
    corpo.value = valor || null;
  }
  if (original.expectedCloseDate !== atual.expectedCloseDate) corpo.expectedCloseDate = atual.expectedCloseDate || null;
  if (original.ownerId !== atual.ownerId) corpo.ownerId = atual.ownerId;
  if (JSON.stringify(original.tagIds) !== JSON.stringify(atual.tagIds)) corpo.tagIds = atual.tagIds;
  const campos = Object.fromEntries(Object.keys({ ...original.customFields, ...atual.customFields })
    .filter((id) => original.customFields[id] !== atual.customFields[id])
    .map((id) => [id, atual.customFields[id] ?? null]));
  if (Object.keys(campos).length) corpo.customFields = campos;
  if (atual.solarProject !== undefined && JSON.stringify(original.solarProject) !== JSON.stringify(atual.solarProject)) corpo.solarProject = atual.solarProject;
  return corpo;
}
