import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CompanyKey, RelatorioPorCategoria, RelatorioPorCategoriaQuery, TipoDeLancamento } from "@plugga/shared";

import { PrismaService } from "../prisma/prisma.service";
import { tiposVisiveis, type PapelNoFinanceiro } from "./financeiro.rules";
import { montarRelatorioPorCategoria, periodoDoRelatorio, type SomaDaCategoria } from "./relatorio-por-categoria.rules";

/**
 * O que foi liquidado no período, somado por tipo e categoria (PLU-360). Regime
 * de caixa: o dia da liquidação (`liquidado_em`, que é o `pago_em` ou o
 * `recebido_em`) e o valor liquidado (na entrada, o `valor_recebido`; na saída,
 * o `valor`). Fora o cancelado e as pernas de transferência. Roda na transação
 * de quem pede, então o RLS recorta o que a sessão não vê: a saída sem Contas a
 * pagar, a entrada sem Contas a receber.
 */
export async function somasPorCategoria(
  tx: Prisma.TransactionClient,
  filtro: { empresa?: CompanyKey; desde: Date; antes: Date; tipos: readonly TipoDeLancamento[] },
): Promise<SomaDaCategoria[]> {
  if (filtro.tipos.length === 0) return [];
  const linhas = await tx.$queryRaw<{ tipo: TipoDeLancamento; categoriaId: string | null; codigo: string | null; nome: string | null; grupoNome: string | null; total: Prisma.Decimal; quantidade: number }[]>`
    SELECT l.tipo::text AS "tipo", l.categoria_id AS "categoriaId", c.codigo AS "codigo", c.nome AS "nome", c.grupo_nome AS "grupoNome",
           sum(CASE WHEN l.tipo = 'entrada' THEN coalesce(l.valor_recebido, l.valor) ELSE l.valor END) AS "total",
           count(*)::int AS "quantidade"
      FROM public.lancamentos l
      LEFT JOIN public.categorias_financeiras c ON c.id = l.categoria_id
     WHERE l.cancelado_em IS NULL
       AND l.origem <> 'transferencia'
       AND l.liquidado_em >= ${filtro.desde} AND l.liquidado_em < ${filtro.antes}
       AND l.tipo::text = ANY(${[...filtro.tipos]}::text[])
       AND (${filtro.empresa ?? null}::text IS NULL OR l.company_id = ${filtro.empresa ?? null}::text)
     GROUP BY l.tipo, l.categoria_id, c.codigo, c.nome, c.grupo_nome`;
  return linhas.map((l) => ({ ...l, total: new Prisma.Decimal(l.total) }));
}

@Injectable()
export class PrismaRelatoriosDoFinanceiroRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async porCategoria(query: RelatorioPorCategoriaQuery, papel: PapelNoFinanceiro): Promise<RelatorioPorCategoria> {
    const { desde, antes } = periodoDoRelatorio(query.de, query.ate);
    const tipos = tiposVisiveis(papel, "todos");
    const linhas = await this.prisma.comContexto((tx) => somasPorCategoria(tx, { empresa: query.empresa, desde, antes, tipos }));
    return montarRelatorioPorCategoria({ de: query.de, ate: query.ate, empresa: query.empresa ?? null, papel, linhas });
  }
}
