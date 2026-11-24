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
  /**
   * O saldo informado pela gerência e o dia a que ele se refere: o ponto de partida do
   * saldo da conta no Plugga OS (a conciliação pelo extrato calcula daí em diante).
   * Os dois juntos, ou nenhum. Opcional no contrato até a web ler.
   */
  saldoInicial: z.string().nullable().optional(),
  saldoInicialEm: diaDoCalendario.nullable().optional(),
  ativa: z.boolean(),
});
export type ContaCorrente = z.infer<typeof contaCorrenteSchema>;

// ---------------------------------------------------------------- cadastro (S3b)
// O plano de contas e as contas correntes são do Plugga OS (decisão de 24/11/2026).
// Só a gerência do Financeiro grava; quem lê é quem já lê as opções. Nada se apaga:
// o cadastro sai dos menus com `ativa: false`, e o lançamento que já o usa continua.

/** O código hierárquico próprio do Plugga OS: grupo, subgrupo e item ("2.01.01"). */
export const codigoDaCategoriaSchema = z.string().trim().regex(/^\d\.\d{2}\.\d{2}$/, "Use o formato 2.01.01.");
const nomeDoCadastro = z.string().trim().min(2, "Nome com ao menos 2 letras.").max(120);
const campoDoBanco = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable();

/** `POST financeiro/categorias`. A empresa é obrigatória; código e tipo não mudam depois. */
export const criarCategoriaFinanceiraSchema = z.object({
  empresa: companyKeySchema,
  codigo: codigoDaCategoriaSchema,
  nome: nomeDoCadastro,
  tipo: tipoDeCategoriaSchema,
  natureza: naturezaDeCategoriaSchema,
  grupoNome: z.string().trim().min(2).max(80),
}).strict();
export type CriarCategoriaFinanceira = z.infer<typeof criarCategoriaFinanceiraSchema>;

/** `PATCH financeiro/categorias/:id`: só nome, natureza, grupo e ativa. */
export const editarCategoriaFinanceiraSchema = z.object({
  nome: nomeDoCadastro,
  natureza: naturezaDeCategoriaSchema,
  grupoNome: z.string().trim().min(2).max(80),
  ativa: z.boolean(),
}).partial().strict().refine((v) => Object.keys(v).length > 0, "Nada para alterar.");
export type EditarCategoriaFinanceira = z.infer<typeof editarCategoriaFinanceiraSchema>;

/** O saldo informado pode ser negativo (o cheque especial). */
const saldoInformado = z.string().trim().regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Use um valor como 1500.00 ou -200.00.");
/** O saldo e o dia dele vão juntos: os dois, ou nenhum. */
const saldoComDia = (v: { saldoInicial?: string | null; saldoInicialEm?: string | null }) =>
  (v.saldoInicial === undefined) === (v.saldoInicialEm === undefined) && (v.saldoInicial === null) === (v.saldoInicialEm === null);
const SALDO_COM_DIA = { message: "Informe o saldo inicial junto com o dia dele.", path: ["saldoInicialEm"] };

/** `POST financeiro/contas-correntes`. Banco, agência e número são opcionais (o caixa não tem). */
export const criarContaCorrenteSchema = z.object({
  empresa: companyKeySchema,
  nome: nomeDoCadastro,
  banco: campoDoBanco(80).optional(),
  agencia: campoDoBanco(20).optional(),
  numero: campoDoBanco(30).optional(),
  saldoInicial: saldoInformado.optional(),
  saldoInicialEm: diaDoCalendario.optional(),
}).strict().refine(saldoComDia, SALDO_COM_DIA);
export type CriarContaCorrente = z.infer<typeof criarContaCorrenteSchema>;

/** `PATCH financeiro/contas-correntes/:id`. A empresa não muda; o saldo inicial sai com os dois nulos. */
export const editarContaCorrenteSchema = z.object({
  nome: nomeDoCadastro,
  banco: campoDoBanco(80),
  agencia: campoDoBanco(20),
  numero: campoDoBanco(30),
  saldoInicial: saldoInformado.nullable(),
  saldoInicialEm: diaDoCalendario.nullable(),
  ativa: z.boolean(),
}).partial().strict()
  .refine((v) => Object.keys(v).length > 0, "Nada para alterar.")
  .refine(saldoComDia, SALDO_COM_DIA);
export type EditarContaCorrente = z.infer<typeof editarContaCorrenteSchema>;

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
  /**
   * Os conectores externos do Financeiro e, por empresa, se a conexão está conferida
   * e confirmada. O Plugga OS é o dono do financeiro; um conector desligado não tira
   * função de tela nenhuma. Sem o campo, ou sem o conector, a tela trata como hoje.
   */
  conectores: z.object({ omie: z.record(companyKeySchema, z.boolean()) }).partial().optional(),
});
export type OpcoesDoFinanceiro = z.infer<typeof opcoesDoFinanceiroSchema>;
export type ConectoresDoFinanceiroNasOpcoes = NonNullable<OpcoesDoFinanceiro["conectores"]>;

// ---------------------------------------------------------------- entrada

/** Teto de numeric(14,2): acima disso o banco recusaria com erro interno. */
export const VALOR_MAXIMO_DO_LANCAMENTO = "999999999999.99";
const valorPositivo = decimalString
  .refine((v) => Number(v) > 0, "valor deve ser maior que zero")
  .refine((v) => v.split(".")[0]!.replace(/^0+(?=\d)/, "").length <= 12, "valor acima do máximo de R$ 999.999.999.999,99");
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
    /** Opcional (CC14): a conta pode nascer sem categoria e ser classificada depois. */
    categoriaId: uuid.optional(),
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
 * Transições pelo endpoint de ações (PLU-336 e PLU-337):
 * - `registrar_pagamento` (saída aprovada) exige um comprovante atual já anexado
 *   (409 com `campo: "comprovante"` sem ele); o dia não pode ser futuro;
 * - `registrar_recebimento` (entrada com boleto ou enviada): comprovante opcional;
 * - `registrar_nf` (entrada gerada), `registrar_boleto` (com NF; exige um anexo
 *   `boleto` atual, até o GerarBoleto do OMIE) e `registrar_envio` (com boleto);
 * - `registrar_cobranca` (entrada enviada) não muda a etapa: vai à linha do tempo;
 * - `corrigir_valor` antes de liquidar, com motivo; na saída aprovada, só a Gerente.
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

// ---------------------------------------------------------------- anexos e linha do tempo (PLU-337)

/**
 * Anexo do lançamento, no armazenamento do Plugga OS (o mesmo bucket dos documentos
 * do lead e das cotações). Nada se apaga (D9): um `comprovante`, `nf` ou `boleto`
 * novo marca o atual do mesmo tipo como substituído, e o anterior continua
 * baixável. `documento` (fatura, guia) pode haver quantos for. PDF, JPEG ou PNG,
 * conferidos pelo conteúdo, até 25 MiB.
 */
export const tiposDeAnexo = ["comprovante", "nf", "boleto", "documento"] as const;
export const tipoDeAnexoSchema = z.enum(tiposDeAnexo);
export type TipoDeAnexo = z.infer<typeof tipoDeAnexoSchema>;
export const ANEXO_DO_LANCAMENTO_MAX_BYTES = 25 * 1024 * 1024;

export const anexoDoLancamentoSchema = z.object({
  id: uuid,
  tipo: tipoDeAnexoSchema,
  nome: z.string(),
  /** Do comprovante: "aaaa-mm-dd · código · favorecido · valor.pdf". */
  nomePadronizado: z.string().nullable(),
  tamanhoBytes: z.number().int().positive(),
  mime: z.string(),
  /** Caminho da API para baixar, relativo (nunca a URL do armazenamento). */
  url: z.string(),
  enviado: registro,
  substituido: registro.nullable(),
});
export type AnexoDoLancamento = z.infer<typeof anexoDoLancamentoSchema>;

/** `POST financeiro/lancamentos/:id/anexos` (multipart: `arquivo` e `tipo`) → Lancamento. */
export const enviarAnexoSchema = z.object({ tipo: tipoDeAnexoSchema }).strict();
export type EnviarAnexo = z.infer<typeof enviarAnexoSchema>;

export const tiposDeEventoDoLancamento = [
  "criado", "editado", "aprovado", "valor_corrigido", "nf_registrada", "boleto_registrado",
  "enviado", "cobranca_registrada", "pago", "recebido", "conciliado", "cancelado",
  "anexo_enviado", "anexo_substituido", "omie",
] as const;
export const tipoDeEventoDoLancamentoSchema = z.enum(tiposDeEventoDoLancamento);

/** Um item da linha do tempo, do mais recente ao mais antigo. */
export const eventoDoLancamentoSchema = z.object({
  tipo: tipoDeEventoDoLancamentoSchema,
  em: isoDate,
  por: pessoa.nullable(),
  /** Pronto para a tela: "Valor corrigido de R$ 3.800,00 para R$ 3.950,00". */
  resumo: z.string(),
  /** Só o que a pessoa escreveu (o motivo, a nota da cobrança). */
  texto: z.string().nullable(),
});
export type EventoDoLancamento = z.infer<typeof eventoDoLancamentoSchema>;

/** O painel "O que falta", na ordem do fluxo. */
export const pendenciaDoLancamentoSchema = z.object({ texto: z.string(), feito: z.boolean(), opcional: z.boolean().optional() });
export type PendenciaDoLancamento = z.infer<typeof pendenciaDoLancamentoSchema>;

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
  /** Nula na despesa ainda não classificada (CC14); a cobrança sempre tem. */
  categoria: z.object({ id: uuid, codigo: z.string(), nome: z.string(), tipo: tipoDeCategoriaSchema, natureza: naturezaDeCategoriaSchema }).nullable(),
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
    pedidoDeCompra: z.object({
      id: uuid,
      numero: z.number().int().positive(),
      /** O valor original do pedido (a cotação vencedora, que criou a conta). A correção fica só na conta. */
      valor: z.string().optional(),
    }).nullable(),
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
  // PLU-337: anexos, linha do tempo, etapas da entrada e o painel "O que falta".
  /**
   * Os anexos, atuais e substituídos, do mais recente ao mais antigo. (`anexos`,
   * herdado do resumo, segue sendo a contagem dos atuais.)
   */
  arquivos: z.array(anexoDoLancamentoSchema),
  comprovanteAtual: anexoDoLancamentoSchema.nullable(),
  linhaDoTempo: z.array(eventoDoLancamentoSchema),
  /** Só na entrada. */
  nf: z.object({ numero: z.string(), registrada: registro }).nullable(),
  envio: registro.extend({ canal: z.string() }).nullable(),
  cobrancas: z.array(registro.extend({ canal: z.string(), nota: z.string().nullable() })),
  ucs: z.array(z.object({ id: uuid, codigo: z.string() })),
  pendencias: z.array(pendenciaDoLancamentoSchema),
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
  .strict()
  // O vencimento só vale para o que está em aberto: com os cancelados, a lista seria sempre vazia.
  .refine((q) => !(q.situacao === "cancelado" && q.vencimento), { path: ["vencimento"], message: "o vencimento não se aplica aos cancelados" });
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

// ---------------------------------------------------------------- só os metric cards

/** `GET financeiro/lancamentos/resumo`: os metric cards sem a lista (o quadro usa). Só a empresa recorta. */
export const resumoDosLancamentosQuerySchema = z.object({ empresa: companyKeySchema.optional() }).strict();
export type ResumoDosLancamentosQuery = z.infer<typeof resumoDosLancamentosQuerySchema>;

export const resumoDosLancamentosRespostaSchema = z.object({
  resumo: resumoDosLancamentosSchema,
  alcance: z.object({ saidas: z.boolean(), entradas: z.boolean() }),
});
export type ResumoDosLancamentosResposta = z.infer<typeof resumoDosLancamentosRespostaSchema>;

// ---------------------------------------------------------------- cobrança manual (PLU-337, A7)

/**
 * `POST financeiro/cobrancas` → Lancamento (entrada `gerada`, origem `cobranca_manual`).
 * Uma por cliente, empresa e competência (F3): a repetida é 409 com
 * `existente: { codigo, id }` da existente. Categoria de receita da empresa; as UCs
 * são do cliente e ficam listadas dentro da cobrança.
 */
export const criarCobrancaSchema = z
  .object({
    empresa: companyKeySchema,
    clientId: uuid,
    competencia,
    categoriaId: uuid,
    contaCorrenteId: uuid.nullable().optional(),
    descricao: textoObrigatorio(200),
    valor: valorPositivo,
    vencimento: diaDoCalendario,
    ucIds: z.array(uuid).max(100).default([]),
    observacao: textoOpcional(2000),
  })
  .strict();
export type CriarCobranca = z.infer<typeof criarCobrancaSchema>;

/** `GET financeiro/clientes?busca=` (2+ letras): só id, nome e as UCs. */
export const buscarClientesDoFinanceiroQuerySchema = z.object({ busca: z.string().trim().min(2).max(120) }).strict();
export type BuscarClientesDoFinanceiroQuery = z.infer<typeof buscarClientesDoFinanceiroQuerySchema>;
export const clientesDoFinanceiroRespostaSchema = z.object({
  itens: z.array(z.object({ id: uuid, nome: z.string(), ucs: z.array(z.object({ id: uuid, codigo: z.string() })) })),
});
export type ClientesDoFinanceiroResposta = z.infer<typeof clientesDoFinanceiroRespostaSchema>;

/**
 * `GET financeiro/cobrancas/sugestao?empresa=&clientId=&competencia=` (F4): o valor
 * da cobrança do mesmo cliente e empresa na competência anterior mais recente.
 */
export const sugestaoDeCobrancaQuerySchema = z.object({ empresa: companyKeySchema, clientId: uuid, competencia }).strict();
export type SugestaoDeCobrancaQuery = z.infer<typeof sugestaoDeCobrancaQuerySchema>;
export const sugestaoDeCobrancaRespostaSchema = z.object({
  valor: z.string().nullable(),
  competencia: competencia.nullable(),
  codigo: z.string().nullable(),
});
export type SugestaoDeCobrancaResposta = z.infer<typeof sugestaoDeCobrancaRespostaSchema>;

// ---------------------------------------------------------------- baixar comprovantes (PLU-337)

/**
 * `GET financeiro/comprovantes.zip?empresa=&de=&ate=&tipo=` → application/zip com os
 * comprovantes ATUAIS dos lançamentos pagos ou recebidos no período (pelo dia do
 * pagamento ou do recebimento), com o nome padronizado. Só os tipos que a pessoa
 * alcança. Até 500 arquivos; acima disso, 422 pedindo período menor.
 */
export const LIMITE_DE_COMPROVANTES_NO_ZIP = 500;
export const baixarComprovantesQuerySchema = z
  .object({
    empresa: companyKeySchema.optional(),
    de: diaDoCalendario,
    ate: diaDoCalendario,
    tipo: z.enum(["todos", ...tiposDeLancamento]).default("todos"),
  })
  .strict()
  .refine((q) => q.de <= q.ate, { path: ["ate"], message: "o fim do período vem depois do início" });
export type BaixarComprovantesQuery = z.infer<typeof baixarComprovantesQuerySchema>;

// ---------------------------------------------------------------- conciliação (PLU-339)
// O extrato vem do banco, por arquivo (OFX; CSV depois), e não do OMIE (decisão de
// 24/11/2026). A descrição dos movimentos é dado bancário: só aparece nesta tela.

export const origensDoExtrato = ["ofx", "csv"] as const;
export const estadosDoMovimentoDoExtrato = ["pendente", "conciliado", "marcado"] as const;

/** Uma linha do extrato bancário: o valor com sinal (+ crédito, − débito). */
export const movimentoDoExtratoSchema = z.object({
  id: uuid,
  contaCorrenteId: uuid,
  dia: diaDoCalendario,
  valor: z.string(),
  descricao: z.string(),
  estado: z.enum(estadosDoMovimentoDoExtrato),
});
export type MovimentoDoExtrato = z.infer<typeof movimentoDoExtratoSchema>;

/** Um arquivo de extrato importado. `repetidos`: os movimentos que já tinham entrado por outro arquivo. */
export const extratoImportadoSchema = z.object({
  id: uuid,
  contaCorrenteId: uuid,
  origem: z.enum(origensDoExtrato),
  arquivoNome: z.string(),
  periodo: z.object({ de: diaDoCalendario, ate: diaDoCalendario }),
  /** O saldo que o banco informa no arquivo, só para conferência. */
  saldoInformado: z.object({ valor: z.string(), em: diaDoCalendario }).nullable(),
  movimentos: z.number().int().nonnegative(),
  novos: z.number().int().nonnegative(),
  repetidos: z.number().int().nonnegative(),
  importadoEm: isoDate,
  /**
   * Só na resposta da importação: deu para conferir se o arquivo é da conta? Falso quando
   * falta o número da conta no cadastro ou no arquivo; a tela avisa para a pessoa conferir.
   */
  contaConferida: z.boolean().optional(),
});
export type ExtratoImportado = z.infer<typeof extratoImportadoSchema>;

/** `GET financeiro/conciliacao/movimentos`: uma conta e um período de até um ano. */
export const listarMovimentosDoExtratoQuerySchema = z
  .object({ contaCorrenteId: uuid, de: diaDoCalendario, ate: diaDoCalendario })
  .strict()
  .refine((q) => q.de <= q.ate, { message: "O fim do período vem depois do início.", path: ["ate"] })
  .refine((q) => (Date.parse(q.ate) - Date.parse(q.de)) / 86_400_000 <= 366, { message: "O período vai até um ano.", path: ["ate"] });
export type ListarMovimentosDoExtratoQuery = z.infer<typeof listarMovimentosDoExtratoQuerySchema>;

export const movimentosDoExtratoRespostaSchema = z.object({
  itens: z.array(movimentoDoExtratoSchema),
  /** Os arquivos com movimento no período, do mais recente para o mais antigo. */
  extratos: z.array(extratoImportadoSchema),
});
export type MovimentosDoExtratoResposta = z.infer<typeof movimentosDoExtratoRespostaSchema>;

// ---------------------------------------------------------------- conciliar (PLU-339, C3)

/** O lado do Plugga OS no par: o lançamento pago ou recebido, com o valor liquidado sem sinal. */
export const lancamentoNaConciliacaoSchema = z.object({
  id: uuid,
  tipo: tipoDeLancamentoSchema,
  codigo: z.string(),
  empresa: companyKeySchema,
  contaCorrenteId: uuid,
  /** O fornecedor (saída) ou o cliente (entrada), pronto para a linha. */
  favorecido: z.string(),
  descricao: z.string(),
  valor: z.string(),
  liquidadoEm: diaDoCalendario,
  /** "Marcar pendente" do lado do lançamento: o pago que ainda não apareceu no extrato. */
  marcado: z.boolean(),
});
export type LancamentoNaConciliacao = z.infer<typeof lancamentoNaConciliacaoSchema>;

const parDaConciliacaoSchema = z.object({ movimento: movimentoDoExtratoSchema, lancamento: lancamentoNaConciliacaoSchema });

/** Uma conta, ou todas as que a pessoa alcança (filtradas pela empresa, se vier), num período de até um ano. */
export const escopoDaConciliacaoSchema = z
  .object({ contaCorrenteId: uuid.optional(), empresa: companyKeySchema.optional(), de: diaDoCalendario, ate: diaDoCalendario })
  .strict()
  .refine((q) => q.de <= q.ate, { message: "O fim do período vem depois do início.", path: ["ate"] })
  .refine((q) => (Date.parse(q.ate) - Date.parse(q.de)) / 86_400_000 <= 366, { message: "O período vai até um ano.", path: ["ate"] });
export type EscopoDaConciliacao = z.infer<typeof escopoDaConciliacaoSchema>;

/**
 * `GET financeiro/conciliacao`. Sugerido: mesma conta, mesmo sentido (saída = débito), mesmo
 * valor e data a ±3 dias, par único dos dois lados. Valor diferente: idem, com outro valor.
 * `faltaConciliar`: os movimentos não conciliados (em módulo) mais o liquidado dos sem extrato.
 */
export const painelDaConciliacaoSchema = z.object({
  escopo: z.object({ contaCorrenteId: uuid.nullable(), empresa: companyKeySchema.nullable(), de: diaDoCalendario, ate: diaDoCalendario }),
  resumo: z.object({
    movimentos: z.number().int().nonnegative(),
    conciliados: z.number().int().nonnegative(),
    sugeridos: z.number().int().nonnegative(),
    valorDiferente: z.number().int().nonnegative(),
    semLancamento: z.number().int().nonnegative(),
    semExtrato: z.number().int().nonnegative(),
    faltaConciliar: z.string(),
  }),
  sugeridos: z.array(parDaConciliacaoSchema),
  /** `diferenca`: o lançamento menos o extrato, com sinal. */
  valorDiferente: z.array(parDaConciliacaoSchema.extend({ diferenca: z.string() })),
  /**
   * Os pendentes e os marcados. `candidatos`: os ids dos lançamentos possíveis pela mesma regra
   * do sugerido (mesma conta, sentido e valor, a ±3 dias, sem par e não marcados); com 2 ou
   * mais, a linha é ambígua e a pessoa escolhe o par.
   */
  semLancamento: z.array(movimentoDoExtratoSchema.extend({ candidatos: z.array(uuid).optional() })),
  /** `candidatos`: os ids das linhas do extrato possíveis, pelo mesmo critério. */
  semExtrato: z.array(lancamentoNaConciliacaoSchema.extend({ candidatos: z.array(uuid).optional() })),
  conciliados: z.array(parDaConciliacaoSchema.extend({ conciliadoEm: isoDate, conciliadoPor: z.object({ id: uuid, nome: z.string() }).nullable() })),
  /** Os arquivos de extrato do escopo que tocam o período. */
  extratos: z.array(extratoImportadoSchema),
});
export type PainelDaConciliacao = z.infer<typeof painelDaConciliacaoSchema>;

/** `POST financeiro/conciliacao/conciliar`: sempre o mesmo valor; senão, 409 com a mensagem pronta. */
export const conciliarSchema = z.object({ movimentoId: uuid, lancamentoId: uuid }).strict();
export type Conciliar = z.infer<typeof conciliarSchema>;

/** `POST financeiro/conciliacao/desfazer`: só a gerência, com motivo. */
export const desfazerConciliacaoSchema = z.object({ movimentoId: uuid, motivo: z.string().trim().min(3, "Informe o motivo.").max(500) }).strict();
export type DesfazerConciliacao = z.infer<typeof desfazerConciliacaoSchema>;

/** `POST financeiro/conciliacao/marcar`: "Marcar pendente" e "Retomar", da linha do extrato ou do lançamento. */
export const marcarNaConciliacaoSchema = z.union([
  z.object({ movimentoId: uuid, marcado: z.boolean() }).strict(),
  z.object({ lancamentoId: uuid, marcado: z.boolean() }).strict(),
]);
export type MarcarNaConciliacao = z.infer<typeof marcarNaConciliacaoSchema>;
