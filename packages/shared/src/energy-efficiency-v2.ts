import { z } from "zod";

/**
 * Auditoria de eficiência energética — contratos V2.
 *
 * Lado a lado com `energy-efficiency.ts`, que continua sendo a V1 e não é
 * tocado. A V2 é o port fiel do pacote normativo
 * `plugga-auditoria-energetica-COMPLETO-2026-08-09`, com o Python servindo de
 * oráculo em desenvolvimento e CI — nunca em produção.
 *
 * Duas coisas guiam o desenho:
 *
 * - todo resultado carrega de onde veio: versão normativa, versão do motor,
 *   hash do documento original e hash do bundle de entrada. Sem isso um estudo
 *   antigo fica inexplicável quando a premissa muda;
 * - números aprovados são entrada, não sugestão. Quando o caso traz `nBess` ou
 *   `solarKwpDefinido`, eles prevalecem, e o motor registra qual regra decidiu.
 */

// --- Versões e identidade --------------------------------------------------

/** Data do pacote normativo que rege a execução, ex.: `2026-08-09`. */
export const versaoNormativaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Identifica o motor e a sua revisão, ex.: `solar-bess-v1`. */
export const versaoDoMotorSchema = z.string().min(1);

export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * Modos disponíveis nesta entrega. O REV04 (BESS puro) ficou de fora: o pacote
 * não traz motor, caso nem golden dele, e o PRD da dupla consulta diz que BESS
 * isolado não é produto principal.
 *
 * Não existe padrão: modo ausente ou incompatível falha fechado, nunca cai no
 * Solar+BESS.
 */
export const modoDoEstudoSchema = z.enum(["solar_bess", "peak_shaving"]);
export type ModoDoEstudo = z.infer<typeof modoDoEstudoSchema>;

// --- Documento original ----------------------------------------------------

/**
 * A fatura original preservada. Sem ela — ou sem o hash — o estudo pode ser
 * conferido como rascunho, mas não aprovado nem entregue.
 */
export const documentoFonteSchema = z
  .object({
    nomeArquivo: z.string().min(1),
    mimeType: z.string().min(1),
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
    /** Chave no storage; ausente significa que o original não foi preservado. */
    armazenadoEm: z.string().min(1).optional(),
  })
  .strict();
export type DocumentoFonte = z.infer<typeof documentoFonteSchema>;

// --- Fatura normativa -------------------------------------------------------

/**
 * A fatura no formato do pacote normativo. Os nomes mudam de `snake_case` para
 * `camelCase`, e nada mais: a forma é a que a Trava 1 do oráculo confere.
 *
 * O que **não** existe aqui é tão importante quanto o que existe. A norma não
 * categoriza linha por linha nem deriva consumo a partir dos itens: os campos
 * que alimentam o motor vêm explicitamente da extração, e a trava prova a
 * coerência entre eles e os itens. Inventar uma camada de categorias seria
 * afastar o port da especificação que ele deve reproduzir.
 */
export const itemDaFaturaSchema = z
  .object({
    nome: z.string().min(1),
    valor: z.number(),
    /** Quantidade em kWh, quando o item for de energia. */
    kwh: z.number().optional(),
    /** Quantidade em kW, quando o item for de demanda. */
    kw: z.number().optional(),
    tarifa: z.number().optional(),
    /** Texto livre da fatura; a trava de ultrapassagem também o inspeciona. */
    detalhe: z.string().optional(),
  })
  .strict();
export type ItemDaFatura = z.infer<typeof itemDaFaturaSchema>;

/** Linha informativa que aparece na fatura mas não compõe o total. */
export const itemNaoCobradoSchema = z
  .object({
    nome: z.string().min(1),
    valor: z.number(),
    motivo: z.string().min(1).optional(),
  })
  .strict();

export const regimeSchema = z.enum(["cativo", "mercado_livre"]);
export const modalidadeSchema = z.enum(["verde", "azul"]);
export const grupoSchema = z.string().min(1);

/**
 * Chave do tipo de fatura para o semáforo: distribuidora, regime, modalidade e
 * grupo. Tipo conhecido é verde; combinação nova é amarela.
 */
export const tipoDaFaturaSchema = z
  .object({
    distribuidora: z.string().min(1),
    regime: regimeSchema,
    modalidade: modalidadeSchema,
    grupo: grupoSchema,
  })
  .strict();
export type TipoDaFatura = z.infer<typeof tipoDaFaturaSchema>;

/**
 * Nota fiscal de energia do mercado livre. O preço não é digitado: a trava
 * confere que `total / mwh / 1000` bate com `precoKwh`, e que a tarifa de ponta
 * publicada é a soma do fio com a energia da NF.
 */
export const energiaNfSchema = z
  .object({
    fornecedor: z.string().min(1),
    total: z.number().nonnegative(),
    mwh: z.number().positive(),
    precoKwh: z.number().nonnegative(),
    /** Nota da extração — em Brasília e Imigrantes registra a NF secundária, informativa e fora da formação de preço. */
    obs: z.string().optional(),
  })
  .strict();
export type EnergiaNf = z.infer<typeof energiaNfSchema>;

export const faturaNormativaSchema = z
  .object({
    cliente: z.string().min(1),
    cnpj: z.string().optional(),
    uc: z.string().min(1),
    apelido: z.string().min(1).optional(),
    distribuidora: z.string().min(1),
    regime: regimeSchema,
    grupo: grupoSchema,
    modalidade: modalidadeSchema,
    classe: z.string().optional(),
    referencia: z.string().min(1),
    vencimento: z.string().min(1),

    total: z.number(),
    itens: z.array(itemDaFaturaSchema).min(1),
    naoCobrados: z.array(itemNaoCobradoSchema).optional(),

    consumoPontaKwh: z.number().nonnegative(),
    consumoFpKwh: z.number().nonnegative(),
    demandaContratadaKw: z.number().nonnegative(),
    demandaRegistradaPontaKw: z.number().nonnegative().optional(),
    demandaRegistradaFpKw: z.number().nonnegative().optional(),
    reativoPontaKwh: z.number().nonnegative().optional(),
    reativoFpKwh: z.number().nonnegative().optional(),

    tarifaPontaTotal: z.number().nonnegative().optional(),
    tarifaFpTotal: z.number().nonnegative().optional(),
    /** Valor declarado de ultrapassagem, quando não vier como item. */
    ultrapassagemValor: z.number().nonnegative().optional(),

    /** Mercado livre: NF de energia e gasto total com energia (fio + energia). */
    energiaNf: energiaNfSchema.optional(),
    totalGastoEnergia: z.number().nonnegative().optional(),

    /** Presente quando o caso é peak shaving. */
    funcao: modoDoEstudoSchema.optional(),
  })
  .strict();
export type FaturaNormativa = z.infer<typeof faturaNormativaSchema>;

// --- Trava 1: prova de conciliação -----------------------------------------

/**
 * A prova que o oráculo grava na fatura conciliada. Nada de ajuste: se a soma
 * não fecha, a fatura é reprovada e o motor não roda.
 */
export const provaDeConciliacaoSchema = z
  .object({
    somaItens: z.number(),
    total: z.number(),
    diferenca: z.number(),
  })
  .strict();
export type ProvaDeConciliacao = z.infer<typeof provaDeConciliacaoSchema>;

export const problemaDaConciliacaoSchema = z
  .object({
    regra: z.enum([
      "campo_obrigatorio",
      "soma_dos_itens",
      "item_incoerente",
      "ultrapassagem",
      "energia_nf",
    ]),
    detalhe: z.string().min(1),
  })
  .strict();
export type ProblemaDaConciliacao = z.infer<typeof problemaDaConciliacaoSchema>;

export const resultadoDaConciliacaoSchema = z
  .object({
    conciliada: z.boolean(),
    prova: provaDeConciliacaoSchema,
    problemas: z.array(problemaDaConciliacaoSchema),
    /** Linhas informativas confirmadas fora do total. */
    foraDoTotal: z.array(itemNaoCobradoSchema),
  })
  .strict();
export type ResultadoDaConciliacao = z.infer<typeof resultadoDaConciliacaoSchema>;

// --- Premissas -------------------------------------------------------------

/**
 * Premissas do motor, versionadas.
 *
 * Armadilha herdada do oráculo: no Python o campo se chama `potencia_bess_kw` e
 * vale 241, mas 241 é a **energia** da unidade em kWh. A potência é 108 kW
 * (Huawei LUNA2000-241-2S1). Aqui os dois têm nome próprio, para que ninguém
 * repita o erro ao portar.
 */
export const premissasV2Schema = z
  .object({
    versao: versaoNormativaSchema,

    energiaPorBessKwh: z.number().positive(),
    potenciaPorBessKw: z.number().positive(),
    dod: z.number().positive().max(1),
    etaRt: z.number().positive().max(1),
    etaEle: z.number().positive().max(1),
    etaOp: z.number().positive().max(1),
    diasUteisMes: z.number().int().positive(),

    /** O BESS só fatura a energia que desloca — o fator J12 da planilha. */
    limitarUtilizacaoAoConsumo: z.boolean(),
    /** Solar existe só para carregar o BESS; excedente não abate nem credita. */
    solarApenasCarregaBess: z.boolean(),

    tmaAa: z.number().positive(),
    reajusteEnergiaAa: z.number().nonnegative(),
    reajusteOmAa: z.number().nonnegative(),
    omBessPctCapexAno: z.number().nonnegative(),
    omSolarPctCapexAno: z.number().nonnegative(),
    /** CAPEX solar derivado do kWp; R$/kWp do pacote normativo. */
    precoSolarPorKwp: z.number().positive(),

    solarPr: z.number().positive().max(1),
    solarDegradacaoAa: z.number().nonnegative(),
    /** Curva SOH, anos 0 a 20 — 21 pontos, interpolados mês a mês. */
    soh: z.array(z.number().positive().max(1)).length(21),
  })
  .strict();
export type PremissasV2 = z.infer<typeof premissasV2Schema>;

// --- Caso do motor ---------------------------------------------------------

/** HSP pertence à UC, nunca é um padrão geográfico silencioso. */
export const hspMensalSchema = z.array(z.number().positive()).length(12);

export const casoDoMotorSchema = z
  .object({
    funcao: modoDoEstudoSchema,
    consumoPontaDesejadoKwhMes: z.number().positive(),

    tusdP: z.number().nonnegative(),
    teP: z.number().nonnegative(),
    tusdFp: z.number().nonnegative(),
    teFp: z.number().nonnegative(),

    /** Unidades aprovadas no caso. Quando existe, prevalece sobre o cálculo. */
    nBessAprovado: z.number().int().positive().optional(),
    capexBessTotal: z.number().positive(),

    hspMensal: hspMensalSchema,
    /** kWp aprovado. Sem ele, o pipeline usa o sugerido do pior mês. */
    solarKwpDefinido: z.number().positive().optional(),

    /** Peak shaving: demanda de ponta eliminada e contrato remanescente. */
    demandaPontaMedidaKw: z.number().nonnegative().optional(),
    tarifaKwPontaMedida: z.number().nonnegative().optional(),
    demandaPontaNaoConsumidaKw: z.number().nonnegative().optional(),
    tarifaKwPontaNaoConsumida: z.number().nonnegative().optional(),
    contratoPontaNovoKw: z.number().nonnegative().optional(),
  })
  .strict();
export type CasoDoMotor = z.infer<typeof casoDoMotorSchema>;

// --- Bundle canônico -------------------------------------------------------

/**
 * Tudo que o núcleo recebe. O motor é puro: não acessa banco, relógio, storage
 * nem rede. Data, autor e canal pertencem à camada de aplicação.
 */
export const bundleCanonicoSchema = z
  .object({
    versaoNormativa: versaoNormativaSchema,
    versaoDoMotor: versaoDoMotorSchema,
    documentoFonte: documentoFonteSchema,
    fatura: faturaNormativaSchema,
    conciliacao: provaDeConciliacaoSchema,
    caso: casoDoMotorSchema,
    premissas: premissasV2Schema,
  })
  .strict();
export type BundleCanonico = z.infer<typeof bundleCanonicoSchema>;

// --- Resultado do motor ----------------------------------------------------

export const mesDoFluxoSchema = z
  .object({
    ano: z.number().int().positive(),
    mes: z.string().min(1),
    soh: z.number().positive(),
    receitaHp: z.number(),
    custoHfp: z.number(),
    geracaoSolar: z.number(),
    solarParaBess: z.number(),
    solarExcedente: z.number(),
    economiaLiquida: z.number(),
    acumulado: z.number(),
  })
  .strict();

export const indicadoresSchema = z
  .object({
    capexTotal: z.number().positive(),
    economiaAno1: z.number(),
    tirAa: z.number().nullable(),
    /** Interno: alimenta semáforo e validação contra as planilhas. */
    vplTma: z.number(),
    paybackMeses: z.number().nullable(),
    paybackDescontadoMeses: z.number().nullable(),
  })
  .strict();
export type Indicadores = z.infer<typeof indicadoresSchema>;

/** Qual regra determinou o número de unidades. Nunca fica implícito. */
export const limitadorDoDimensionamentoSchema = z.enum([
  "aprovado",
  "energia",
  "potencia",
]);

export const dimensionamentoSchema = z
  .object({
    unidades: z.number().int().positive(),
    limitador: limitadorDoDimensionamentoSchema,
    utilizacaoMensalKwh: z.number().nonnegative(),
    cargaMensalKwh: z.number().nonnegative(),
  })
  .strict();

export const resultadoDoMotorSchema = z
  .object({
    versaoDoMotor: versaoDoMotorSchema,
    dimensionamento: dimensionamentoSchema,
    solarKwp: z.number().nonnegative(),
    capexSolarTotal: z.number().nonnegative(),
    indicadores: indicadoresSchema,
    /** 20 anos, mês a mês. */
    fluxoMensal: z.array(mesDoFluxoSchema).length(240),
    /** Ano 0 é o CAPEX negativo. */
    fluxoAnual: z.array(z.number()).length(21),
  })
  .strict();
export type ResultadoDoMotor = z.infer<typeof resultadoDoMotorSchema>;

/**
 * O estudo tem **dois fluxos**, e eles não são intercambiáveis: o semáforo
 * avalia o fluxo BESS puro, enquanto a Trava 2 confere o documento contra o
 * fluxo Solar, que é o apresentado ao cliente. Trocar os dois muda as faixas
 * sanitárias em silêncio.
 */
export const resultadoDoEstudoSchema = z
  .object({
    modo: modoDoEstudoSchema,
    fluxoBess: resultadoDoMotorSchema,
    fluxoSolar: resultadoDoMotorSchema,
    /** De onde veio o kWp: valor aprovado no caso ou sugerido pelo pior mês. */
    regraDoKwp: z.enum(["aprovado", "pior_mes"]),
    kwpSugeridoPiorMes: z.number().nonnegative(),
  })
  .strict();
export type ResultadoDoEstudo = z.infer<typeof resultadoDoEstudoSchema>;

// --- Semáforo --------------------------------------------------------------

export const faixaDoSemaforoSchema = z.enum(["verde", "amarelo", "vermelho"]);
export type FaixaDoSemaforo = z.infer<typeof faixaDoSemaforoSchema>;

/** Os quatro números congelados na aprovação de um tipo novo. */
export const quatroNumerosSchema = z
  .object({
    totalDaFatura: z.number(),
    consumoPontaKwh: z.number().nonnegative(),
    tirAa: z.number().nullable(),
    paybackAnos: z.number().nullable(),
  })
  .strict();
export type QuatroNumeros = z.infer<typeof quatroNumerosSchema>;

export const semaforoSchema = z
  .object({
    faixa: faixaDoSemaforoSchema,
    /** Erro literal quando vermelho — é ele que a pessoa recebe ao escalar. */
    motivos: z.array(z.string()),
    tipo: tipoDaFaturaSchema,
    tipoConhecido: z.boolean(),
    quatroNumeros: quatroNumerosSchema,
  })
  .strict();
export type Semaforo = z.infer<typeof semaforoSchema>;

// --- Documento -------------------------------------------------------------

/**
 * Substituições literais sobre o modelo congelado. As chaves são o texto exato
 * do modelo; nada de corpo regenerado programaticamente.
 */
export const substituicoesSchema = z.record(z.string().min(1), z.string());
export type Substituicoes = z.infer<typeof substituicoesSchema>;

export const tipoDoArtifactSchema = z.enum(["desktop", "celular", "pdf"]);

export const artifactSchema = z
  .object({
    tipo: tipoDoArtifactSchema,
    nomeArquivo: z.string().min(1),
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict();
export type Artifact = z.infer<typeof artifactSchema>;

// --- Execução --------------------------------------------------------------

/**
 * O que fica registrado de cada execução. Recalcular cria uma execução nova;
 * execução aprovada ou entregue nunca é sobrescrita.
 */
export const execucaoV2Schema = z
  .object({
    versaoNormativa: versaoNormativaSchema,
    versaoDoMotor: versaoDoMotorSchema,
    hashDoBundle: sha256Schema,
    hashDoDocumentoFonte: sha256Schema,
    hashDoResultado: sha256Schema,
    artifacts: z.array(artifactSchema),
    semaforo: semaforoSchema,
    /** IDs das divergências normativas aplicadas, ex.: `D-001`. */
    divergenciasAplicadas: z.array(z.string()),
  })
  .strict();
export type ExecucaoV2 = z.infer<typeof execucaoV2Schema>;
