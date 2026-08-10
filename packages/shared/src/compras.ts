import { z } from "zod";

import { companyKeySchema } from "./organization.js";
import { decimalString, isoDate, uuid } from "./primitivas.js";

/**
 * Contratos do processo de Compras e Suprimentos (POP-COMP-001 v2.3 + FLX-COMP).
 *
 * O POP descreve o processo rodando no Bitrix24; aqui ele é nativo, e o espelho
 * do Bitrix segue read-only (ADR-0009). Onde o documento diz "o card migra
 * automaticamente", a migração é a transição transacional do módulo `compras`.
 */

// --- Vocabulário ---------------------------------------------------------

/**
 * As sete etapas do POP §2, na ordem do fluxograma. `concluido` é terminal e,
 * ao contrário das outras, **não é etapa mensurada**: não tem SLA no POP §3 e
 * nunca gera passagem em `pedidos_de_compra_etapas`.
 */
export const comprasEtapaSchema = z.enum([
  "pedido_gerado",
  "analise_estoque",
  "cotacoes",
  "aprovacao_compra",
  "pagamento",
  "retirada",
  "concluido",
]);
export type ComprasEtapa = z.infer<typeof comprasEtapaSchema>;

/** Etapas que o POP §3 mede — todas menos o terminal. */
export const COMPRAS_ETAPAS_MENSURADAS = [
  "pedido_gerado",
  "analise_estoque",
  "cotacoes",
  "aprovacao_compra",
  "pagamento",
  "retirada",
] as const satisfies readonly ComprasEtapa[];

export type ComprasEtapaMensurada = (typeof COMPRAS_ETAPAS_MENSURADAS)[number];

/** A decisão "possui em estoque?" do fluxograma: SIM é interno, NÃO é externo. */
export const comprasOrigemAtendimentoSchema = z.enum(["estoque", "aquisicao"]);
export type ComprasOrigemAtendimento = z.infer<typeof comprasOrigemAtendimentoSchema>;

/**
 * Para onde vai o material. O POP fala em "Obra / Cliente de destino"; `interno`
 * existe porque compra de escritório não tem nenhum dos dois e, sem essa opção,
 * não teria como ser registrada sem falsificar um destino.
 */
export const comprasDestinoSchema = z.enum(["obra", "cliente", "interno"]);
export type ComprasDestino = z.infer<typeof comprasDestinoSchema>;

/**
 * Farol EOS do POP §4.1/§4.3. `fora_da_regua` cobre a assertividade acima de
 * 100%: a tabela do §4.1 define verde como "95% a 100%", então faturar mais que
 * o orçado não é verde — é desvio que o §4.1 manda diagnosticar por ter saído
 * da faixa. Chamar isso de verde inventaria régua que o documento não tem.
 */
export const farolEosSchema = z.enum(["verde", "amarelo", "vermelho", "fora_da_regua"]);
export type FarolEos = z.infer<typeof farolEosSchema>;

// --- Constantes do POP ---------------------------------------------------

/** POP §3 — prazos máximos por etapa, em dias úteis. */
export const COMPRAS_SLA_DIAS_UTEIS = {
  pedido_gerado: 2,
  analise_estoque: 2,
  cotacoes: 5,
  aprovacao_compra: 2,
  pagamento: 2,
  // Mínimo. O POP diz "5 dias úteis ou mais, dependendo do cronograma de
  // fornecedor externo" — a extensão só vale na aquisição externa, e sai do
  // prazo que o próprio fornecedor declarou na cotação escolhida.
  retirada: 5,
} as const satisfies Record<ComprasEtapaMensurada, number>;

/** POP §3 — ciclo de referência da aquisição externa: 2+2+5+2+2+5. */
export const COMPRAS_CICLO_REFERENCIA_DIAS_UTEIS = 18;

/** POP §4.3 — cortes objetivos do Indicador Cruzado (ferramenta de diagnóstico). */
export const COMPRAS_CORTE_ANALISE_DIAS_UTEIS = 2;
/** cotações 5 + aprovação 2 + pagamento 2. */
export const COMPRAS_CORTE_AQUISICAO_DIAS_UTEIS = 9;

/** POP §4.1/§4.3 — a régua do farol, em pontos percentuais. */
export const COMPRAS_FAROL_VERDE_MINIMO = 95;
export const COMPRAS_FAROL_AMARELO_MINIMO = 85;
export const COMPRAS_FAROL_VERDE_MAXIMO = 100;

/**
 * Alçada de aprovação: acima deste valor a decisão sobe para `diretoria`.
 *
 * Nasce **sem teto** (`null`), o que reproduz o POP exatamente — ele não define
 * faixa de valor, e toda aprovação é da Gestão Financeira. Definir um número
 * liga o degrau da diretoria sem mudar mais nada no fluxo.
 */
export const COMPRAS_ALCADA_FINANCEIRO: number | null = null;

// --- Entidades -----------------------------------------------------------

/** Quantidade admite 3 casas: material se compra em metro, quilo e litro. */
const quantidadeDecimal = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "quantidade deve ser um decimal com até 3 casas");

export const itemDePedidoSchema = z.object({
  id: uuid,
  descricao: z.string(),
  quantidade: quantidadeDecimal,
  unidade: z.string().nullable(),
});
export type ItemDePedido = z.infer<typeof itemDePedidoSchema>;

export const cotacaoSchema = z.object({
  id: uuid,
  fornecedorId: uuid,
  fornecedorNome: z.string(),
  valor: decimalString,
  valorFrete: decimalString.nullable(),
  prazoEntregaDias: z.number().int().nonnegative().nullable(),
  condicoesPagamento: z.string().nullable(),
  arquivoNome: z.string(),
  selecionada: z.boolean(),
  createdAt: isoDate,
});
export type Cotacao = z.infer<typeof cotacaoSchema>;

/**
 * Uma passagem por uma etapa. Há mais de uma linha da mesma etapa quando o
 * fluxo volta por REVISAR, e é isso que o indicador 4.3 deve enxergar.
 */
export const passagemDeEtapaSchema = z.object({
  id: uuid,
  etapa: comprasEtapaSchema,
  entrouEm: isoDate,
  prazoDiasUteis: z.number().int().positive(),
  prazoEm: isoDate,
  saiuEm: isoDate.nullable(),
  cumpriuPrazo: z.boolean().nullable(),
  responsavelId: uuid.nullable(),
  responsavelNome: z.string().nullable(),
});
export type PassagemDeEtapa = z.infer<typeof passagemDeEtapaSchema>;

/** Situação do prazo da etapa aberta, calculada na leitura. */
export const situacaoPrazoSchema = z.enum(["no_prazo", "vence_hoje", "vencida", "sem_prazo"]);
export type SituacaoPrazo = z.infer<typeof situacaoPrazoSchema>;

export const pedidoResumoSchema = z.object({
  id: uuid,
  companyId: companyKeySchema,
  numero: z.number().int().positive(),
  titulo: z.string(),
  etapa: comprasEtapaSchema,
  origemAtendimento: comprasOrigemAtendimentoSchema.nullable(),
  destino: comprasDestinoSchema,
  obraId: uuid.nullable(),
  obraNome: z.string().nullable(),
  clientId: uuid.nullable(),
  clientNome: z.string().nullable(),
  solicitanteId: uuid,
  solicitanteNome: z.string(),
  responsavelId: uuid.nullable(),
  responsavelNome: z.string().nullable(),
  prazoEntregaDesejado: isoDate,
  valorOrcado: decimalString,
  valorCotado: decimalString.nullable(),
  valorFaturado: decimalString.nullable(),
  prazoEtapaEm: isoDate.nullable(),
  situacaoPrazo: situacaoPrazoSchema,
  concluidoEm: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type PedidoResumo = z.infer<typeof pedidoResumoSchema>;

export const pedidoListaSchema = z.object({ items: z.array(pedidoResumoSchema) });
export type PedidoLista = z.infer<typeof pedidoListaSchema>;

/**
 * `acoesBloqueadas` diz **por que** uma ação não está disponível para quem está
 * lendo. A tela mostra o botão desabilitado com o motivo em vez de escondê-lo:
 * botão que some faz a pessoa procurar, e a segregação de função só educa se
 * for visível.
 */
export const acaoBloqueadaSchema = z.object({
  acao: z.string(),
  motivo: z.string(),
});
export type AcaoBloqueada = z.infer<typeof acaoBloqueadaSchema>;

export const pedidoDetalheSchema = pedidoResumoSchema.extend({
  necessidadeValidadaEm: isoDate.nullable(),
  cotacaoSelecionadaId: uuid.nullable(),
  itens: z.array(itemDePedidoSchema),
  cotacoes: z.array(cotacaoSchema),
  etapas: z.array(passagemDeEtapaSchema),
  acoesBloqueadas: z.array(acaoBloqueadaSchema),
});
export type PedidoDetalhe = z.infer<typeof pedidoDetalheSchema>;

// --- Cadastros de apoio --------------------------------------------------

export const fornecedorSchema = z.object({
  id: uuid,
  companyId: companyKeySchema,
  nome: z.string(),
  documento: z.string().nullable(),
  ativo: z.boolean(),
});
export type Fornecedor = z.infer<typeof fornecedorSchema>;

export const fornecedorListaSchema = z.object({ items: z.array(fornecedorSchema) });
export type FornecedorLista = z.infer<typeof fornecedorListaSchema>;

export const criarFornecedorRequestSchema = z
  .object({
    companyId: companyKeySchema,
    nome: z.string().trim().min(1).max(200),
    documento: z.string().trim().max(20).optional(),
  })
  .strict();
export type CriarFornecedorRequest = z.infer<typeof criarFornecedorRequestSchema>;

export const obraSchema = z.object({
  id: uuid,
  companyId: companyKeySchema,
  nome: z.string(),
  clientId: uuid.nullable(),
  clientNome: z.string().nullable(),
  ativa: z.boolean(),
});
export type Obra = z.infer<typeof obraSchema>;

export const obraListaSchema = z.object({ items: z.array(obraSchema) });
export type ObraLista = z.infer<typeof obraListaSchema>;

export const criarObraRequestSchema = z
  .object({
    companyId: companyKeySchema,
    nome: z.string().trim().min(1).max(200),
    clientId: uuid.optional(),
  })
  .strict();
export type CriarObraRequest = z.infer<typeof criarObraRequestSchema>;

// --- Requests do fluxo ---------------------------------------------------

export const novoItemSchema = z
  .object({
    descricao: z.string().trim().min(1).max(500),
    quantidade: quantidadeDecimal,
    unidade: z.string().trim().max(20).optional(),
  })
  .strict();
export type NovoItem = z.infer<typeof novoItemSchema>;

/** Metadados de um orçamento anexado; o arquivo vem na mesma parte multipart, na mesma ordem. */
export const novaCotacaoSchema = z
  .object({
    fornecedorId: uuid,
    valor: decimalString,
    valorFrete: decimalString.optional(),
    prazoEntregaDias: z.number().int().nonnegative().max(365).optional(),
    condicoesPagamento: z.string().trim().max(200).optional(),
  })
  .strict();
export type NovaCotacao = z.infer<typeof novaCotacaoSchema>;

/**
 * Geração do pedido — POP §2.1. Os sete campos obrigatórios do documento, mais
 * o valor orçado, que a fórmula do §4.1 exige e o POP não lista.
 *
 * `cotacoes` é obrigatório com ao menos um item porque o POP exige a anexação
 * dos orçamentos **na geração**. Criar primeiro e anexar depois abriria uma
 * janela em que existe pedido sem a evidência que a análise vai usar.
 */
export const criarPedidoRequestSchema = z
  .object({
    companyId: companyKeySchema,
    titulo: z.string().trim().min(1).max(200),
    itens: z.array(novoItemSchema).min(1).max(100),
    destino: comprasDestinoSchema,
    obraId: uuid.optional(),
    clientId: uuid.optional(),
    responsavelId: uuid,
    prazoEntregaDesejado: isoDate,
    valorOrcado: decimalString,
    cotacoes: z.array(novaCotacaoSchema).min(1).max(20),
  })
  .strict()
  .superRefine((valor, contexto) => {
    if (valor.destino === "obra" && !valor.obraId) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        message: "destino obra exige a obra vinculada",
        path: ["obraId"],
      });
    }
    if (valor.destino === "cliente" && !valor.clientId) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        message: "destino cliente exige o cliente vinculado",
        path: ["clientId"],
      });
    }
    if (valor.destino === "interno" && (valor.obraId || valor.clientId)) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        message: "destino interno não aceita obra nem cliente",
        path: ["destino"],
      });
    }
    if (Number(valor.valorOrcado) <= 0) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        message: "valor orçado precisa ser maior que zero: é o denominador da assertividade global",
        path: ["valorOrcado"],
      });
    }
  });
export type CriarPedidoRequest = z.infer<typeof criarPedidoRequestSchema>;

export const triagemRequestSchema = z
  .object({ responsavelId: uuid.optional() })
  .strict();
export type TriagemRequest = z.infer<typeof triagemRequestSchema>;

/** A decisão do losango "Possui em estoque?" do fluxograma. */
export const decisaoEstoqueRequestSchema = z
  .object({
    possuiEmEstoque: z.boolean(),
    observacao: z.string().trim().max(500).optional(),
  })
  .strict();
export type DecisaoEstoqueRequest = z.infer<typeof decisaoEstoqueRequestSchema>;

/** "Validar necessidade do material", caixa do fluxograma antes de analisar as cotações. */
export const validarNecessidadeRequestSchema = z
  .object({ observacao: z.string().trim().max(500).optional() })
  .strict();
export type ValidarNecessidadeRequest = z.infer<typeof validarNecessidadeRequestSchema>;

export const selecionarCotacaoRequestSchema = z
  .object({ cotacaoId: uuid })
  .strict();
export type SelecionarCotacaoRequest = z.infer<typeof selecionarCotacaoRequestSchema>;

/**
 * O losango "Compra aprovada?" — APROVADA segue para pagamento, REVISAR volta
 * para cotações. É o único retorno do fluxo, e exige motivo: sem ele, a volta
 * chega em Compras sem dizer o que revisar.
 */
export const decisaoAprovacaoRequestSchema = z
  .object({
    aprovada: z.boolean(),
    motivo: z.string().trim().max(500).optional(),
    // A Gestão Financeira também vincula Obra/Cliente (POP §1): pode corrigir
    // o destino no ato da aprovação, em vez de devolver o pedido só por isso.
    destino: comprasDestinoSchema.optional(),
    obraId: uuid.nullable().optional(),
    clientId: uuid.nullable().optional(),
    /** Justificativa da dispensa de segregação; só a diretoria pode usar. */
    dispensaSegregacao: z.string().trim().min(10).max(500).optional(),
  })
  .strict()
  .superRefine((valor, contexto) => {
    if (!valor.aprovada && !valor.motivo) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        message: "revisar exige o motivo — sem ele a volta chega sem dizer o que revisar",
        path: ["motivo"],
      });
    }
  });
export type DecisaoAprovacaoRequest = z.infer<typeof decisaoAprovacaoRequestSchema>;

export const registrarPagamentoRequestSchema = z
  .object({
    valorFaturado: decimalString,
    observacao: z.string().trim().max(500).optional(),
    dispensaSegregacao: z.string().trim().min(10).max(500).optional(),
  })
  .strict();
export type RegistrarPagamentoRequest = z.infer<typeof registrarPagamentoRequestSchema>;

/**
 * Confirmação do recebimento, feita por **quem pediu o material**.
 *
 * O POP §2.2/§2.5 dá o CONCLUIR ao Responsável de Compras, e esta é uma
 * divergência consciente: quem escolheu o fornecedor atestar que a mercadoria
 * dele chegou é a brecha clássica da entrega fantasma. O próprio POP aponta a
 * segunda pessoa certa ao dizer que o responsável "informa o repasse/entrega do
 * produto ao solicitante" — é o solicitante que tem o material na mão.
 *
 * `confirmacaoPorTerceiro` é a saída para o dia em que o solicitante não está:
 * a diretoria confirma no lugar dele, por escrito, e o desvio fica registrado.
 */
export const confirmarRecebimentoRequestSchema = z
  .object({
    observacao: z.string().trim().max(500).optional(),
    dispensaSegregacao: z.string().trim().min(10).max(500).optional(),
    confirmacaoPorTerceiro: z.string().trim().min(10).max(500).optional(),
  })
  .strict();
export type ConfirmarRecebimentoRequest = z.infer<typeof confirmarRecebimentoRequestSchema>;

/**
 * Renegociação de prazo. O POP §3 diz que o prazo "deve ser renegociado antes
 * do vencimento quando necessário" — depois de vencido não há renegociação, há
 * atraso, e apagá-lo reescreveria o indicador 4.3.
 */
export const renegociarPrazoRequestSchema = z
  .object({
    prazoDiasUteis: z.number().int().positive().max(120),
    motivo: z.string().trim().min(1).max(500),
  })
  .strict();
export type RenegociarPrazoRequest = z.infer<typeof renegociarPrazoRequestSchema>;

export const pedidoListaQuerySchema = z
  .object({
    companyId: companyKeySchema,
    etapa: comprasEtapaSchema.optional(),
    responsavelId: uuid.optional(),
    situacaoPrazo: situacaoPrazoSchema.optional(),
  })
  .strict();
export type PedidoListaQuery = z.infer<typeof pedidoListaQuerySchema>;

// --- Indicadores (POP §4) ------------------------------------------------

export const periodoQuerySchema = z
  .object({
    companyId: companyKeySchema,
    de: isoDate,
    ate: isoDate,
  })
  .strict()
  .superRefine((valor, contexto) => {
    if (new Date(valor.de) > new Date(valor.ate)) {
      contexto.addIssue({ code: z.ZodIssueCode.custom, message: "o início do período é depois do fim" });
    }
  });
export type PeriodoQuery = z.infer<typeof periodoQuerySchema>;

/**
 * 4.1 — Assertividade Global. `percentual` é nulo quando não houve pedido
 * elegível no período: zero diria "nada foi realizado", e não é isso.
 */
export const assertividadeGlobalSchema = z.object({
  percentual: z.number().nullable(),
  farol: farolEosSchema.nullable(),
  totalOrcado: decimalString,
  totalFaturado: decimalString,
  pedidosConsiderados: z.number().int().nonnegative(),
});
export type AssertividadeGlobal = z.infer<typeof assertividadeGlobalSchema>;

/**
 * 4.2 — % Backlog Crítico, por executor. Sem farol: o POP não define faixas
 * para este indicador, e inventar cor seria acrescentar régua ao documento.
 */
export const backlogCriticoPorExecutorSchema = z.object({
  responsavelId: uuid.nullable(),
  responsavelNome: z.string().nullable(),
  emitidas: z.number().int().nonnegative(),
  concluidas: z.number().int().nonnegative(),
  pendentesNoPrazo: z.number().int().nonnegative(),
  pendentesVencidas: z.number().int().nonnegative(),
  percentualBacklogCritico: z.number().nullable(),
});
export type BacklogCriticoPorExecutor = z.infer<typeof backlogCriticoPorExecutorSchema>;

export const backlogCriticoSchema = z.object({
  porExecutor: z.array(backlogCriticoPorExecutorSchema),
  total: backlogCriticoPorExecutorSchema,
});
export type BacklogCritico = z.infer<typeof backlogCriticoSchema>;

/** 4.3 — Cumprimento de SLA por etapa. */
export const cumprimentoSlaPorEtapaSchema = z.object({
  etapa: comprasEtapaSchema,
  concluidas: z.number().int().nonnegative(),
  noPrazo: z.number().int().nonnegative(),
  percentual: z.number().nullable(),
  farol: farolEosSchema.nullable(),
});
export type CumprimentoSlaPorEtapa = z.infer<typeof cumprimentoSlaPorEtapaSchema>;

export const scorecardComprasSchema = z.object({
  companyId: companyKeySchema,
  de: isoDate,
  ate: isoDate,
  assertividadeGlobal: assertividadeGlobalSchema,
  backlogCritico: backlogCriticoSchema,
  cumprimentoSla: z.array(cumprimentoSlaPorEtapaSchema),
  /** Quebras de segregação no período — o preço de deixar a regra ser dispensada. */
  dispensasDeSegregacao: z.number().int().nonnegative(),
});
export type ScorecardCompras = z.infer<typeof scorecardComprasSchema>;

/** Quadrantes do Indicador Cruzado (POP §4.3), fora do scorecard. */
export const quadranteCruzadoSchema = z.enum([
  "analise_baixa_aquisicao_baixa",
  "analise_alta_aquisicao_baixa",
  "analise_baixa_aquisicao_alta",
  "analise_alta_aquisicao_alta",
]);
export type QuadranteCruzado = z.infer<typeof quadranteCruzadoSchema>;

export const diagnosticoComprasSchema = z.object({
  companyId: companyKeySchema,
  de: isoDate,
  ate: isoDate,
  assertividadeOrcamentaria: z.object({
    percentual: z.number().nullable(),
    totalOrcado: decimalString,
    totalCotado: decimalString,
  }),
  assertividadeExecucao: z.object({
    percentual: z.number().nullable(),
    totalCotado: decimalString,
    totalFaturado: decimalString,
  }),
  indicadorCruzado: z.object({
    tempoMedioAnaliseDiasUteis: z.number().nullable(),
    tempoMedioAquisicaoDiasUteis: z.number().nullable(),
    quadrante: quadranteCruzadoSchema.nullable(),
    pedidosConsiderados: z.number().int().nonnegative(),
  }),
});
export type DiagnosticoCompras = z.infer<typeof diagnosticoComprasSchema>;
