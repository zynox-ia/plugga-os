import {
  companyKeys,
  DOCUMENTO_DE_OBRA_MAX_BYTES,
  tiposDeDocumentoDeObra,
  type CompanyKey,
  type ObraResumo,
  type SituacaoDaObra,
  type TipoDeObra,
} from "@plugga/shared";

import { lerPotencia } from "./usinas.ts";

/**
 * Obras (PLU-350): filtros pelo endereço, o texto do próximo marco e as regras da
 * Nova obra e do documento. A obra é o centro de custo do Financeiro; os custos
 * ficam lá (`custos: null` aqui).
 */

export const ROTA_OBRAS = "/engenharia/obras";

/** O filtro Situação da tela: um valor só no endereço, que vira `situacao` ou `atrasadas` na API. */
export const filtrosDeSituacaoDasObras = ["em_andamento", "atrasadas", "entregue"] as const;
export type FiltroDeSituacaoDaObra = (typeof filtrosDeSituacaoDasObras)[number];
export const ROTULO_DO_FILTRO_DAS_OBRAS: Record<FiltroDeSituacaoDaObra, string> = {
  em_andamento: "Em andamento",
  atrasadas: "Com marco atrasado",
  entregue: "Entregues",
};

export const ROTULO_DA_SITUACAO_DA_OBRA: Record<SituacaoDaObra, string> = { sem_marcos: "Sem marcos", em_andamento: "Em andamento", entregue: "Entregue" };

export const ROTULO_DO_TIPO_DE_OBRA: Record<TipoDeObra, string> = {
  obra_solar: "Obra solar",
  projeto: "Projeto",
  manutencao: "Manutenção",
  gestao_de_energia: "Gestão de energia",
  interno: "Interno",
};

export type FiltrosDasObras = { situacao?: FiltroDeSituacaoDaObra; empresa?: CompanyKey; busca?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuidDeObra = (v: string | undefined | null): v is string => Boolean(v && UUID.test(v));

export function lerFiltrosDasObras(p: Record<string, string | undefined>): FiltrosDasObras {
  const situacao = filtrosDeSituacaoDasObras.find((s) => s === p.situacao);
  const empresa = companyKeys.find((e) => e === p.empresa);
  return {
    ...(situacao ? { situacao } : {}),
    ...(empresa ? { empresa } : {}),
    ...(p.busca?.trim() ? { busca: p.busca.trim().slice(0, 150) } : {}),
  };
}

export function hrefDasObras(f: FiltrosDasObras, obra?: string | null): string {
  const q = new URLSearchParams();
  if (f.situacao) q.set("situacao", f.situacao);
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.busca) q.set("busca", f.busca);
  if (obra) q.set("obra", obra);
  const texto = q.toString();
  return texto ? `${ROTA_OBRAS}?${texto}` : ROTA_OBRAS;
}

export const temFiltroNasObras = (f: FiltrosDasObras): boolean => Boolean(f.situacao || f.busca);

export const consultaDasObras = (f: FiltrosDasObras): Record<string, string | undefined> => ({
  empresa: f.empresa,
  busca: f.busca,
  ...(f.situacao === "atrasadas" ? { atrasadas: "sim" } : f.situacao ? { situacao: f.situacao } : {}),
});

/** O rodapé do card: a data do próximo marco ("marco atrasado" ou "próximo marco"), ou a entrega. */
export function prazoDaObra(o: Pick<ObraResumo, "marcos" | "entregaPrevistaEm" | "situacao">): { dia: string | null; texto: string; atrasado: boolean } {
  const p = o.marcos.proximo;
  if (p) return { dia: p.previstoEm, texto: p.atrasado ? "marco atrasado" : "próximo marco", atrasado: p.atrasado };
  return { dia: o.entregaPrevistaEm, texto: o.situacao === "entregue" ? "entregue" : "entrega prevista", atrasado: false };
}

/** "45,5 kWp", ou nada quando a obra não tem potência (as criadas pelo Compras). */
export const potenciaDaObra = (kwp: string | null): string | null => (kwp ? `${Number(kwp).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kWp` : null);

/** O dia + n dias (AAAA-MM-DD). */
export function somarDiasNaObra(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A entrega mínima: o dia seguinte ao início e nunca antes de amanhã. */
export function entregaMinima(inicioEm: string, hoje: string): string {
  const amanha = somarDiasNaObra(hoje, 1);
  const depoisDoInicio = inicioEm ? somarDiasNaObra(inicioEm, 1) : amanha;
  return depoisDoInicio > amanha ? depoisDoInicio : amanha;
}

export type NovaObra = { empresa: CompanyKey | ""; clienteId: string; nome: string; potencia: string; responsavelId: string; inicioEm: string; entregaPrevistaEm: string };
export type ProblemasDaObra = Partial<Record<keyof NovaObra, string>>;

export function problemasDaNovaObra(o: NovaObra, hoje: string): ProblemasDaObra {
  const e: ProblemasDaObra = {};
  if (!o.empresa) e.empresa = "escolha a empresa.";
  if (!o.clienteId) e.clienteId = "escolha o cliente.";
  if (!o.nome.trim()) e.nome = "dê um nome à obra.";
  const kwp = lerPotencia(o.potencia);
  if (kwp.problema) e.potencia = kwp.problema;
  if (!o.inicioEm) e.inicioEm = "informe o início.";
  if (!o.entregaPrevistaEm) e.entregaPrevistaEm = "informe a entrega prevista.";
  else if (o.inicioEm && o.entregaPrevistaEm <= o.inicioEm) e.entregaPrevistaEm = "a entrega precisa ser depois do início.";
  else if (o.entregaPrevistaEm <= hoje) e.entregaPrevistaEm = "a entrega precisa ser a partir de amanhã.";
  return e;
}

/** Orçamento como no contrato: "125000,50" (até 2 casas); vazio limpa. */
export function lerOrcamento(texto: string): { valor: string | null; problema: string | null } {
  const bruto = texto.trim().replace(/^R\$\s*/i, "");
  // Com vírgula, os pontos são de milhar; sem vírgula, um ponto com 1 ou 2 casas no fim é o decimal.
  const limpo = bruto.includes(",") ? bruto.replace(/\./g, "") : /^\d+\.\d{1,2}$/.test(bruto) ? bruto.replace(".", ",") : bruto.replace(/\./g, "");
  if (!limpo) return { valor: null, problema: null };
  if (!/^\d{1,12}([,]\d{1,2})?$/.test(limpo)) return { valor: null, problema: "use um valor como 125.000,50." };
  return { valor: limpo, problema: null };
}

/** PDF, imagem ou o .mpp do MS Project, até 50 MB (a API confere de novo pelo conteúdo). */
export function problemaDoDocumento(arquivo: { name: string; type: string; size: number }): string | null {
  const mpp = /\.mpp$/i.test(arquivo.name);
  if (!mpp && !(tiposDeDocumentoDeObra as readonly string[]).includes(arquivo.type)) return "envie PDF, imagem (JPG ou PNG) ou o arquivo do MS Project (.mpp).";
  if (arquivo.size > DOCUMENTO_DE_OBRA_MAX_BYTES) return "o arquivo passa de 50 MB.";
  if (arquivo.size === 0) return "o arquivo está vazio.";
  return null;
}
