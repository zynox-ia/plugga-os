import { z } from "zod";

import { diaDoCalendario } from "./compras.js";
import { lancamentoResumoSchema, tipoDeLancamentoSchema } from "./financeiro.js";
import { companyKeySchema } from "./organization.js";
import { decimalString, uuid } from "./primitivas.js";

/**
 * Relatório por grupo e categoria do Financeiro (PLU-360), em
 * `/financeiro/relatorios`: entradas e saídas do período somadas por grupo do
 * plano de contas e, dentro do grupo, por categoria.
 *
 * Regime de caixa: entra o que foi PAGO ou RECEBIDO no período, pelo dia da
 * liquidação (`liquidado_em`, o dia do pagamento ou do recebimento no
 * calendário de Manaus), com o valor liquidado (na entrada, o recebido; na
 * saída, o valor da conta). Cancelado não entra; a transferência entre contas
 * não é entrada nem saída. O lançamento sem categoria cai em "Sem categoria",
 * para o total fechar com o caixa.
 *
 * A tela é de quem tem `financeiro.relatorios`, e cada seção soma só o que as
 * políticas de lançamento deixam a sessão ver: Saídas com Contas a pagar,
 * Entradas com Contas a receber. A seção que a pessoa não vê vem nula, e o
 * resultado só vem com as duas.
 */

/**
 * A faixa de dias aceita: larga para qualquer relatório do negócio, e longe dos
 * extremos do calendário (o dia seguinte a 9999-12-31 nem cabe no formato).
 */
export const PRIMEIRO_DIA_DO_RELATORIO = "2000-01-01";
export const ULTIMO_DIA_DO_RELATORIO = "2100-12-31";
const diaDoRelatorio = diaDoCalendario.refine((dia) => dia >= PRIMEIRO_DIA_DO_RELATORIO && dia <= ULTIMO_DIA_DO_RELATORIO, "Escolha um dia entre 01/01/2000 e 31/12/2100.");

/** O período (os dois dias inclusos) e a empresa; sem empresa, as duas. */
export const relatorioPorCategoriaQuerySchema = z
  .object({
    empresa: companyKeySchema.optional(),
    de: diaDoRelatorio,
    ate: diaDoRelatorio,
  })
  .strict()
  .refine((q) => q.de <= q.ate, { path: ["ate"], message: "O fim do período vem depois do início." });
export type RelatorioPorCategoriaQuery = z.infer<typeof relatorioPorCategoriaQuerySchema>;

/** Percentual sobre o total da seção, com uma casa ("12.5"). */
const percentual = z.string().regex(/^\d{1,3}\.\d$/);

/**
 * Uma linha de categoria. Com as duas empresas, a mesma categoria (código e nome)
 * das duas soma numa linha só, e `categorias` traz os ids de cada uma. Sem
 * categoria: `codigo` nulo e `categorias` vazio.
 */
export const categoriaDoRelatorioSchema = z.object({
  chave: z.string(),
  codigo: z.string().nullable(),
  nome: z.string(),
  categorias: z.array(uuid),
  total: decimalString,
  quantidade: z.number().int().nonnegative(),
  percentual,
});
export type CategoriaDoRelatorio = z.infer<typeof categoriaDoRelatorioSchema>;

/** O grupo do plano ("2.01", "Impostos"), com as categorias que tiveram movimento. */
export const grupoDoRelatorioSchema = z.object({
  chave: z.string(),
  codigo: z.string().nullable(),
  nome: z.string(),
  total: decimalString,
  quantidade: z.number().int().nonnegative(),
  percentual,
  categorias: z.array(categoriaDoRelatorioSchema),
});
export type GrupoDoRelatorio = z.infer<typeof grupoDoRelatorioSchema>;

export const secaoDoRelatorioSchema = z.object({
  total: decimalString,
  quantidade: z.number().int().nonnegative(),
  grupos: z.array(grupoDoRelatorioSchema),
});
export type SecaoDoRelatorio = z.infer<typeof secaoDoRelatorioSchema>;

export const relatorioPorCategoriaSchema = z.object({
  de: diaDoCalendario,
  ate: diaDoCalendario,
  empresa: companyKeySchema.nullable(),
  /** Nula sem Contas a receber. */
  entradas: secaoDoRelatorioSchema.nullable(),
  /** Nula sem Contas a pagar. */
  saidas: secaoDoRelatorioSchema.nullable(),
  /** Entradas menos saídas, com sinal ("-120.50"); nulo quando a sessão não vê os dois lados. */
  resultado: z.string().regex(/^-?\d+\.\d{2}$/).nullable(),
});
export type RelatorioPorCategoria = z.infer<typeof relatorioPorCategoriaSchema>;

/** Os lançamentos que somam uma linha do relatório: os ids da linha, ou `sem` para "Sem categoria". */
export const LIMITE_DOS_LANCAMENTOS_DO_RELATORIO = 500;
export const lancamentosDoRelatorioQuerySchema = z
  .object({
    empresa: companyKeySchema.optional(),
    de: diaDoRelatorio,
    ate: diaDoRelatorio,
    tipo: tipoDeLancamentoSchema,
    categoria: z.union([
      z.literal("sem"),
      z.string().transform((v) => v.split(",")).pipe(z.array(uuid).min(1).max(10)),
    ]),
  })
  .strict()
  .refine((q) => q.de <= q.ate, { path: ["ate"], message: "O fim do período vem depois do início." });
export type LancamentosDoRelatorioQuery = z.infer<typeof lancamentosDoRelatorioQuerySchema>;

export const lancamentoDoRelatorioSchema = lancamentoResumoSchema.extend({
  /** O valor que entrou ou saiu do caixa (na entrada, o recebido). */
  valorLiquidado: decimalString,
});
export type LancamentoDoRelatorio = z.infer<typeof lancamentoDoRelatorioSchema>;

export const lancamentosDoRelatorioSchema = z.object({
  itens: z.array(lancamentoDoRelatorioSchema),
  /** Quantos são no total (a lista para em 500) e a soma de todos. */
  total: z.number().int().nonnegative(),
  soma: decimalString,
});
export type LancamentosDoRelatorio = z.infer<typeof lancamentosDoRelatorioSchema>;
