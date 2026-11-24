import {
  createLeadSolarProjectRequestSchema,
  leadSolarProjectResponseSchema,
  listLeadSolarProjectsResponseSchema,
  type CreateLeadSolarProjectRequest,
  type LeadSolarInstallationType,
  type LeadSolarProject,
  type LeadSolarRoofType,
} from "@plugga/shared";

import { enviar, lerErro } from "./clientes.ts";

export const ROTULO_INSTALACAO_SOLAR: Record<LeadSolarInstallationType, string> = {
  residential: "Residencial",
  commercial: "Comercial",
  rural: "Rural",
};

export const ROTULO_TELHADO_SOLAR: Record<LeadSolarRoofType, string> = {
  metalico: "Metálico",
  ceramico: "Cerâmico",
  fibra: "Fibra",
  cimento: "Cimento",
  laje: "Laje",
  solo: "Solo",
  outro: "Outro",
};

export type RascunhoProjetoSolar = {
  installationType: LeadSolarInstallationType | "";
  averageConsumptionKwh: string;
  consumerUnit: string;
  beneficiaryUcs: { id: string; code: string }[];
  energyBillDocumentIds: string[];
  roofType: LeadSolarRoofType | "";
  availableAreaM2: string;
  estimatedPowerKwp: string;
  estimatedInvestment: string;
};

export function rascunhoProjetoSolarVazio(): RascunhoProjetoSolar {
  return {
    installationType: "",
    averageConsumptionKwh: "",
    consumerUnit: "",
    beneficiaryUcs: [],
    energyBillDocumentIds: [],
    roofType: "",
    availableAreaM2: "",
    estimatedPowerKwp: "",
    estimatedInvestment: "",
  };
}

export function projetoParaRascunho(projeto: LeadSolarProject): RascunhoProjetoSolar {
  return {
    installationType: projeto.installationType,
    averageConsumptionKwh: projeto.averageConsumptionKwh,
    consumerUnit: projeto.consumerUnit,
    beneficiaryUcs: projeto.beneficiaryUcs.map((uc) => ({ ...uc })),
    energyBillDocumentIds: [...projeto.energyBillDocumentIds],
    roofType: projeto.roofType ?? "",
    availableAreaM2: projeto.availableAreaM2 ?? "",
    estimatedPowerKwp: projeto.estimatedPowerKwp ?? "",
    estimatedInvestment: projeto.estimatedInvestment ?? "",
  };
}

function paraEnvio(rascunho: RascunhoProjetoSolar) {
  return {
    installationType: rascunho.installationType || undefined,
    averageConsumptionKwh: rascunho.averageConsumptionKwh,
    consumerUnit: rascunho.consumerUnit,
    beneficiaryUcs: rascunho.beneficiaryUcs.filter((uc) => uc.code.trim()),
    energyBillDocumentIds: rascunho.energyBillDocumentIds,
    roofType: rascunho.roofType,
    availableAreaM2: rascunho.availableAreaM2,
    estimatedPowerKwp: rascunho.estimatedPowerKwp,
    estimatedInvestment: rascunho.estimatedInvestment,
  };
}

/** Só tipo de instalação, consumo e UC principal são obrigatórios; o resto pode vir depois. */
export function validarRascunhoProjetoSolar(rascunho: RascunhoProjetoSolar): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!rascunho.installationType) erros.installationType = "Selecione o tipo de instalação.";
  const parse = createLeadSolarProjectRequestSchema.safeParse({ ...paraEnvio(rascunho), installationType: rascunho.installationType || "residential" });
  if (!parse.success) {
    for (const issue of parse.error.issues) {
      const campo = issue.path[0] === "beneficiaryUcs" ? "beneficiaryUcs" : String(issue.path[0] ?? "");
      if (!campo || erros[campo]) continue;
      erros[campo] = issue.message;
    }
  }
  return erros;
}

export function rascunhoParaCriacao(rascunho: RascunhoProjetoSolar, version: number): CreateLeadSolarProjectRequest {
  return createLeadSolarProjectRequestSchema.parse({ ...paraEnvio(rascunho), version });
}

export function tituloDoProjetoSolar(projeto: LeadSolarProject): string {
  return `${ROTULO_INSTALACAO_SOLAR[projeto.installationType]} · UC ${projeto.consumerUnit}`;
}

export async function listarProjetosSolaresDoLead(negocioId: string, signal?: AbortSignal): Promise<LeadSolarProject[]> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api/leads/${negocioId}/projetos-solares`, { method: "GET", cache: "no-store", signal });
  } catch (erro) {
    if (signal?.aborted || (erro instanceof DOMException && erro.name === "AbortError")) throw erro;
    throw new Error("Sem conexão. Tente carregar os projetos novamente.");
  }
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error(lerErro(dados, "Não foi possível carregar os projetos.").mensagem);
  const lista = listLeadSolarProjectsResponseSchema.safeParse(dados);
  if (!lista.success) throw new Error("Não foi possível interpretar a lista de projetos.");
  return lista.data.projects;
}

export type ProjetoSalvo = { project: LeadSolarProject; advancedToProposal: boolean };

/** `version` é a versão do lead lida pela tela; o servidor recusa se outra pessoa alterou antes. */
export async function salvarProjetoSolarDoLead(
  negocioId: string, projetoId: string | null, rascunho: RascunhoProjetoSolar, version: number,
): Promise<ProjetoSalvo> {
  const resposta = await enviar<unknown>(
    projetoId ? `/api/leads/${negocioId}/projetos-solares/${projetoId}` : `/api/leads/${negocioId}/projetos-solares`,
    projetoId ? "PATCH" : "POST",
    rascunhoParaCriacao(rascunho, version),
  );
  if (!resposta.ok) throw new Error(resposta.erro.mensagem);
  const salvo = leadSolarProjectResponseSchema.safeParse(resposta.dados);
  if (!salvo.success) throw new Error("Não foi possível interpretar o projeto salvo.");
  return salvo.data;
}
