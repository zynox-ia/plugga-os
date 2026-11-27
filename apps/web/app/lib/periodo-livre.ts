/**
 * Intervalo livre de datas ("De" e "Até") para os filtros de período das telas.
 * Regras puras, sem React: leitura e escrita no endereço (?de=2026-11-01&ate=2026-11-15),
 * validação do formulário, rótulo curto e a conferência de um dia dentro do intervalo.
 * Os dias são "AAAA-MM-DD" (o formato do DatePicker do sistema).
 */
export type IntervaloLivre = { de: string; ate: string };

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Um dia que existe no calendário, escrito exatamente como AAAA-MM-DD. */
export function diaValido(valor: string | null | undefined): valor is string {
  const partes = valor ? FORMATO.exec(valor) : null;
  if (!partes) return false;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/** O intervalo do endereço, ou nulo (o filtro volta ao padrão) se faltar uma data, não existir ou estiver invertido. */
export function lerIntervalo(de: string | null | undefined, ate: string | null | undefined): IntervaloLivre | null {
  if (!diaValido(de) || !diaValido(ate) || ate < de) return null;
  return { de, ate };
}

/** Grava o intervalo em `url` (mantém os outros parâmetros); nulo remove `de` e `ate`. */
export function escreverIntervaloNaUrl(url: URL, intervalo: IntervaloLivre | null): void {
  if (!intervalo) { url.searchParams.delete("de"); url.searchParams.delete("ate"); return; }
  url.searchParams.set("de", intervalo.de);
  url.searchParams.set("ate", intervalo.ate);
}

/** Os erros por campo do formulário De/Até; vazio quando vale. As duas datas são obrigatórias. */
export function validarIntervalo(de: string, ate: string): { de?: string; ate?: string } {
  const erros: { de?: string; ate?: string } = {};
  if (!de) erros.de = "Informe a data inicial."; else if (!diaValido(de)) erros.de = "Informe uma data válida.";
  if (!ate) erros.ate = "Informe a data final."; else if (!diaValido(ate)) erros.ate = "Informe uma data válida.";
  if (!erros.de && !erros.ate && ate < de) erros.ate = "A data final não pode ser anterior à inicial.";
  return erros;
}

const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const diaMesAno = (dia: string) => `${diaMes(dia)}/${dia.slice(0, 4)}`;

/** "01/11 – 15/11/2026": o ano só no fim quando é o mesmo; nos dois quando difere; um dia só, uma data só. */
export function rotuloDoIntervalo({ de, ate }: IntervaloLivre): string {
  if (de === ate) return diaMesAno(de);
  return de.slice(0, 4) === ate.slice(0, 4) ? `${diaMes(de)} – ${diaMesAno(ate)}` : `${diaMesAno(de)} – ${diaMesAno(ate)}`;
}

/**
 * O dia (ou data com hora) está no intervalo? Vale o DIA: o "Até" inclui o dia inteiro,
 * então 15/11 às 23:59:59 entra no "Até 15/11". Sem intervalo, tudo entra. Com hora, converta
 * antes para o dia local de quem usa a tela.
 */
export function dentroDoIntervalo(valor: string, intervalo: IntervaloLivre | null): boolean {
  if (!intervalo) return true;
  const dia = valor.slice(0, 10);
  return dia >= intervalo.de && dia <= intervalo.ate;
}
