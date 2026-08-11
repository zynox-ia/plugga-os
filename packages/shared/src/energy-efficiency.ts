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

    /**
     * Campos que o relatório oficial exige e a leitura do PDF não deduz. Ficam
     * aqui, junto do resto do que a pessoa confere na tela, porque é ela quem
     * sabe o apelido da unidade e enxerga as datas de leitura na conta.
     */
    apelido: z.string().trim().min(1).nullish(),
    classe: z.string().trim().min(1).nullish(),
    /** Cidade/UF da unidade, como sai impresso no relatório. */
    localidade: z.string().trim().min(1).nullish(),
    /**
     * Valor da linha de demanda sem ICMS, quando a fatura a publica. É ele que
     * vira a economia de readequação contratual no relatório; sem ele, o cálculo
     * cai no rateio — e o rateio nunca sobrescreve o que a fatura publicou.
     */
    demandaComplementoValor: z.number().nullish(),
    leituraAnterior: z.string().trim().min(1).nullish(),
    leituraAtual: z.string().trim().min(1).nullish(),
    /**
     * Irradiação média por mês da unidade consumidora. É premissa da UC, nunca
     * um padrão geográfico silencioso: sem ela o estudo não roda.
     */
    hspMensal: z.array(z.number().positive()).length(12).nullish(),

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

// --- Resultado do estudo ---------------------------------------------------

/**
 * O que o estudo devolve, no formato do núcleo normativo.
 *
 * Substitui os cinco blocos da versão anterior — auditoria, demanda,
 * dimensionamento, economia e financeiro. Aqueles nasceram de análises que a
 * norma não faz; o que a norma produz é isto: dois cenários, os indicadores de
 * cada um e o fluxo de 20 anos.
 */
export const cenarioDoEstudoSchema = z
  .object({
    capexTotal: z.number(),
    economiaAno1: z.number(),
    tirAa: z.number().nullable(),
    paybackAnos: z.number().nullable(),
    acumulado20Anos: z.number(),
  })
  .strict();
export type CenarioDoEstudo = z.infer<typeof cenarioDoEstudoSchema>;

export const estudoResultSchema = z
  .object({
    modo: z.enum(["solar_bess", "peak_shaving"]),
    unidadesBess: z.number().int().positive(),
    solarKwp: z.number().nonnegative(),
    /** De onde veio o kWp: valor aprovado no caso ou sugerido pelo pior mês. */
    regraDoKwp: z.enum(["aprovado", "pior_mes"]),

    capexBess: z.number(),
    capexSolar: z.number(),
    capexTotal: z.number(),

    economiaMensal: z.number(),
    economiaAno1: z.number(),
    faturaProjetada: z.number(),

    tirAa: z.number().nullable(),
    paybackAnos: z.number().nullable(),
    acumulado20Anos: z.number(),
    /** Interno: alimenta a validação contra as planilhas, não vai ao cliente. */
    vplTma: z.number(),

    /** Ano 0 é o CAPEX negativo; daí em diante, a economia de cada ano. */
    fluxoAnual: z.array(z.number()),
    fluxoAcumulado: z.array(z.number()),

    /** O cenário sem solar, que é o que o semáforo julga. */
    bessPuro: cenarioDoEstudoSchema,
  })
  .strict();
export type EstudoResult = z.infer<typeof estudoResultSchema>;

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
    estudo: estudoResultSchema.nullable(),
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

/**
 * Por que a leitura por modelo de visão não entrou nesta ficha.
 *
 * Existe para separar uma recusa nossa de uma falha do leitor. `sem_provedor_sem_retencao`
 * quer dizer que a fatura **não foi enviada** para lugar nenhum: ela só vai para
 * provedor que se compromete a não guardar o conteúdo, e não havia nenhum
 * disponível. Colapsado com os outros motivos, isso chegaria à tela como "o
 * modelo não achou nada" — e quem confere concluiria que o leitor é fraco em vez
 * de saber que a exigência de retenção ficou sem quem a atendesse.
 *
 * Nulo é o caso comum: as regras fecharam a ficha e o modelo nem foi chamado, ou
 * ele foi chamado e respondeu.
 */
export const invoiceVisionSkipSchema = z.enum([
  /** A fatura não saiu daqui: nenhum provedor sem retenção estava disponível. */
  "sem_provedor_sem_retencao",
  /** Chamamos e não veio resposta: sem chave, rede fora, tempo esgotado. */
  "modelo_indisponivel",
  /** Veio resposta, mas não deu para ler o que voltou. */
  "resposta_ilegivel",
]);
export type InvoiceVisionSkip = z.infer<typeof invoiceVisionSkipSchema>;

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
    /**
     * Em que campo da ficha a linha cai, decidido pelo leitor.
     *
     * Viaja junto com o item pelo mesmo motivo que `compoeTotal`: era um
     * julgamento que a tela refazia por conta própria, com um vocabulário
     * paralelo, e os dois divergiram numa fatura da Roraima em 11/08/2026 —
     * `Consumo F/Ponta` virava consumo em ponta e a conciliação nunca ficava
     * pronta. Quem confere continua podendo trocar no editor: o leitor sugere,
     * não decide sozinho.
     */
    categoria: reconciledInvoiceItemCategorySchema,
    /**
     * Se o item entra na soma que tem de fechar com o total da fatura.
     *
     * Nasce verdadeiro. Vira falso quando a própria aritmética prova o
     * contrário — ver `motivoForaDoTotal`. A pessoa continua podendo mudar na
     * tela: a leitura sugere, não decide sozinha.
     */
    compoeTotal: z.boolean(),
    /** Por que o item nasceu fora do total; nulo quando ele compõe. */
    motivoForaDoTotal: z.string().nullable(),
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
    /**
     * Por que a leitura por modelo não entrou; nulo quando ela não fez falta ou
     * quando o modelo respondeu. A tela mostra este aviso porque a diferença
     * entre "não enviamos a fatura" e "o leitor não deu conta" muda o que quem
     * confere faz a seguir.
     */
    visaoPulada: invoiceVisionSkipSchema.nullable(),
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
