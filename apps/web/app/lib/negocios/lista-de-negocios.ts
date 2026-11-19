import type { Deal, DealStatus, Pipeline } from "@plugga/shared";

import { formatarCampoDoPipeline } from "../campos-do-pipeline.ts";
import { estaParado } from "../negocios.ts";
import { calcularValorPonderado } from "./probabilidade-etapa.ts";

export type SituacaoLista = DealStatus | "all";
export type CampoOrdenacaoLista = "negocio" | "etapa" | "valor" | "fechamento" | "responsavel" | "contato";
export type OrdenacaoLista = { campo: CampoOrdenacaoLista; direcao: "asc" | "desc" };
export type FiltrosLista = { busca: string; responsavel: string; situacao: SituacaoLista; emRisco: boolean };

export function camposPersonalizadosNaLista(negocio: Deal, pipeline: Pipeline, pessoas: readonly { id: string; name: string }[] = []): string[] {
  return (pipeline.fields ?? []).flatMap((campo) => {
    const valor = negocio.customFields?.[campo.id];
    return campo.showInList && valor !== null && valor !== undefined && valor !== ""
      ? [`${campo.name}: ${formatarCampoDoPipeline(campo, valor, pessoas)}`]
      : [];
  });
}

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const emNumero = (valor: string | null) => valor ? Number(valor) : 0;

export function filtrarNegociosLista(negocios: readonly Deal[], filtros: FiltrosLista, pipeline: Pipeline, agora = new Date()): Deal[] {
  const busca = normalizar(filtros.busca.trim());
  return negocios.filter((negocio) => {
    if (filtros.situacao !== "all" && negocio.status !== filtros.situacao) return false;
    if (filtros.responsavel && negocio.owner.id !== filtros.responsavel) return false;
    if (filtros.emRisco && !estaParado(negocio, pipeline, agora)) return false;
    const texto = normalizar(`${negocio.title} ${negocio.number} ${negocio.lead.name} ${negocio.lead.companyName ?? ""} ${negocio.client?.name ?? ""} ${negocio.lead.mainInterest ?? ""}`);
    return !busca || texto.includes(busca);
  });
}

export function ordenarNegociosLista(negocios: readonly Deal[], ordenacao: OrdenacaoLista, pipeline: Pipeline): Deal[] {
  const etapas = [...pipeline.stages].sort((a, b) => a.position - b.position);
  const indices = new Map(etapas.map((etapa, indice) => [etapa.id, indice]));
  const chave = (negocio: Deal): string | number => {
    switch (ordenacao.campo) {
      case "negocio": return normalizar(`${negocio.title} ${negocio.number}`);
      case "etapa": return indices.get(negocio.stageId) ?? -1;
      case "valor": return emNumero(negocio.value);
      case "fechamento": return dataDeFechamentoExibida(negocio) ?? "9999-99-99";
      case "responsavel": return normalizar(negocio.owner.name);
      case "contato": return negocio.stageEnteredAt;
    }
  };
  const sinal = ordenacao.direcao === "asc" ? 1 : -1;
  return [...negocios].sort((a, b) => {
    const x = chave(a); const y = chave(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sinal;
  });
}

export function valorPonderadoDoNegocio(negocio: Deal, pipeline: Pipeline): number {
  const etapas = [...pipeline.stages].sort((a, b) => a.position - b.position);
  return calcularValorPonderado(emNumero(negocio.value), etapas.findIndex((etapa) => etapa.id === negocio.stageId), etapas.length);
}

export function diasParaFechamento(data: string, hoje: string): number {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [anoHoje, mesHoje, diaHoje] = hoje.split("-").map(Number);
  return Math.round((Date.UTC(ano!, mes! - 1, dia!) - Date.UTC(anoHoje!, mesHoje! - 1, diaHoje!)) / 86_400_000);
}

export function dataDeFechamentoExibida(negocio: Pick<Deal, "expectedCloseDate" | "closedAt" | "status">): string | null {
  return negocio.status === "open" ? negocio.expectedCloseDate : negocio.closedAt ?? negocio.expectedCloseDate;
}

export function diasEmAtrasoDoFechamento(negocio: Pick<Deal, "expectedCloseDate" | "status">, hoje: string): number | null {
  if (negocio.status !== "open" || !negocio.expectedCloseDate) return null;
  const dias = diasParaFechamento(negocio.expectedCloseDate, hoje);
  return dias < 0 ? Math.abs(dias) : null;
}

export function csvNegocios(negocios: readonly Deal[], pipeline: Pipeline): string {
  const celula = (valor: unknown) => {
    const texto = String(valor ?? "");
    const seguro = typeof valor === "string" && /^[\t\r=+@-]/.test(texto) ? `'${texto}` : texto;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  const linhas: unknown[][] = [["Negócio", "Código", "Cliente", "Etapa", "Situação", "Valor", "Valor ponderado", "Fechamento previsto", "Responsável", "Entrada na etapa", "Descrição"]];
  for (const negocio of negocios) {
    const etapa = pipeline.stages.find((item) => item.id === negocio.stageId)?.name ?? "Sem etapa";
    linhas.push([negocio.title, `PLU-${String(negocio.number).padStart(4, "0")}`, negocio.lead.name, etapa, negocio.status, emNumero(negocio.value), valorPonderadoDoNegocio(negocio, pipeline), negocio.expectedCloseDate, negocio.owner.name, negocio.stageEnteredAt, negocio.lead.mainInterest || negocio.lead.companyName || negocio.lead.name]);
  }
  return `\uFEFF${linhas.map((linha) => linha.map(celula).join(",")).join("\r\n")}`;
}
