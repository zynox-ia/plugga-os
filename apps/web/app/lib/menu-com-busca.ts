/**
 * Regras do menu com busca de Suprimentos (`components/suprimentos/menu-com-busca`),
 * sem React, para testar sem navegador.
 */

/** Acima disto a lista ganha o campo de busca. */
export const LIMITE_SEM_BUSCA = 8;

/** Com `sempre`, há busca até sem opção: é o alvo do foco quando a lista está vazia. */
export const temBusca = (total: number, sempre = false): boolean => sempre || total > LIMITE_SEM_BUSCA;

const normalizar = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();

/** Pelo nome ou pela linha secundária, sem diferenciar acento nem caixa. */
export function filtrarOpcoes<T extends { label: string; description?: string }>(opcoes: readonly T[], busca: string): readonly T[] {
  const q = normalizar(busca);
  return q ? opcoes.filter((o) => normalizar(`${o.label} ${o.description ?? ""}`).includes(q)) : opcoes;
}

export function avisoDeListaVazia(total: number, visiveis: number): string | null {
  if (visiveis > 0) return null;
  return total ? "Nenhuma opção encontrada." : "Nenhuma opção disponível.";
}

/** A única opção que o Tab alcança: a focada, se continua na lista; senão a marcada; senão a primeira habilitada. */
export function opcaoNoTab(visiveis: readonly { value: string; disabled?: boolean }[], focada: string | undefined, marcada: string | undefined): string | undefined {
  const habilitadas = visiveis.filter((o) => !o.disabled);
  return (habilitadas.find((o) => o.value === focada) ?? habilitadas.find((o) => o.value === marcada) ?? habilitadas[0])?.value;
}
