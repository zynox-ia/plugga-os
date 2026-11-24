import type { CategoriaDoOmie, ContaCorrenteDoOmie } from "./omie.port";

/**
 * Do cadastro do OMIE para o espelho do Financeiro (PLU-342, seção 8 do desenho).
 * Regras puras: o que entra, com que tipo e grupo, e o que conta como ativo.
 */

export type CategoriaDoEspelho = { codigo: string; nome: string; tipo: "receita" | "despesa"; grupoNome: string; ativa: boolean };
export type ContaDoEspelho = { omieCodigo: string; nome: string; banco: string | null; agencia: string | null; numero: string | null; ativa: boolean };

export const SEM_GRUPO = "Sem grupo";

/**
 * Só as categorias que recebem lançamento: o grupo (totalizadora) dá o nome do grupo
 * e não entra; transferência e a que não é nem receita nem despesa ficam de fora. O
 * nome do grupo vem do `categoria_superior`; sem ele, "Sem grupo".
 */
export function espelhoDasCategorias(lidas: readonly CategoriaDoOmie[]): CategoriaDoEspelho[] {
  const grupos = new Map(lidas.filter((c) => c.totalizadora).map((c) => [c.codigo, c.descricao]));
  return lidas
    .filter((c) => !c.totalizadora && !c.transferencia && c.receita !== c.despesa)
    .map((c) => ({
      codigo: c.codigo,
      nome: c.descricao,
      tipo: c.receita ? "receita" : "despesa",
      grupoNome: (c.grupo && grupos.get(c.grupo)) || SEM_GRUPO,
      ativa: c.ativa,
    }));
}

export function espelhoDasContas(lidas: readonly ContaCorrenteDoOmie[]): ContaDoEspelho[] {
  return lidas.map((c) => ({ omieCodigo: c.codigo, nome: c.descricao, banco: c.banco, agencia: c.agencia, numero: c.numero, ativa: c.ativa }));
}
