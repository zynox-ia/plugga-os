import { z } from "zod";

/**
 * Estudo de Eficiência Energética — Plugga → Energia → Eficiência energética.
 *
 * Contratos do estudo: premissas versionadas, dados da fatura e resultados de
 * cálculo. As regras vivem em apps/api/src/energy-efficiency/calculo; aqui só
 * as formas de dado, sem framework.
 *
 * Valores monetários são `number` em reais. Precisão dupla comporta a ordem de
 * grandeza envolvida (milhões com centavos) sem erro perceptível; o
 * arredondamento acontece só na apresentação, nunca no meio do cálculo.
 *
 * Ver docs/decisoes-estudo-eficiencia-energetica.md.
 */

// --- Estados do estudo -----------------------------------------------------

export const energyStudyStatusSchema = z.enum([
  "rascunho",
  "aguardando_dados",
  "dados_recebidos",
  "em_extracao",
  "em_auditoria",
  "em_calculo",
  "relatorio_gerado",
  "em_validacao",
  "bloqueado",
  "aprovado_internamente",
  "enviado_cliente",
  "arquivado",
  "cancelado",
]);
export type EnergyStudyStatus = z.infer<typeof energyStudyStatusSchema>;

/**
 * O modo muda o que o estudo pode afirmar. Os dois modos usam o motor completo
 * do PRD; `preliminar` trabalha com o consumo mensal e 21 dias úteis, enquanto
 * `memoria_massa` poderá substituir essa aproximação pela curva de 15 minutos.
 */
export const calculationModeSchema = z.enum(["preliminar", "memoria_massa"]);
export type CalculationMode = z.infer<typeof calculationModeSchema>;

// --- Premissas -------------------------------------------------------------

/**
 * Premissas versionadas por data de vigência. Sem isso um estudo antigo fica
 * inexplicável quando a premissa muda — e foi exatamente o que aconteceu com a
 * fórmula do BESS: os estudos entregues antes de 2026-08-08 usaram o spread
 * cheio e não são recalculados (decisão registrada), então precisam continuar
 * apontando para a premissa vigente na época.
 */
export const energyPremisesSchema = z
  .object({
    /** Identificador da versão; um estudo guarda qual usou. */
    versao: z.string().min(1),
    vigenteDe: z.string().datetime(),

    bessModelo: z.string().min(1),
    bessCapacidadeNominalKwh: z.number().positive(),
    /** Capacidade útil; igual à nominal enquanto o DoD não for validado. */
    bessCapacidadeUtilKwh: z.number().positive(),
    bessPotenciaKw: z.number().positive(),
    bessEficienciaCiclo: z.number().gt(0).lte(1),
    bessCapexPorUnidade: z.number().nonnegative(),
    bessDod: z.number().gt(0).lte(1),
    bessEtaRt: z.number().gt(0).lte(1),
    bessEtaEle: z.number().gt(0).lte(1),
    bessEtaOp: z.number().gt(0).lte(1),
    diasUteisMes: z.number().int().positive(),
    omBessPercentualAno: z.number().gte(0),

    fvCapexPorKwp: z.number().nonnegative(),
    /** Mantidos apenas para reproduzir estudos legados anteriores ao PRD v1. */
    fvProdutividadeKwhPorKwpMes: z.number().positive(),
    fvPercentualAtendimento: z.number().gt(0).lte(1),
    solarPr: z.number().gt(0).lte(1),
    solarDegradacaoAnual: z.number().gte(0).lt(1),
    omSolarPercentualAno: z.number().gte(0),
    hspMensal: z.array(z.number().positive()).length(12),
    sohAnual: z.array(z.number().gt(0).lte(1)).length(21),

    horizonteAnos: z.number().int().positive(),
    tmaAnual: z.number().gte(0),
    reajusteTarifarioAnual: z.number().gte(0),
    reajusteOmAnual: z.number().gte(0),

    /** Tolerância regulatória de ultrapassagem do Grupo A. */
    toleranciaUltrapassagem: z.number().gt(0),
    /** Faixa em que a alteração de demanda é solicitação simples. */
    alteracaoDemandaMinima: z.number().gt(0),
    alteracaoDemandaMaxima: z.number().gt(0),
  })
  .strict();
export type EnergyPremises = z.infer<typeof energyPremisesSchema>;

/**
 * Premissas fechadas no PRD recebido em 09/08/2026. Elas reproduzem o motor
 * validado contra as planilhas de Dilkson e substituem as aproximações antigas
 * de 30 dias, reajuste de 4% e TMA de 5%.
 */
export const PREMISSAS_2026_08: EnergyPremises = {
  versao: "2026-08-09-prd-v1",
  vigenteDe: "2026-08-09T00:00:00.000Z",

  bessModelo: "Huawei LUNA2000-241-2S1",
  bessCapacidadeNominalKwh: 241,
  bessCapacidadeUtilKwh: 241,
  bessPotenciaKw: 108,
  bessEficienciaCiclo: 0.913,
  bessCapexPorUnidade: 550_000,
  bessDod: 1,
  bessEtaRt: 0.9556,
  bessEtaEle: 0.98,
  bessEtaOp: 0.99,
  diasUteisMes: 21,
  omBessPercentualAno: 0.01,

  fvCapexPorKwp: 2_500,
  fvProdutividadeKwhPorKwpMes: 130,
  fvPercentualAtendimento: 0.6,
  solarPr: 0.85,
  solarDegradacaoAnual: 0.005,
  omSolarPercentualAno: 0.01,
  hspMensal: Array.from({ length: 12 }, () => 5),
  sohAnual: [
    1, 0.971, 0.948, 0.927, 0.907, 0.888, 0.87, 0.852, 0.834, 0.817,
    0.799, 0.783, 0.763, 0.75, 0.734, 0.718, 0.703, 0.688, 0.673, 0.659,
    0.645,
  ],

  horizonteAnos: 20,
  tmaAnual: 0.12,
  reajusteTarifarioAnual: 0.08,
  reajusteOmAnual: 0.03,

  toleranciaUltrapassagem: 0.05,
  alteracaoDemandaMinima: 0.05,
  alteracaoDemandaMaxima: 0.2,
};

// --- Fatura ----------------------------------------------------------------

export const invoiceDataSchema = z
  .object({
    consumoPontaKwh: z.number().nonnegative(),
    consumoForaPontaKwh: z.number().nonnegative(),
    tarifaPonta: z.number().nonnegative(),
    tarifaForaPonta: z.number().nonnegative(),
    valorPonta: z.number().nonnegative(),
    valorForaPonta: z.number().nonnegative(),
    valorDemanda: z.number().nonnegative(),
    valorTotal: z.number().positive(),

    demandaContratadaKw: z.number().positive(),
    demandaMedidaPontaKw: z.number().nonnegative(),
    demandaMedidaForaPontaKw: z.number().nonnegative(),
    /** Tarifa de demanda (R$/kW), para valorizar ociosidade. */
    tarifaDemanda: z.number().nonnegative().optional(),

    valorReativo: z.number().nonnegative().default(0),
    valorBeneficioFiscal: z.number().nonnegative().default(0),
    valorMultasJurosEncargos: z.number().nonnegative().default(0),
  })
  .strict();
export type InvoiceData = z.infer<typeof invoiceDataSchema>;

export const invoiceRegimeSchema = z.enum(["cativo", "mercado_livre"]);
export const invoiceModalitySchema = z.enum(["verde", "azul"]);

export const reconciledInvoiceItemCategorySchema = z.enum([
  "consumo_ponta",
  "consumo_fora_ponta",
  "demanda_faturada",
  "demanda_contratada",
  "demanda_medida_ponta",
  "demanda_medida_fora_ponta",
  "reativo",
  "beneficio_fiscal",
  "multas_juros_encargos",
  "outros",
]);
export type ReconciledInvoiceItemCategory = z.infer<
  typeof reconciledInvoiceItemCategorySchema
>;

export const reconciledInvoiceItemSchema = z
  .object({
    nome: z.string().trim().min(1),
    categoria: reconciledInvoiceItemCategorySchema,
    /** Metadados de demanda provam campos técnicos, mas não somam no total. */
    compoeTotal: z.boolean(),
    valor: z.number(),
    quantidade: z.number().nonnegative().nullable(),
    unidade: z.enum(["kWh", "kW"]).nullable(),
    tarifa: z.number().nonnegative().nullable(),
  })
  .strict();
export type ReconciledInvoiceItem = z.infer<typeof reconciledInvoiceItemSchema>;

export const invoiceContextSchema = z
  .object({
    distribuidora: z.string().trim().min(1),
    regime: invoiceRegimeSchema,
    modalidade: invoiceModalitySchema,
    grupo: z.literal("A"),
    vencimento: z.string().trim().nullable().default(null),
    itens: z.array(reconciledInvoiceItemSchema).min(1),
    arquivoNome: z.string().trim().nullable().default(null),
    arquivoChave: z.string().trim().nullable().default(null),
    origem: z.enum(["texto_direto", "reconhecimento_optico", "manual"]),
  })
  .strict();
export type InvoiceContext = z.infer<typeof invoiceContextSchema>;

export const reconciliationProofSchema = z
  .object({
    somaItens: z.number(),
    total: z.number(),
    diferenca: z.number(),
    itensConferidos: z.number().int().nonnegative(),
    itensSemConferencia: z.number().int().nonnegative(),
  })
  .strict();
export type ReconciliationProof = z.infer<typeof reconciliationProofSchema>;

export const energyTrafficLightSchema = z.enum(["verde", "amarelo", "vermelho"]);
export type EnergyTrafficLight = z.infer<typeof energyTrafficLightSchema>;

export const trafficLightResultSchema = z
  .object({
    faixa: energyTrafficLightSchema,
    chaveTipo: z.string(),
    tipoConhecido: z.boolean(),
    motivos: z.array(z.string()),
    quatroNumeros: z.object({
      totalFatura: z.number(),
      consumoPontaKwh: z.number(),
      tirAnual: z.number().nullable(),
      paybackAnos: z.number().nullable(),
    }),
  })
  .strict();
export type TrafficLightResult = z.infer<typeof trafficLightResultSchema>;

// --- Resultados: auditoria -------------------------------------------------

/** Faixas do diagnóstico de reativo sobre o total da fatura. */
export const reactiveDiagnosisSchema = z.enum(["registrar", "atencao", "investigar"]);
export type ReactiveDiagnosis = z.infer<typeof reactiveDiagnosisSchema>;

export const auditResultSchema = z
  .object({
    consumoTotalKwh: z.number(),
    custoKwhPonta: z.number(),
    custoKwhForaPonta: z.number(),
    custoMedioTotal: z.number(),
    custoMedioEfetivo: z.number(),
    spread: z.number(),
    reativoPercentual: z.number(),
    reativoDiagnostico: reactiveDiagnosisSchema,
    beneficioFiscalPercentual: z.number(),
  })
  .strict();
export type AuditResult = z.infer<typeof auditResultSchema>;

// --- Resultados: demanda ---------------------------------------------------

export const demandScenarioKeySchema = z.enum(["conservador", "intermediario", "arrojado"]);
export type DemandScenarioKey = z.infer<typeof demandScenarioKeySchema>;

/**
 * Fora da faixa de 5%–20% a alteração deixa de ser solicitação simples e vira
 * orçamento de conexão (REN ANEEL 1.000/2021, arts. 154, 155 e 311–314).
 */
export const demandChangeClassificationSchema = z.enum([
  "reducao_simples",
  "ampliacao_simples",
  "abaixo_do_gatilho",
  "orcamento_de_conexao",
]);
export type DemandChangeClassification = z.infer<typeof demandChangeClassificationSchema>;

export const demandScenarioSchema = z
  .object({
    chave: demandScenarioKeySchema,
    demandaPropostaKw: z.number(),
    limiteSemMultaKw: z.number(),
    mesesAcimaDoContrato: z.number().int().nonnegative(),
    mesesComMulta: z.number().int().nonnegative(),
    economiaMensal: z.number(),
    economiaAnual: z.number(),
    variacao: z.number(),
    classificacao: demandChangeClassificationSchema,
  })
  .strict();
export type DemandScenario = z.infer<typeof demandScenarioSchema>;

export const demandResultSchema = z
  .object({
    utilizacao: z.number(),
    toleranciaKw: z.number(),
    houveUltrapassagem: z.boolean(),
    picoObservadoKw: z.number(),
    mesesDeHistorico: z.number().int().nonnegative(),
    /** Só deixa de ser preliminar com 12 meses ou memória de massa. */
    preliminar: z.boolean(),
    cenarios: z.array(demandScenarioSchema),
    recomendado: demandScenarioKeySchema.nullable(),
    /** Ociosidade é dinheiro na mesa, nunca multa. */
    ociosidadeMensal: z.number(),
  })
  .strict();
export type DemandResult = z.infer<typeof demandResultSchema>;

// --- Resultados: dimensionamento -------------------------------------------

export const sizingResultSchema = z
  .object({
    consumoPontaDiarioKwh: z.number(),
    bessUnidadesPorEnergia: z.number().int().nonnegative(),
    bessUnidadesPorPotencia: z.number().int().nonnegative(),
    bessUnidades: z.number().int().nonnegative(),
    bessLimitador: z.enum(["energia", "potencia"]),
    energiaUtilCicloKwh: z.number(),
    energiaUtilMesPorBessKwh: z.number(),
    energiaCargaMesPorBessKwh: z.number(),
    coberturaConsumo: z.number(),
    fvKwp: z.number().nonnegative(),
    fvGeracaoMensalKwh: z.number(),
  })
  .strict();
export type SizingResult = z.infer<typeof sizingResultSchema>;

// --- Resultados: cenários --------------------------------------------------

export const savingsResultSchema = z
  .object({
    economiaBessMensal: z.number(),
    economiaFvMensal: z.number(),
    economiaMensal: z.number(),
    economiaAno1: z.number(),
    faturaProjetada: z.number(),
  })
  .strict();
export type SavingsResult = z.infer<typeof savingsResultSchema>;

// --- Resultados: financeiro ------------------------------------------------

export const financialResultSchema = z
  .object({
    capexBess: z.number(),
    capexFv: z.number(),
    capexTotal: z.number(),
    /** Economia de cada ano, já reajustada. */
    fluxoAnual: z.array(z.number()),
    economiaAcumulada: z.array(z.number()),
    /** Índice 0 = −CAPEX; daí em diante, acumulado. */
    fluxoCaixaAcumulado: z.array(z.number()),
    /** CAPEX ÷ economia do ano 1. Ignora reajuste e valor do dinheiro no tempo. */
    paybackSimplesAnos: z.number(),
    /**
     * Ano em que o acumulado **reajustado** cobre o CAPEX. É este o número que
     * os estudos entregues rotulavam apenas como "Payback" — no Serra Verde,
     * 6,9 anos, enquanto o simples dava 7,75. Nomes distintos por decisão.
     */
    paybackProjetadoAnos: z.number().nullable(),
    /** Ano em que o acumulado **descontado pela TMA** cobre o CAPEX. */
    paybackDescontadoAnos: z.number().nullable(),
    vpl: z.number(),
    tir: z.number().nullable(),
    acumulado20Anos: z.number(),
    economiaLiquida20Anos: z.number(),
    fluxoMensal: z.array(
      z.object({
        ano: z.number().int().positive(),
        mes: z.number().int().min(1).max(12),
        soh: z.number(),
        receitaPonta: z.number(),
        custoCarga: z.number(),
        geracaoSolar: z.number(),
        solarParaBess: z.number(),
        excedenteSemCredito: z.number(),
        economiaLiquida: z.number(),
        acumulado: z.number(),
      }),
    ),
  })
  .strict();
export type FinancialResult = z.infer<typeof financialResultSchema>;

/**
 * Problema apontado pela validação bloqueante do documento. Fica no contrato
 * porque a tela precisa mostrar ao operador o que impede a aprovação.
 */
export const problemaDeValidacaoSchema = z
  .object({ regra: z.string(), detalhe: z.string() })
  .strict();
export type ProblemaDeValidacao = z.infer<typeof problemaDeValidacaoSchema>;

// --- Contratos HTTP --------------------------------------------------------

export const createEnergyStudyRequestSchema = z
  .object({
    clientId: z.string().uuid(),
    consumerUnitId: z.string().uuid(),
    competenceMonth: z.number().int().min(1).max(12),
    competenceYear: z.number().int().min(2020).max(2100),
    calculationMode: calculationModeSchema.default("preliminar"),
  })
  .strict();
export type CreateEnergyStudyRequest = z.infer<typeof createEnergyStudyRequestSchema>;

/** Ficha da fatura + histórico de demanda; move o estudo para dados_recebidos. */
export const submitEnergyInvoiceRequestSchema = z
  .object({
    invoice: invoiceDataSchema,
    context: invoiceContextSchema,
    demandHistory: z.array(z.number().nonnegative()).max(36).default([]),
    hasLoadProfile: z.boolean().default(false),
  })
  .strict();
export type SubmitEnergyInvoiceRequest = z.infer<typeof submitEnergyInvoiceRequestSchema>;

export const approveEnergyStudyRequestSchema = z
  .object({ note: z.string().trim().max(500).optional() })
  .strict();
export type ApproveEnergyStudyRequest = z.infer<typeof approveEnergyStudyRequestSchema>;

export const energyStudySummarySchema = z
  .object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    clientName: z.string(),
    consumerUnitId: z.string().uuid(),
    consumerUnitCode: z.string(),
    competenceMonth: z.number().int(),
    competenceYear: z.number().int(),
    status: energyStudyStatusSchema,
    calculationMode: calculationModeSchema,
    trafficLight: energyTrafficLightSchema.nullable(),
    economiaMensal: z.number().nullable(),
    capexTotal: z.number().nullable(),
    version: z.number().int(),
    revision: z.number().int(),
    approvedAt: z.string().datetime().nullable(),
    sentAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type EnergyStudySummary = z.infer<typeof energyStudySummarySchema>;

export const energyStudyDetailSchema = energyStudySummarySchema
  .extend({
    premiseVersion: z.string(),
    invoice: invoiceDataSchema.nullable(),
    invoiceContext: invoiceContextSchema.nullable(),
    reconciliationProof: reconciliationProofSchema.nullable(),
    demandHistory: z.array(z.number()),
    audit: auditResultSchema.nullable(),
    demand: demandResultSchema.nullable(),
    sizing: sizingResultSchema.nullable(),
    savings: savingsResultSchema.nullable(),
    financial: financialResultSchema.nullable(),
    trafficLightResult: trafficLightResultSchema.nullable(),
    validationIssues: z.array(problemaDeValidacaoSchema).nullable(),
    hasDocument: z.boolean(),
    hasMobileDocument: z.boolean(),
  })
  .strict();
export type EnergyStudyDetail = z.infer<typeof energyStudyDetailSchema>;

export const listEnergyStudiesResponseSchema = z
  .object({ items: z.array(energyStudySummarySchema) })
  .strict();
export type ListEnergyStudiesResponse = z.infer<typeof listEnergyStudiesResponseSchema>;

export const energyStudyListQuerySchema = z
  .object({ status: energyStudyStatusSchema.optional() })
  .strict();
export type EnergyStudyListQuery = z.infer<typeof energyStudyListQuerySchema>;

// --- Leitura da fatura enviada ---------------------------------------------

/**
 * O estudo começa pela conta de luz, não pela unidade consumidora: é o
 * documento que a pessoa tem na mão. A leitura devolve o que conseguiu extrair
 * e, com igual importância, o que **não** conseguiu — três quartos das faturas
 * reais são digitalização e não têm camada de texto.
 */
/**
 * De onde o texto da fatura veio.
 *
 * `fonte_codificada` saiu: era um detalhe do extrator artesanal — se a fonte do
 * PDF usava mapa de glifos próprio — que nunca disse nada a quem opera. Quem lê
 * o PDF hoje resolve isso sozinho. O que importa para a tela é se o texto foi
 * lido do arquivo ou reconhecido de uma imagem, porque só o segundo caso pede
 * conferência redobrada.
 */
export const invoiceReadingOriginSchema = z.enum([
  "texto_direto",
  "reconhecimento_optico",
]);
export type InvoiceReadingOrigin = z.infer<typeof invoiceReadingOriginSchema>;

/**
 * Por que a ficha não saiu pronta.
 *
 * Cada motivo aqui tem uma ação diferente do outro lado da tela, e é por isso
 * que são motivos separados. A versão anterior colapsava quase tudo em
 * `digitalizacao` — "a fatura é uma imagem digitalizada, sem texto para ler" —
 * e mandava digitar à mão. Dois dos PDFs de teste caíam ali por estarem
 * **protegidos por senha**: a pessoa recebia um pedido de trabalho manual
 * quando bastava informar a senha. Um motivo que não distingue causas não
 * informa nada; só encerra a conversa.
 */
export const invoiceReadingRefusalSchema = z.enum([
  /** PDF cifrado: dá para ler, falta a senha. */
  "protegido_por_senha",
  /** A senha informada não abre o arquivo. */
  "senha_incorreta",
  /** Nem o PDF nem o OCR produziram texto: imagem ilegível ou página em branco. */
  "sem_texto",
  /** Há texto, mas nenhum item financeiro reconhecido: layout novo. */
  "layout_desconhecido",
  "grupo_b",
  "campos_essenciais_ausentes",
]);
export type InvoiceReadingRefusal = z.infer<typeof invoiceReadingRefusalSchema>;

/** Veredicto da conferência `quantidade × tarifa = valor` de cada item. */
export const invoiceItemVerdictSchema = z.enum([
  "confirmado",
  "divergente",
  "sem_conferencia",
]);
export type InvoiceItemVerdict = z.infer<typeof invoiceItemVerdictSchema>;

export const invoiceReadingItemSchema = z
  .object({
    rotulo: z.string(),
    quantidade: z.number().nullable(),
    unidade: z.enum(["kWh", "kW"]).nullable(),
    tarifa: z.number().nullable(),
    valor: z.number(),
    veredicto: invoiceItemVerdictSchema,
    /** Valor que a multiplicação produz; nulo quando não há o que multiplicar. */
    esperado: z.number().nullable(),
  })
  .strict();
export type InvoiceReadingItem = z.infer<typeof invoiceReadingItemSchema>;

export const invoiceReadingSchema = z
  .object({
    origem: invoiceReadingOriginSchema,
    /** Falso quando não deu para montar a ficha; `motivo` diz por quê. */
    aproveitavel: z.boolean(),
    motivo: invoiceReadingRefusalSchema.nullable(),
    unidadeConsumidoraCodigo: z.string().nullable(),
    competenceMonth: z.number().int().min(1).max(12).nullable(),
    competenceYear: z.number().int().min(2000).max(2100).nullable(),
    distribuidora: z.string().nullable(),
    /** Só o que a aritmética confirmou; o resto fica para a pessoa preencher. */
    invoice: invoiceDataSchema.partial(),
    itens: z.array(invoiceReadingItemSchema),
    camposParaConfirmar: z.array(z.string()),
    arquivoNome: z.string(),
    /**
     * Confiança média do reconhecimento óptico, de 0 a 100; nula quando o texto
     * veio da camada do PDF. A tela usa para avisar que os números saíram de
     * uma imagem e merecem um olhar a mais.
     */
    confiancaOcr: z.number().min(0).max(100).nullable(),
    /** Onde o arquivo original ficou guardado; nulo se o armazenamento falhou. */
    arquivoChave: z.string().nullable(),
  })
  .strict();
export type InvoiceReading = z.infer<typeof invoiceReadingSchema>;
