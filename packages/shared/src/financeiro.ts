import { z } from "zod";

import { diaDoCalendario } from "./compras.js";
import { companyKeySchema } from "./organization.js";
import { decimalString, isoDate, uuid } from "./primitivas.js";

/**
 * Financeiro (PLU-336), em `/financeiro`: os lançamentos da Plugga e da Waze
 * numa tela só, no lugar das tarefas soltas do projeto Gestão Financeira do
 * Bitrix. Um lançamento é uma saída (conta a pagar) ou uma entrada (cobrança de
 * um cliente numa competência), com etapas no mesmo registro.
 *
 * ```
 * saída:   aberta → aprovada → paga → conciliada
 * entrada: gerada → nf_emitida → boleto_gerado → enviada → recebida → conciliada
 * ```
 *
 * "Em cobrança" não é etapa: é a entrada enviada e vencida. Cancelar vale antes
 * de pagar ou receber, com motivo, e o lançamento guarda a etapa em que parou.
 *
 * Acesso pelas telas que já existem (decisão do Coordenador em 23/11/2026): as
 * saídas exigem `financeiro.pagar`, as entradas `financeiro.receber`. Aprovar é
 * do Gerente do Financeiro (F2: toda conta avulsa passa por ela); pagar e
 * receber, de qualquer membro do Financeiro. Admin e Desenvolvedor contam como
 * gerente. A empresa é campo obrigatório e filtro, não fronteira de acesso.
 */

export const FINANCEIRO_FUSO_HORARIO = "America/Manaus";

// ---------------------------------------------------------------- tipos e etapas

export const tiposDeLancamento = ["saida", "entrada"] as const;
export const tipoDeLancamentoSchema = z.enum(tiposDeLancamento);
export type TipoDeLancamento = z.infer<typeof tipoDeLancamentoSchema>;

export const etapasDeSaida = ["aberta", "aprovada", "paga", "conciliada"] as const;
export const etapasDeEntrada = ["gerada", "nf_emitida", "boleto_gerado", "enviada", "recebida", "conciliada"] as const;
export const etapasDeLancamento = ["aberta", "aprovada", "paga", "gerada", "nf_emitida", "boleto_gerado", "enviada", "recebida", "conciliada"] as const;
export const etapaDeLancamentoSchema = z.enum(etapasDeLancamento);
export type EtapaDeLancamento = z.infer<typeof etapaDeLancamentoSchema>;

export const etapasDoTipo: Readonly<Record<TipoDeLancamento, readonly EtapaDeLancamento[]>> = {
  saida: etapasDeSaida,
  entrada: etapasDeEntrada,
};

export const rotulosDaEtapaDeLancamento: Readonly<Record<EtapaDeLancamento, string>> = {
  aberta: "Aberta",
  aprovada: "Aprovada",
  paga: "Paga",
  gerada: "Gerada",
  nf_emitida: "NF emitida",
  boleto_gerado: "Boleto gerado",
  enviada: "Enviada",
  recebida: "Recebida",
  conciliada: "Conciliada",
};

/** As quatro colunas do quadro, comuns aos dois tipos. */
export const colunasDoQuadroFinanceiro = ["preparo", "aberto", "liquidado", "conciliado"] as const;
export const colunaDoQuadroFinanceiroSchema = z.enum(colunasDoQuadroFinanceiro);
export type ColunaDoQuadroFinanceiro = z.infer<typeof colunaDoQuadroFinanceiroSchema>;

export const colunaDaEtapa: Readonly<Record<EtapaDeLancamento, ColunaDoQuadroFinanceiro>> = {
  aberta: "preparo",
  gerada: "preparo",
  nf_emitida: "preparo",
  boleto_gerado: "preparo",
  aprovada: "aberto",
  enviada: "aberto",
  paga: "liquidado",
  recebida: "liquidado",
  conciliada: "conciliado",
};

/** Pago, recebido ou conciliado: o dinheiro já se moveu, então não vence nem se cancela. */
export const etapasLiquidadas: readonly EtapaDeLancamento[] = ["paga", "recebida", "conciliada"];

// ---------------------------------------------------------------- OMIE

/** Estado do lançamento no OMIE da empresa (PLU-342). Nesta entrega só `nao_enviado`. */
export const estadosNoOmie = ["nao_enviado", "enviando", "enviado", "erro", "baixado", "divergente"] as const;
export const estadoNoOmieSchema = z.enum(estadosNoOmie);
export type EstadoNoOmie = z.infer<typeof estadoNoOmieSchema>;

export const omieDoLancamentoSchema = z.object({
  estado: estadoNoOmieSchema,
  /** Código do lançamento no OMIE, depois de enviado. */
  codigo: z.string().nullable(),
  /** Motivo curto, em `erro` e `divergente`. Nunca a resposta crua do OMIE. */
  motivo: z.string().nullable(),
});
export type OmieDoLancamento = z.infer<typeof omieDoLancamentoSchema>;

// ---------------------------------------------------------------- cadastros por empresa

/** Formas de pagamento do lançamento. As do fornecedor mais o débito automático. */
export const formasDoLancamento = ["pix", "boleto", "cartao_credito", "transferencia", "debito_automatico"] as const;
export const formaDoLancamentoSchema = z.enum(formasDoLancamento);
export type FormaDoLancamento = z.infer<typeof formaDoLancamentoSchema>;


/** Tipo da categoria no OMIE. */
export const tiposDeCategoria = ["receita", "despesa"] as const;
export const tipoDeCategoriaSchema = z.enum(tiposDeCategoria);
export type TipoDeCategoria = z.infer<typeof tipoDeCategoriaSchema>;

/**
 * Natureza da categoria, que dá o ícone do card. É campo do Plugga OS (o OMIE não
 * tem): a leitura do OMIE propõe pela palavra do nome e pelo tipo, e o Financeiro
 * corrige nas Configurações. Categoria nova sem palpite fica `outros` (despesa) ou
 * `receita`.
 */
export const naturezasDeCategoria = [
  "receita",
  "material",
  "servico",
  "telecom",
  "aluguel",
  "locacao",
  "imposto",
  "pessoal",
  "tarifa",
  "outros",
] as const;
export const naturezaDeCategoriaSchema = z.enum(naturezasDeCategoria);
export type NaturezaDeCategoria = z.infer<typeof naturezaDeCategoriaSchema>;

/** Espelho da categoria do OMIE de uma empresa (código como "2.01.01"). */
export const categoriaFinanceiraSchema = z.object({
  id: uuid,
  empresa: companyKeySchema,
  codigo: z.string(),
  nome: z.string(),
  tipo: tipoDeCategoriaSchema,
  natureza: naturezaDeCategoriaSchema,
  /** Os dois primeiros níveis do código ("2.01") e o nome do grupo no OMIE. */
  grupo: z.object({ codigo: z.string(), nome: z.string() }),
  ativa: z.boolean(),
});
export type CategoriaFinanceira = z.infer<typeof categoriaFinanceiraSchema>;

/** Espelho da conta corrente do OMIE de uma empresa. Somente leitura no Plugga OS. */
export const contaCorrenteSchema = z.object({
  id: uuid,
  empresa: companyKeySchema,
  nome: z.string(),
  banco: z.string().nullable(),
  agencia: z.string().nullable(),
  numero: z.string().nullable(),
  /** Saldo lido do OMIE e quando; nulos até a primeira leitura. */
  saldo: z.string().nullable(),
  saldoLidoEm: isoDate.nullable(),
  ativa: z.boolean(),
});
export type ContaCorrente = z.infer<typeof contaCorrenteSchema>;

/**
 * `GET financeiro/opcoes`: os menus dos formulários e dos filtros. Categorias e
 * contas das duas empresas, ativas e inativas (a tela filtra pela empresa e
 * esconde as inativas nos menus de escolha); fornecedores ativos. Clientes entram
 * por busca, com a cobrança (PLU-337): o cadastro do CRM é grande demais para um menu.
 */
export const opcoesDoFinanceiroSchema = z.object({
  categorias: z.array(categoriaFinanceiraSchema),
  contasCorrentes: z.array(contaCorrenteSchema),
  fornecedores: z.array(z.object({ id: uuid, nome: z.string() })),
  formasDePagamento: z.array(formaDoLancamentoSchema),
});
export type OpcoesDoFinanceiro = z.infer<typeof opcoesDoFinanceiroSchema>;

// ---------------------------------------------------------------- entrada

const valorPositivo = decimalString.refine((v) => Number(v) > 0, "valor deve ser maior que zero");
const textoObrigatorio = (max: number) => z.string().trim().min(1).max(max);
const textoOpcional = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();

/** Competência "aaaa-mm" da cobrança. */
export const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competência deve ser aaaa-mm");

/**
 * Nova conta a pagar avulsa. Nasce `aberta` e espera a aprovação da Gerente do
 * Financeiro. Categoria (de despesa) e conta corrente têm de ser da empresa.
 */
export const criarContaAPagarSchema = z
  .object({
    empresa: companyKeySchema,
    fornecedorId: uuid,
    categoriaId: uuid,
    contaCorrenteId: uuid,
    descricao: textoObrigatorio(200),
    valor: valorPositivo,
    vencimento: diaDoCalendario,
    forma: formaDoLancamentoSchema,
    observacao: textoOpcional(2000),
  })
  .strict();
export type CriarContaAPagar = z.infer<typeof criarContaAPagarSchema>;

/** Editar antes de pagar. A empresa não muda; `valor` muda pela ação `corrigir_valor`, com motivo. */
export const editarLancamentoSchema = z
  .object({
    fornecedorId: uuid.optional(),
    categoriaId: uuid.optional(),
    contaCorrenteId: uuid.optional(),
    descricao: textoObrigatorio(200).optional(),
    vencimento: diaDoCalendario.optional(),
    forma: formaDoLancamentoSchema.optional(),
    observacao: textoOpcional(2000),
  })
  .strict();
export type EditarLancamento = z.infer<typeof editarLancamentoSchema>;

// ---------------------------------------------------------------- ações

const motivo = textoObrigatorio(500);

/**
 * Transições pelo endpoint de ações. Nesta entrega (PLU-336) rodam `aprovar` e
 * `cancelar`; as demais estão declaradas para a tela e chegam com a PLU-337
 * (pagamento com comprovante, NF, boleto, envio, cobrança e recebimento). Até
 * lá a API as recusa com 409 e elas não aparecem em `acoesPermitidas`.
 */
export const acaoDoLancamentoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("aprovar") }).strict(),
  z.object({ acao: z.literal("cancelar"), motivo }).strict(),
  z.object({ acao: z.literal("corrigir_valor"), valor: valorPositivo, motivo }).strict(),
  z.object({ acao: z.literal("registrar_nf"), numero: textoObrigatorio(60) }).strict(),
  z.object({ acao: z.literal("registrar_boleto") }).strict(),
  z.object({ acao: z.literal("registrar_envio"), canal: textoObrigatorio(60) }).strict(),
  z.object({ acao: z.literal("registrar_cobranca"), canal: textoObrigatorio(60), nota: textoOpcional(1000) }).strict(),
  z.object({ acao: z.literal("registrar_pagamento"), forma: formaDoLancamentoSchema, contaCorrenteId: uuid, pagoEm: diaDoCalendario }).strict(),
  z.object({ acao: z.literal("registrar_recebimento"), contaCorrenteId: uuid, recebidoEm: diaDoCalendario, valor: valorPositivo }).strict(),
]);
export type AcaoDoLancamento = z.infer<typeof acaoDoLancamentoSchema>;
export const acoesDoLancamento = [
  "aprovar",
  "cancelar",
  "corrigir_valor",
  "registrar_nf",
  "registrar_boleto",
  "registrar_envio",
  "registrar_cobranca",
  "registrar_pagamento",
  "registrar_recebimento",
] as const satisfies readonly AcaoDoLancamento["acao"][];
export type NomeDaAcaoDoLancamento = (typeof acoesDoLancamento)[number];

// ---------------------------------------------------------------- saídas

const pessoa = z.object({ id: uuid, nome: z.string() });
const registro = z.object({ por: pessoa.nullable(), em: isoDate });

export const situacoesDoVencimento = ["no_prazo", "vence_hoje", "vencido"] as const;
export const situacaoDoVencimentoSchema = z.enum(situacoesDoVencimento);
export type SituacaoDoVencimento = z.infer<typeof situacaoDoVencimentoSchema>;

/** Dias até o vencimento em Manaus (negativo = vencido há tantos dias). */
export const prazoDoLancamentoSchema = z.object({ situacao: situacaoDoVencimentoSchema, dias: z.number().int() });

export const favorecidoSchema = z.object({
  tipo: z.enum(["fornecedor", "cliente"]),
  id: uuid,
  nome: z.string(),
});

export const origensDoLancamento = ["avulsa", "pedido_de_compra", "agente", "cobranca_manual"] as const;
export const origemDoLancamentoSchema = z.enum(origensDoLancamento);
export type OrigemDoLancamento = z.infer<typeof origemDoLancamentoSchema>;

/** Card, linha da lista e card do quadro. */
export const lancamentoResumoSchema = z.object({
  id: uuid,
  tipo: tipoDeLancamentoSchema,
  /** CP-0412 (saída) ou CR-2081 (entrada): numeração global por tipo, não por empresa. */
  codigo: z.string(),
  empresa: companyKeySchema,
  etapa: etapaDeLancamentoSchema,
  coluna: colunaDoQuadroFinanceiroSchema,
  /** Entrada enviada e vencida. */
  emCobranca: z.boolean(),
  cancelado: z.boolean(),
  favorecido: favorecidoSchema,
  categoria: z.object({ id: uuid, codigo: z.string(), nome: z.string(), tipo: tipoDeCategoriaSchema, natureza: naturezaDeCategoriaSchema }),
  contaCorrente: z.object({ id: uuid, nome: z.string() }).nullable(),
  descricao: z.string(),
  valor: z.string(),
  vencimento: diaDoCalendario,
  /** Só na entrada. */
  competencia: competencia.nullable(),
  /** Nulo quando liquidado ou cancelado: não vence mais. */
  prazo: prazoDoLancamentoSchema.nullable(),
  /** Dia do pagamento ou do recebimento; nulo antes de liquidar. */
  liquidadoEm: diaDoCalendario.nullable(),
  anexos: z.number().int().nonnegative(),
  omie: omieDoLancamentoSchema,
  origem: z.object({
    tipo: origemDoLancamentoSchema,
    pedidoDeCompra: z.object({ id: uuid, numero: z.number().int().positive() }).nullable(),
  }),
  createdAt: isoDate,
});
export type LancamentoResumo = z.infer<typeof lancamentoResumoSchema>;

export const lancamentoSchema = lancamentoResumoSchema.extend({
  forma: formaDoLancamentoSchema.nullable(),
  observacao: z.string().nullable(),
  /** Quem fez cada marco; nulo enquanto não aconteceu. No cancelado, `etapa` guarda onde ele parou, como em Compras. */
  marcos: z.object({
    criado: registro,
    aprovado: registro.nullable(),
    pago: registro.extend({ pagoEm: diaDoCalendario }).nullable(),
    recebido: registro.extend({ recebidoEm: diaDoCalendario, valor: z.string() }).nullable(),
    conciliado: registro.nullable(),
    cancelado: registro.extend({ motivo: z.string() }).nullable(),
  }),
  /** O que a pessoa da requisição pode fazer agora, já considerando etapa e acesso. */
  acoesPermitidas: z.array(z.enum(acoesDoLancamento)),
  podeEditar: z.boolean(),
  updatedAt: isoDate,
});
export type Lancamento = z.infer<typeof lancamentoSchema>;

// ---------------------------------------------------------------- lista

/** Os ids do filtro único de Situação, agrupados como no protótipo aprovado. */
export const situacoesDoFiltroFinanceiro = [
  "pagar",
  "pagar-aberto",
  "pagar-aprovado",
  "pagar-vencido",
  "receber",
  "receber-gerado",
  "receber-cobranca",
  "receber-vencido",
  "concluido",
  "pago",
  "recebido",
  "conciliado",
  "vencidos",
  "erro",
  /** Fora do protótipo: sem ele, os cancelados não aparecem em nenhuma situação. */
  "cancelado",
] as const;
export const situacaoDoFiltroFinanceiroSchema = z.enum(situacoesDoFiltroFinanceiro);
export type SituacaoDoFiltroFinanceiro = z.infer<typeof situacaoDoFiltroFinanceiroSchema>;

/**
 * Vencimento, só do que não foi liquidado nem cancelado: `vencidos` antes de hoje,
 * `hoje`, `7` de hoje a hoje + 7 e `mes` até o fim do mês corrente, dias de Manaus.
 */
export const filtrosDeVencimento = ["vencidos", "hoje", "7", "mes"] as const;

export const LIMITE_DA_LISTA_DE_LANCAMENTOS = 300;

const filtrosDosLancamentos = {
  tipo: z.enum(["todos", ...tiposDeLancamento]).default("todos"),
  empresa: companyKeySchema.optional(),
  vencimento: z.enum(filtrosDeVencimento).optional(),
  /** Nome do favorecido, código ("CP-0412" ou "412") e descrição. */
  busca: z.string().trim().max(120).optional(),
};

/**
 * Sem situação, vale tudo, inclusive o liquidado; os cancelados só aparecem em
 * `situacao=cancelado`. Ordem: em aberto por vencimento crescente, depois os
 * liquidados do mais recente para o mais antigo, depois os cancelados.
 */
export const listarLancamentosQuerySchema = z
  .object({ ...filtrosDosLancamentos, situacao: situacaoDoFiltroFinanceiroSchema.optional() })
  .strict();
export type ListarLancamentosQuery = z.infer<typeof listarLancamentosQuerySchema>;

/**
 * Metric cards até `ate` (o fim do mês corrente em Manaus), em aberto. Valem a
 * empresa filtrada e ignoram tipo, situação, vencimento e busca. O que a pessoa
 * não alcança vem nulo e o card some (quem só tem `pagar` não vê o a receber nem
 * o saldo projetado).
 */
export const resumoDosLancamentosSchema = z.object({
  ate: diaDoCalendario,
  aReceber: z.object({ valor: z.string(), quantidade: z.number().int().nonnegative() }).nullable(),
  aPagar: z
    .object({ valor: z.string(), quantidade: z.number().int().nonnegative(), paraAprovar: z.number().int().nonnegative() })
    .nullable(),
  /** a receber − a pagar até `ate`, mais o saldo nas contas quando lido do OMIE. Nulo sem acesso aos dois tipos. */
  saldoProjetado: z.object({ valor: z.string(), saldoNasContas: z.string().nullable() }).nullable(),
  /** Vencidos de qualquer data, só do que a pessoa alcança; a parte que ela não alcança vem nula. */
  vencidos: z.object({ valor: z.string(), aReceber: z.string().nullable(), aPagar: z.string().nullable() }),
});
export type ResumoDosLancamentos = z.infer<typeof resumoDosLancamentosSchema>;

export const listarLancamentosRespostaSchema = z.object({
  itens: z.array(lancamentoResumoSchema),
  /** Total do filtro, que pode passar do teto de itens. */
  total: z.number().int().nonnegative(),
  resumo: resumoDosLancamentosSchema,
  /** Que tipos a pessoa alcança, para a tela esconder o filtro e os grupos que não valem. */
  alcance: z.object({ saidas: z.boolean(), entradas: z.boolean() }),
});
export type ListarLancamentosResposta = z.infer<typeof listarLancamentosRespostaSchema>;

// ---------------------------------------------------------------- quadro

/** Situação não se aplica ao quadro: as colunas já são a situação. */
export const quadroFinanceiroQuerySchema = z.object(filtrosDosLancamentos).strict();
export type QuadroFinanceiroQuery = z.infer<typeof quadroFinanceiroQuerySchema>;

/**
 * As quatro colunas, na ordem de `colunasDoQuadroFinanceiro`. Cancelados ficam
 * fora. `conciliado` traz só os conciliados no mês corrente de Manaus. Os totais
 * somam o conjunto inteiro da coluna, mesmo quando os itens passam do teto.
 */
export const quadroFinanceiroSchema = z.object({
  colunas: z.array(
    z.object({
      id: colunaDoQuadroFinanceiroSchema,
      quantidade: z.number().int().nonnegative(),
      totalEntradas: z.string(),
      totalSaidas: z.string(),
      itens: z.array(lancamentoResumoSchema),
    }),
  ),
  alcance: z.object({ saidas: z.boolean(), entradas: z.boolean() }),
});
export type QuadroFinanceiro = z.infer<typeof quadroFinanceiroSchema>;

/** Teto de cards por coluna do quadro. */
export const LIMITE_DE_CARDS_POR_COLUNA = 100;
