import { Prisma } from "@prisma/client";
import type {
  CategoriaDoRelatorio,
  CompanyKey,
  GrupoDoRelatorio,
  RelatorioPorCategoria,
  SecaoDoRelatorio,
  TipoDeLancamento,
} from "@plugga/shared";

import { fimDoDiaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { PapelNoFinanceiro } from "./financeiro.rules";

/**
 * Relatório por grupo e categoria (PLU-360): regra pura sobre as somas que o
 * banco devolve por tipo e categoria (já recortadas pelo RLS, pela empresa e
 * pelo período). Aqui só se agrupa, ordena e calcula percentual e resultado.
 */

/** Uma soma do banco: o que foi liquidado no período, por tipo e categoria (de uma empresa). */
export type SomaDaCategoria = {
  tipo: TipoDeLancamento;
  categoriaId: string | null;
  /** Nulos quando não há categoria, ou quando a sessão não a lê. */
  codigo: string | null;
  nome: string | null;
  grupoNome: string | null;
  total: Prisma.Decimal;
  quantidade: number;
};

const ZERO = new Prisma.Decimal(0);
const CEM = new Prisma.Decimal(100);
const SEM_CATEGORIA = "Sem categoria";
const INDISPONIVEL = "Categoria indisponível";

/** O período no calendário de Manaus, os dois dias inclusos. */
export function periodoDoRelatorio(de: string, ate: string): { desde: Date; ate: Date } {
  return { desde: inicioDoDiaEmManaus(de), ate: fimDoDiaEmManaus(ate) };
}

/** "2.04.01" vem antes de "2.10.01": compara nível a nível, como número. */
function compararCodigos(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diferenca = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (diferenca !== 0) return diferenca;
  }
  return 0;
}

/** Com código antes, pelo código; "Categoria indisponível" e "Sem categoria" por último. */
function compararLinhas(a: { codigo: string | null; chave: string }, b: { codigo: string | null; chave: string }): number {
  if (a.codigo !== null && b.codigo !== null) return compararCodigos(a.codigo, b.codigo) || a.chave.localeCompare(b.chave, "pt-BR");
  if (a.codigo !== null) return -1;
  if (b.codigo !== null) return 1;
  const peso = (chave: string) => (chave === "sem" ? 1 : 0);
  return peso(a.chave) - peso(b.chave);
}

function percentualDe(parte: Prisma.Decimal, total: Prisma.Decimal): string {
  if (total.isZero()) return "0.0";
  return parte.mul(CEM).div(total).toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP).toFixed(1);
}

type Acumulado = { chave: string; codigo: string | null; nome: string; ids: string[]; total: Prisma.Decimal; quantidade: number };

function acumular(mapa: Map<string, Acumulado>, chave: string, base: Omit<Acumulado, "ids" | "total" | "quantidade">, linha: SomaDaCategoria): Acumulado {
  const atual = mapa.get(chave) ?? { ...base, ids: [], total: ZERO, quantidade: 0 };
  atual.total = atual.total.add(linha.total);
  atual.quantidade += linha.quantidade;
  if (linha.categoriaId && !atual.ids.includes(linha.categoriaId)) atual.ids.push(linha.categoriaId);
  mapa.set(chave, atual);
  return atual;
}

/** As somas de um tipo viram a seção: grupos do plano e, dentro, as categorias. */
export function montarSecao(linhas: readonly SomaDaCategoria[]): SecaoDoRelatorio {
  const grupos = new Map<string, Acumulado & { categorias: Map<string, Acumulado> }>();
  let total = ZERO;
  let quantidade = 0;
  for (const linha of linhas) {
    total = total.add(linha.total);
    quantidade += linha.quantidade;
    const lida = linha.categoriaId !== null && linha.codigo !== null && linha.nome !== null;
    const grupoCodigo = lida ? linha.codigo!.split(".").slice(0, 2).join(".") : null;
    const grupoNome = lida ? linha.grupoNome ?? "Outros" : linha.categoriaId ? INDISPONIVEL : SEM_CATEGORIA;
    const grupoChave = lida ? `${grupoCodigo}|${grupoNome}` : linha.categoriaId ? "indisponivel" : "sem";
    const grupo = grupos.get(grupoChave) ?? { chave: grupoChave, codigo: grupoCodigo, nome: grupoNome, ids: [], total: ZERO, quantidade: 0, categorias: new Map() };
    grupos.set(grupoChave, grupo);
    grupo.total = grupo.total.add(linha.total);
    grupo.quantidade += linha.quantidade;
    const categoriaChave = lida ? `${linha.codigo}|${linha.nome}` : grupoChave;
    acumular(grupo.categorias, categoriaChave, { chave: categoriaChave, codigo: lida ? linha.codigo : null, nome: lida ? linha.nome! : grupoNome }, linha);
  }
  const paraCategoria = (c: Acumulado): CategoriaDoRelatorio => ({
    chave: c.chave, codigo: c.codigo, nome: c.nome, categorias: c.ids, total: c.total.toFixed(2), quantidade: c.quantidade, percentual: percentualDe(c.total, total),
  });
  const paraGrupo = (g: Acumulado & { categorias: Map<string, Acumulado> }): GrupoDoRelatorio => ({
    chave: g.chave, codigo: g.codigo, nome: g.nome, total: g.total.toFixed(2), quantidade: g.quantidade, percentual: percentualDe(g.total, total),
    categorias: [...g.categorias.values()].sort(compararLinhas).map(paraCategoria),
  });
  return { total: total.toFixed(2), quantidade, grupos: [...grupos.values()].sort(compararLinhas).map(paraGrupo) };
}

/**
 * O relatório: cada seção só para quem vê aquele tipo (o RLS já recortou as
 * somas; aqui a seção sem acesso vira nula, para a tela não mostrar zero como
 * se fosse dado). O resultado só existe com os dois lados.
 */
export function montarRelatorioPorCategoria(entrada: {
  de: string;
  ate: string;
  empresa: CompanyKey | null;
  papel: Pick<PapelNoFinanceiro, "saidas" | "entradas">;
  linhas: readonly SomaDaCategoria[];
}): RelatorioPorCategoria {
  const { papel, linhas } = entrada;
  const entradas = papel.entradas ? montarSecao(linhas.filter((l) => l.tipo === "entrada")) : null;
  const saidas = papel.saidas ? montarSecao(linhas.filter((l) => l.tipo === "saida")) : null;
  return {
    de: entrada.de,
    ate: entrada.ate,
    empresa: entrada.empresa,
    entradas,
    saidas,
    resultado: entradas && saidas ? new Prisma.Decimal(entradas.total).sub(saidas.total).toFixed(2) : null,
  };
}
