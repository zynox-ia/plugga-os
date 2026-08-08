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
 * O modo muda o que o estudo pode afirmar. `preliminar` usa base de 30 dias
 * corridos e ignora perdas finas, O&M e degradação — e o documento é obrigado a
 * dizer isso. `memoria_massa` usa energia deslocável real da curva de 15 min.
 */
export const calculationModeSchema = z.enum(["preliminar", "memoria_massa"]);
export type CalculationMode = z.infer<typeof calculationModeSchema>;

/** Base de dias usada para converter consumo mensal de ponta em consumo diário. */
export const daysBasisSchema = z.enum(["dias_corridos", "dias_ponta", "memoria_massa"]);
export type DaysBasis = z.infer<typeof daysBasisSchema>;

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

    fvCapexPorKwp: z.number().nonnegative(),
    fvProdutividadeKwhPorKwpMes: z.number().positive(),
    fvPercentualAtendimento: z.number().gt(0).lte(1),

    horizonteAnos: z.number().int().positive(),
    tmaAnual: z.number().gte(0),
    reajusteTarifarioAnual: z.number().gte(0),

    /** Tolerância regulatória de ultrapassagem do Grupo A. */
    toleranciaUltrapassagem: z.number().gt(0),
    /** Faixa em que a alteração de demanda é solicitação simples. */
    alteracaoDemandaMinima: z.number().gt(0),
    alteracaoDemandaMaxima: z.number().gt(0),
  })
  .strict();
export type EnergyPremises = z.infer<typeof energyPremisesSchema>;

/**
 * Premissas vigentes desde 2026-08-08. A eficiência de ciclo passa a entrar no
 * cálculo da economia (antes era documentada e ignorada) e a capacidade útil
 * nasce igual à nominal, marcada para validação em projeto.
 */
export const PREMISSAS_2026_08: EnergyPremises = {
  versao: "2026-08-08",
  vigenteDe: "2026-08-08T00:00:00.000Z",

  bessModelo: "Huawei LUNA2000-241-2S1",
  bessCapacidadeNominalKwh: 241,
  bessCapacidadeUtilKwh: 241,
  bessPotenciaKw: 108,
  bessEficienciaCiclo: 0.913,
  bessCapexPorUnidade: 550_000,

  fvCapexPorKwp: 2_500,
  fvProdutividadeKwhPorKwpMes: 130,
  fvPercentualAtendimento: 0.6,

  horizonteAnos: 20,
  tmaAnual: 0.05,
  reajusteTarifarioAnual: 0.04,

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
    fvKwp: z.number().int().nonnegative(),
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
    demandHistory: z.array(z.number()),
    audit: auditResultSchema.nullable(),
    demand: demandResultSchema.nullable(),
    sizing: sizingResultSchema.nullable(),
    savings: savingsResultSchema.nullable(),
    financial: financialResultSchema.nullable(),
    validationIssues: z.array(problemaDeValidacaoSchema).nullable(),
    hasDocument: z.boolean(),
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
