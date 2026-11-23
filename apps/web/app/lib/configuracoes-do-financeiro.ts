import type { CategoriaFinanceira, CompanyKey, ContaCorrente, OpcoesDoFinanceiro } from "@plugga/shared";

/**
 * Configurações do Financeiro (PLU-340, W8), em leitura: as contas correntes e as
 * categorias que vêm do OMIE de cada empresa, as mesmas dos menus dos
 * lançamentos. "Ler do OMIE agora", Preferências e Nova categoria chegam com a
 * PLU-342 e a PLU-340.
 */

export type AbaDasConfiguracoes = "contas" | "categorias";

/** Contas da empresa escolhida (ou das duas), ativas primeiro e depois pelo nome. */
export function contasDaTela(opcoes: Pick<OpcoesDoFinanceiro, "contasCorrentes">, empresa: CompanyKey | null): ContaCorrente[] {
  return opcoes.contasCorrentes
    .filter((c) => !empresa || c.empresa === empresa)
    .sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.empresa.localeCompare(b.empresa) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** "Itaú · ag 0412 · cc 23456-7", só com o que o OMIE informou. */
export function detalheDaConta(c: Pick<ContaCorrente, "banco" | "agencia" | "numero">): string {
  return [c.banco, c.agencia ? `ag ${c.agencia}` : null, c.numero ? `cc ${c.numero}` : null].filter(Boolean).join(" · ");
}

const normalizar = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();

export type GrupoDeCategorias = { chave: string; codigo: string; nome: string; categorias: CategoriaFinanceira[] };

/**
 * As categorias agrupadas como no OMIE ("1.01 · Receitas de gestão de energia"),
 * na ordem do código. A busca casa nome, código e o nome do grupo, sem acento.
 * O plano de contas é de cada empresa: com as duas na tela, o grupo junta código
 * e nome, para a categoria da Waze não aparecer sob o nome do grupo da Plugga.
 */
export function categoriasAgrupadas(opcoes: Pick<OpcoesDoFinanceiro, "categorias">, empresa: CompanyKey | null, busca = ""): GrupoDeCategorias[] {
  const q = normalizar(busca);
  const grupos = new Map<string, GrupoDeCategorias>();
  const ordenadas = opcoes.categorias
    .filter((c) => !empresa || c.empresa === empresa)
    .filter((c) => !q || normalizar(`${c.nome} ${c.codigo} ${c.grupo.codigo} ${c.grupo.nome}`).includes(q))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }) || a.empresa.localeCompare(b.empresa));
  for (const categoria of ordenadas) {
    const chave = `${categoria.grupo.codigo}|${normalizar(categoria.grupo.nome)}`;
    const grupo = grupos.get(chave) ?? { chave, codigo: categoria.grupo.codigo, nome: categoria.grupo.nome, categorias: [] };
    grupo.categorias.push(categoria);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}

/** "17 categorias em 9 grupos". */
export function contagemDasCategorias(grupos: GrupoDeCategorias[]): string {
  const n = grupos.reduce((s, g) => s + g.categorias.length, 0);
  return `${n === 1 ? "1 categoria" : `${n} categorias`} em ${grupos.length === 1 ? "1 grupo" : `${grupos.length} grupos`}`;
}
