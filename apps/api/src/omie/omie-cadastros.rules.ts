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

// ---------------------------------------------------------------- conferir e importar (S4)

/** A categoria do Plugga OS, com o vínculo do conector (o código no OMIE), se houver. */
export type CategoriaDoPlugga = { id: string; codigo: string; nome: string; tipo: "receita" | "despesa"; ativa: boolean; grupoNome: string; omieCodigo: string | null };
/** A conta corrente do Plugga OS, com o vínculo do conector, se houver. */
export type ContaDoPlugga = { id: string; nome: string; banco: string | null; agencia: string | null; numero: string | null; omieCodigo: string | null };

/** A categoria a criar no Plugga OS (a natureza é a padrão; a gerência ajusta depois). */
export type CategoriaACriar = { codigo: string; nome: string; tipo: "receita" | "despesa"; natureza: "receita" | "outros"; grupoNome: string; ativa: boolean };
export type ContaACriar = { omieCodigo: string; nome: string; banco: string | null; agencia: string | null; numero: string | null; ativa: boolean };

type CategoriaNaTela = { codigo: string; nome: string; tipo: "receita" | "despesa"; ativa: boolean; grupoNome: string | null };
type CategoriaDoPluggaNaTela = { id: string; codigo: string; nome: string; tipo: "receita" | "despesa"; ativa: boolean; grupoNome: string };
type ContaNaTela = { codigo: string; nome: string; banco: string | null; agencia: string | null; conta: string | null };
type ContaDoPluggaNaTela = { id: string; nome: string; banco: string | null; agencia: string | null; conta: string | null };
type ItemDeCategoria = { situacao: Situacao; omie: CategoriaNaTela | null; plugga: CategoriaDoPluggaNaTela | null; diferencas: ("nome" | "ativa" | "grupoNome" | "tipo")[] };
type ItemDeConta = { situacao: Situacao; omie: ContaNaTela | null; plugga: ContaDoPluggaNaTela | null; diferencas: ("nome" | "banco" | "agencia" | "conta")[] };

type ResumoDaConferencia = { iguais: number; novasNoOmie: number; vinculaveis: number; diferentes: number; soNoPlugga: number };
type Situacao = "igual" | "nova_no_omie" | "vinculavel" | "diferente" | "so_no_plugga";
const CHAVE_DO_RESUMO: Record<Situacao, keyof ResumoDaConferencia> = {
  igual: "iguais", nova_no_omie: "novasNoOmie", vinculavel: "vinculaveis", diferente: "diferentes", so_no_plugga: "soNoPlugga",
};

/** Os iguais só contam: a lista leva o resto, e o resumo, todos. */
function resumir<T extends { situacao: Situacao }>(todos: readonly T[]): { itens: (T & { situacao: Exclude<Situacao, "igual"> })[]; resumo: ResumoDaConferencia } {
  const resumo: ResumoDaConferencia = { iguais: 0, novasNoOmie: 0, vinculaveis: 0, diferentes: 0, soNoPlugga: 0 };
  for (const item of todos) resumo[CHAVE_DO_RESUMO[item.situacao]] += 1;
  return { itens: todos.filter((i): i is T & { situacao: Exclude<Situacao, "igual"> } => i.situacao !== "igual"), resumo };
}

/** O formato de código que o banco aceita na categoria ("2.01.01", com dois níveis ao menos). */
const CODIGO_ACEITO = /^[0-9]+(\.[0-9]+)+$/;
const prefixoDoGrupo = (codigo: string): string => codigo.split(".").slice(0, 2).join(".");

/**
 * Confere as categorias do OMIE (as que recebem lançamento) com as do Plugga OS. O vínculo
 * manda; sem ele, o mesmo código vincula, se o tipo for o mesmo. Nunca sobrescreve: o que
 * difere só é mostrado. Devolve também o que a importação cria e vincula.
 */
export function conferirCategorias(lidas: readonly CategoriaDoOmie[], plugga: readonly CategoriaDoPlugga[]) {
  const grupos = new Map(lidas.filter((c) => c.totalizadora).map((c) => [c.codigo, c.descricao]));
  const doOmie = lidas
    .filter((c) => !c.totalizadora && !c.transferencia && c.receita !== c.despesa)
    .map((c) => ({ codigo: c.codigo, nome: c.descricao, tipo: (c.receita ? "receita" : "despesa") as "receita" | "despesa", ativa: c.ativa, grupoNome: (c.grupo && grupos.get(c.grupo)) || null }));
  const porVinculo = new Map(plugga.filter((p) => p.omieCodigo !== null).map((p) => [p.omieCodigo!, p]));
  const porCodigo = new Map(plugga.filter((p) => p.omieCodigo === null).map((p) => [p.codigo, p]));
  // Grupo que já existe no Plugga OS fica com o nome de lá (um nome por prefixo).
  const grupoDoPlugga = new Map(plugga.map((p) => [prefixoDoGrupo(p.codigo), p.grupoNome]));
  const usadas = new Set<string>();
  const aCriar: CategoriaACriar[] = [];
  const aVincular: { pluggaId: string; omieCodigo: string }[] = [];

  const diferencas = (o: (typeof doOmie)[number], p: CategoriaDoPlugga) => {
    const campos: ("nome" | "ativa" | "grupoNome" | "tipo")[] = [];
    if (o.nome !== p.nome) campos.push("nome");
    if (o.ativa !== p.ativa) campos.push("ativa");
    if ((o.grupoNome ?? SEM_GRUPO) !== p.grupoNome) campos.push("grupoNome");
    if (o.tipo !== p.tipo) campos.push("tipo");
    return campos;
  };
  const daTela = (p: CategoriaDoPlugga) => ({ id: p.id, codigo: p.codigo, nome: p.nome, tipo: p.tipo, ativa: p.ativa, grupoNome: p.grupoNome });

  const todos: ItemDeCategoria[] = doOmie.map((o): ItemDeCategoria => {
    const vinculada = porVinculo.get(o.codigo);
    if (vinculada) {
      usadas.add(vinculada.id);
      const campos = diferencas(o, vinculada);
      return { situacao: (campos.length > 0 ? "diferente" : "igual"), omie: o, plugga: daTela(vinculada), diferencas: campos };
    }
    const mesmoCodigo = porCodigo.get(o.codigo);
    if (mesmoCodigo) {
      usadas.add(mesmoCodigo.id);
      const campos = diferencas(o, mesmoCodigo);
      // Receita e despesa com o mesmo código não são a mesma categoria: não se vincula.
      if (campos.includes("tipo")) return { situacao: "diferente", omie: o, plugga: daTela(mesmoCodigo), diferencas: campos };
      aVincular.push({ pluggaId: mesmoCodigo.id, omieCodigo: o.codigo });
      return { situacao: "vinculavel", omie: o, plugga: daTela(mesmoCodigo), diferencas: campos };
    }
    if (CODIGO_ACEITO.test(o.codigo)) {
      aCriar.push({
        codigo: o.codigo, nome: o.nome, tipo: o.tipo, natureza: o.tipo === "receita" ? "receita" : "outros",
        grupoNome: grupoDoPlugga.get(prefixoDoGrupo(o.codigo)) ?? o.grupoNome ?? SEM_GRUPO, ativa: o.ativa,
      });
    }
    return { situacao: "nova_no_omie", omie: o, plugga: null, diferencas: [] };
  });
  for (const p of plugga) {
    if (!usadas.has(p.id)) todos.push({ situacao: "so_no_plugga", omie: null, plugga: daTela(p), diferencas: [] });
  }
  return { ...resumir(todos), aCriar, aVincular };
}

const igualOuVazio = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const preenchido = (v: string | null) => v !== null && v.trim() !== "";

/**
 * Confere as contas correntes do OMIE com as do Plugga OS. O vínculo manda; sem ele, a
 * conta com o mesmo banco, agência e número (os três preenchidos) vincula. Nunca sobrescreve.
 */
export function conferirContas(lidas: readonly ContaCorrenteDoOmie[], plugga: readonly ContaDoPlugga[]) {
  const porVinculo = new Map(plugga.filter((p) => p.omieCodigo !== null).map((p) => [p.omieCodigo!, p]));
  const semVinculo = plugga.filter((p) => p.omieCodigo === null);
  const usadas = new Set<string>();
  const aCriar: ContaACriar[] = [];
  const aVincular: { pluggaId: string; omieCodigo: string }[] = [];
  const daTela = (p: ContaDoPlugga) => ({ id: p.id, nome: p.nome, banco: p.banco, agencia: p.agencia, conta: p.numero });

  const todos: ItemDeConta[] = lidas.map((c): ItemDeConta => {
    const o = { codigo: c.codigo, nome: c.descricao, banco: c.banco, agencia: c.agencia, conta: c.numero };
    const diferencas = (p: ContaDoPlugga) => {
      const campos: ("nome" | "banco" | "agencia" | "conta")[] = [];
      if (o.nome !== p.nome) campos.push("nome");
      if (!igualOuVazio(o.banco, p.banco)) campos.push("banco");
      if (!igualOuVazio(o.agencia, p.agencia)) campos.push("agencia");
      if (!igualOuVazio(o.conta, p.numero)) campos.push("conta");
      return campos;
    };
    const vinculada = porVinculo.get(c.codigo);
    if (vinculada) {
      usadas.add(vinculada.id);
      const campos = diferencas(vinculada);
      return { situacao: (campos.length > 0 ? "diferente" : "igual"), omie: o, plugga: daTela(vinculada), diferencas: campos };
    }
    const mesma = [o.banco, o.agencia, o.conta].every(preenchido)
      ? semVinculo.find((p) => !usadas.has(p.id) && igualOuVazio(p.banco, o.banco) && igualOuVazio(p.agencia, o.agencia) && igualOuVazio(p.numero, o.conta))
      : undefined;
    if (mesma) {
      usadas.add(mesma.id);
      aVincular.push({ pluggaId: mesma.id, omieCodigo: c.codigo });
      return { situacao: "vinculavel", omie: o, plugga: daTela(mesma), diferencas: diferencas(mesma) };
    }
    aCriar.push({ omieCodigo: c.codigo, nome: c.descricao, banco: c.banco, agencia: c.agencia, numero: c.numero, ativa: c.ativa });
    return { situacao: "nova_no_omie", omie: o, plugga: null, diferencas: [] };
  });
  for (const p of plugga) {
    if (!usadas.has(p.id)) todos.push({ situacao: "so_no_plugga", omie: null, plugga: daTela(p), diferencas: [] });
  }
  return { ...resumir(todos), aCriar, aVincular };
}
