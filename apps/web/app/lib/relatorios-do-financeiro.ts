import { companyKeys, type CompanyKey, type GrupoDoRelatorio, type RelatorioPorCategoria, type SecaoDoRelatorio, type TipoDeLancamento } from "@plugga/shared";

/**
 * Relatório por grupo e categoria do Financeiro (PLU-360): o filtro da URL, os
 * atalhos do período, o resultado (inteiro ou parcial) e o CSV do que a tela
 * mostra. Regra pura, sem React.
 */

export const ROTA_DOS_RELATORIOS = "/financeiro/relatorios";

export type FiltrosDoRelatorio = { de: string; ate: string; empresa?: CompanyKey };
export type AtalhoDoPeriodo = "mes" | "anterior" | "ano";

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const dois = (n: number) => String(n).padStart(2, "0");

function diaValido(valor: string | undefined): valor is string {
  const m = valor ? DIA.exec(valor) : null;
  if (!m) return false;
  const data = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return data.getUTCFullYear() === Number(m[1]) && data.getUTCMonth() === Number(m[2]) - 1 && data.getUTCDate() === Number(m[3]);
}

/** O último dia do mês "aaaa-mm". */
function fimDoMes(ano: number, mes: number): string {
  return `${ano}-${dois(mes)}-${dois(new Date(Date.UTC(ano, mes, 0)).getUTCDate())}`;
}

/** Os atalhos do período, a partir de hoje (Manaus): o mês inteiro, o anterior e o ano. */
export function periodoDoAtalho(atalho: AtalhoDoPeriodo, hoje: string): { de: string; ate: string } {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  if (atalho === "ano") return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
  if (atalho === "anterior") {
    const [a, m] = mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
    return { de: `${a}-${dois(m)}-01`, ate: fimDoMes(a, m) };
  }
  return { de: `${ano}-${dois(mes)}-01`, ate: fimDoMes(ano, mes) };
}

export const ROTULO_DO_ATALHO: Record<AtalhoDoPeriodo, string> = { mes: "Mês atual", anterior: "Mês anterior", ano: "Ano atual" };
export const ATALHOS_DO_PERIODO: readonly AtalhoDoPeriodo[] = ["mes", "anterior", "ano"];

/** O atalho que o período escolhido é, se for um. */
export function atalhoDoPeriodo(filtros: Pick<FiltrosDoRelatorio, "de" | "ate">, hoje: string): AtalhoDoPeriodo | null {
  return ATALHOS_DO_PERIODO.find((atalho) => {
    const p = periodoDoAtalho(atalho, hoje);
    return p.de === filtros.de && p.ate === filtros.ate;
  }) ?? null;
}

/** O filtro da URL: dias válidos e em ordem, senão o mês atual; empresa só se for uma das duas. */
export function lerFiltrosDoRelatorio(parametros: Record<string, string | undefined>, hoje: string): FiltrosDoRelatorio {
  const padrao = periodoDoAtalho("mes", hoje);
  const { de, ate } = parametros;
  const periodo = diaValido(de) && diaValido(ate) && de <= ate ? { de, ate } : padrao;
  const empresa = companyKeys.find((item) => item === parametros.empresa);
  return { ...periodo, ...(empresa ? { empresa } : {}) };
}

export function hrefDoRelatorio(filtros: FiltrosDoRelatorio): string {
  const busca = new URLSearchParams({ de: filtros.de, ate: filtros.ate, ...(filtros.empresa ? { empresa: filtros.empresa } : {}) });
  return `${ROTA_DOS_RELATORIOS}?${busca.toString()}`;
}

/** A consulta da API para o relatório e para os lançamentos de uma linha. */
export function consultaDoRelatorio(filtros: FiltrosDoRelatorio): Record<string, string> {
  return { de: filtros.de, ate: filtros.ate, ...(filtros.empresa ? { empresa: filtros.empresa } : {}) };
}

export function consultaDosLancamentosDaLinha(filtros: FiltrosDoRelatorio, tipo: TipoDeLancamento, categorias: readonly string[]): string {
  return new URLSearchParams({ ...consultaDoRelatorio(filtros), tipo, categoria: categorias.length ? categorias.join(",") : "sem" }).toString();
}

/** "01/11/2026" */
export function diaLegivel(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
}

/** "01/11/2026 a 30/11/2026", ou o dia só. */
export function rotuloDoPeriodo(de: string, ate: string): string {
  return de === ate ? diaLegivel(de) : `${diaLegivel(de)} a ${diaLegivel(ate)}`;
}

export type ResultadoDoRelatorio =
  | { tipo: "inteiro"; valor: string }
  | { tipo: "parcial"; texto: string };

/**
 * O resultado só existe com as duas seções. Com uma só, a tela não mostra o
 * total daquele lado como se fosse o resultado: diz que é parcial e por quê.
 */
export function resultadoDoRelatorio(relatorio: Pick<RelatorioPorCategoria, "entradas" | "saidas" | "resultado">): ResultadoDoRelatorio {
  if (relatorio.resultado !== null && relatorio.entradas && relatorio.saidas) return { tipo: "inteiro", valor: relatorio.resultado };
  if (relatorio.saidas) return { tipo: "parcial", texto: "Parcial: você vê só as saídas. O resultado precisa também de Contas a receber." };
  if (relatorio.entradas) return { tipo: "parcial", texto: "Parcial: você vê só as entradas. O resultado precisa também de Contas a pagar." };
  return { tipo: "parcial", texto: "Sem Contas a pagar nem Contas a receber, o relatório não tem o que somar." };
}

/** A tela que falta para ver a seção. */
export const TELA_DA_SECAO: Record<"entradas" | "saidas", string> = { entradas: "Contas a receber", saidas: "Contas a pagar" };

/** "1 lançamento", "3 lançamentos" */
export function quantosLancamentos(n: number): string {
  return n === 1 ? "1 lançamento" : `${n} lançamentos`;
}

// ---------------------------------------------------------------- CSV

/** Decimal do servidor ("-1234.5") no formato das planilhas em pt-BR ("-1234,50"), sem passar por número. */
export function decimalNoCsv(valor: string): string {
  const [inteiro, casas = ""] = valor.split(".");
  return `${inteiro},${(casas + "00").slice(0, 2)}`;
}

/** O percentual do servidor ("12.5") com vírgula e a mesma casa ("12,5"). */
const percentualNoCsv = (valor: string) => valor.replace(".", ",");

function celula(valor: string): string {
  return /[;"\n\r]/.test(valor) ? `"${valor.replace(/"/g, "\"\"")}"` : valor;
}

/** O BOM do UTF-8, que faz o Excel ler os acentos. */
const BOM = String.fromCharCode(0xfeff);

const ROTULO_DA_SECAO: Record<"entradas" | "saidas", string> = { entradas: "Entradas", saidas: "Saídas" };

/**
 * O relatório exibido em CSV para planilha em pt-BR: separador ";", vírgula
 * decimal e BOM, para o Excel abrir os acentos. Uma linha por grupo e por
 * categoria, o total de cada seção e o resultado (ou "parcial").
 */
export function csvDoRelatorio(relatorio: RelatorioPorCategoria): string {
  const empresa = relatorio.empresa === "waze" ? "Waze Energia" : relatorio.empresa === "plugga" ? "Plugga" : "Plugga e Waze Energia";
  const linhas: string[][] = [
    ["Relatório por grupo e categoria"],
    ["Período", rotuloDoPeriodo(relatorio.de, relatorio.ate)],
    ["Empresa", empresa],
    ["Base", "Pago ou recebido no período, pelo valor liquidado"],
    [],
    ["Seção", "Nível", "Grupo", "Código", "Categoria", "Lançamentos", "Total (R$)", "% da seção"],
  ];
  const secao = (chave: "entradas" | "saidas", s: SecaoDoRelatorio | null) => {
    const rotulo = ROTULO_DA_SECAO[chave];
    if (!s) {
      linhas.push([rotulo, "Sem acesso", "", "", `Falta a tela ${TELA_DA_SECAO[chave]}`, "", "", ""]);
      return;
    }
    for (const g of s.grupos as GrupoDoRelatorio[]) {
      linhas.push([rotulo, "Grupo", g.nome, g.codigo ?? "", "", String(g.quantidade), decimalNoCsv(g.total), percentualNoCsv(g.percentual)]);
      for (const c of g.categorias) linhas.push([rotulo, "Categoria", g.nome, c.codigo ?? "", c.nome, String(c.quantidade), decimalNoCsv(c.total), percentualNoCsv(c.percentual)]);
    }
    linhas.push([rotulo, "Total", "", "", "", String(s.quantidade), decimalNoCsv(s.total), s.grupos.length ? "100,0" : "0,0"]);
  };
  secao("entradas", relatorio.entradas);
  secao("saidas", relatorio.saidas);
  linhas.push([]);
  const resultado = resultadoDoRelatorio(relatorio);
  linhas.push(resultado.tipo === "inteiro" ? ["Resultado", decimalNoCsv(resultado.valor)] : ["Resultado", resultado.texto]);
  return `${BOM}${linhas.map((linha) => linha.map(celula).join(";")).join("\r\n")}\r\n`;
}

export function nomeDoCsv(relatorio: Pick<RelatorioPorCategoria, "de" | "ate" | "empresa">): string {
  return `relatorio-por-categoria_${relatorio.de}_a_${relatorio.ate}_${relatorio.empresa ?? "todas"}.csv`;
}
