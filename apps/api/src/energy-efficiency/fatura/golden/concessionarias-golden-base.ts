/**
 * Base TypeScript de golden cases para plugga-os — auditoria energetica.
 * Gerado a partir da skill estudo-eficiencia-energetica/casos/*_conciliada.json.
 *
 * Intencao: servir como ponte para testes do plugga-os.
 * Nao cria parser por concessionaria; preserva a arquitetura recomendada:
 * leitor generico -> FaturaNormativa -> Trava 1 -> motor unico.
 */

export type RegimeEnergia = 'cativo' | 'mercado_livre' | string;
export type GrupoTarifario = 'A' | 'B' | string;
export type ModalidadeTarifaria = 'verde' | 'azul' | string | undefined;

export interface ItemFaturaEsperado {
  nome: string;
  valor: number;
  kwh?: number;
  kw?: number;
  tarifa?: number;
  detalhe?: string;
  [key: string]: unknown;
}

export interface FaturaConciliadaEsperada {
  cliente?: string;
  cnpj?: string;
  uc?: string;
  distribuidora: string;
  distribuidora_display?: string;
  localidade?: string;
  regime?: RegimeEnergia;
  grupo?: GrupoTarifario;
  modalidade?: ModalidadeTarifaria;
  classe?: string;
  referencia?: string;
  vencimento?: string;
  total: number;
  itens: ItemFaturaEsperado[];
  nao_cobrados?: ItemFaturaEsperado[];
  consumo_ponta_kwh?: number;
  consumo_fp_kwh?: number;
  tarifa_ponta_total?: number;
  tarifa_fp_total?: number;
  demanda_contratada_kw?: number;
  demanda_registrada_ponta_kw?: number;
  demanda_registrada_fp_kw?: number;
  demanda_complemento_valor?: number | null;
  energia_nf?: Record<string, unknown>;
  prova?: { soma_itens: number; total: number; diferenca: number };
  [key: string]: unknown;
}

export interface GoldenFaturaCase {
  id: string;
  sourceFile: string;
  distribuidora: string;
  regime?: RegimeEnergia;
  grupo?: GrupoTarifario;
  modalidade?: ModalidadeTarifaria;
  cliente?: string;
  uc?: string;
  referencia?: string;
  total?: number;
  expected: FaturaConciliadaEsperada;
  checks: {
    somaItens: number;
    total: number;
    diferenca: number;
    itensCount: number;
    naoCobradosCount: number;
    temDemandaComplementoValor: boolean;
    temEnergiaNf: boolean;
  };
}

export interface DistribuidoraProfile {
  id: string;
  nomesReconhecidos: string[];
  estrategia: 'leitor_generico_trava_1' | 'leitor_generico_trava_1_ocr_quando_preciso';
  observacoes: string[];
}

export const DISTRIBUIDORA_PROFILES = {
  "ambar_amazonas": {
    "id": "ambar_amazonas",
    "nomesReconhecidos": [
      "Amazonas Energia",
      "Ambar Energia AM",
      "AMBAR ENERGIA - AM"
    ],
    "estrategia": "leitor_generico_trava_1",
    "observacoes": [
      "Amazonas Energia e Ambar Energia AM devem ser tratadas como mesma distribuidora/historico quando o CNPJ for o mesmo.",
      "Adicional Bandeira costuma ser informativo: se estourar a soma, marcar nao compondo total.",
      "Dois layouts: via pagamento 1 pagina e DANF3E 2 colunas."
    ]
  },
  "roraima_energia": {
    "id": "roraima_energia",
    "nomesReconhecidos": [
      "Roraima Energia",
      "RORAIMA ENERGIA S.A"
    ],
    "estrategia": "leitor_generico_trava_1",
    "observacoes": [
      "Layout pode vir em duas colunas.",
      "Demanda Ponta sem ICMS deve alimentar demandaComplementoValor quando linha explicita existir.",
      "Bandeira/adicional informativo quando a aritmetica provar que nao compoe total."
    ]
  },
  "energisa_ro_ac": {
    "id": "energisa_ro_ac",
    "nomesReconhecidos": [
      "Energisa Rondonia",
      "Energisa Rondônia",
      "Energisa Acre"
    ],
    "estrategia": "leitor_generico_trava_1",
    "observacoes": [
      "Itens TUSD em kWh/kW; APCEI pode vir como credito/debito.",
      "Em ML, estudo usa TUSD cheia; creditos APCEI nao escalam com deslocamento.",
      "Historico de 13 meses pode apoiar sazonalidade/demanda ideal."
    ]
  },
  "equatorial_pa": {
    "id": "equatorial_pa",
    "nomesReconhecidos": [
      "Equatorial Para",
      "Equatorial Pará"
    ],
    "estrategia": "leitor_generico_trava_1_ocr_quando_preciso",
    "observacoes": [
      "Frequentemente escaneado: pode exigir OCR/imagem.",
      "Usar preco unitario com tributos.",
      "Bandeira pode compor total; nao marcar informativo se a soma so fechar incluindo."
    ]
  }
} as const satisfies Record<string, DistribuidoraProfile>;

export const GOLDEN_FATURA_CASES = [
  {
    "id": "fatura-alvorada-2026-06",
    "sourceFile": "fatura-alvorada-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118253278",
    "referencia": "06/2026",
    "total": 125609.89,
    "expected": {
      "consumo_ponta_kwh": 25578,
      "consumo_fp_kwh": 277830,
      "demanda_complemento_valor": null,
      "ultrapassagem_kw": 73,
      "ultrapassagem_valor": 4126.32,
      "tarifa_demanda_kw": 14.1575,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 0,
      "reativo_fp_valor": 0.0,
      "total": 125609.89,
      "demanda_contratada_kw": 540,
      "demanda_registrada_ponta_kw": 564,
      "demanda_registrada_fp_kw": 613,
      "classe": "comercial",
      "uc": "118253278",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Alvorada",
      "nome_analise": "Mercantil Nova Era (loja Alvorada)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 23793.88,
          "kwh": 25578,
          "tarifa": 0.930248
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 80869.36,
          "kwh": 277830,
          "tarifa": 0.291075
        },
        {
          "nome": "Demanda",
          "valor": 8678.54,
          "kw": 613,
          "detalhe": "613 kW a 14,157500"
        },
        {
          "nome": "Ultrapassagem de demanda",
          "valor": 4126.32,
          "kw": 73,
          "detalhe": "73 kW a 56,525000 (em dobro)"
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -604.12
        }
      ],
      "demanda_ref_potencia_kw": 564,
      "tarifa_ponta_total": 1.160523,
      "tarifa_fp_total": 0.52135,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 70331.74,
        "mwh": 305.425,
        "preco_kwh": 0.230275
      },
      "total_gasto_energia": 195941.63,
      "fonte": "NF3e Ambar Energia AM + A100010077708-danfe ALVORADA.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 125609.89,
        "total": 125609.89,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 125609.89,
      "total": 125609.89,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-alvorada-ii-2026-06",
    "sourceFile": "fatura-alvorada-ii-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118253377",
    "referencia": "06/2026",
    "total": 91533.57,
    "expected": {
      "consumo_ponta_kwh": 19831,
      "consumo_fp_kwh": 208488,
      "demanda_complemento_valor": 90.49,
      "reativo_ponta_kwh": 98,
      "reativo_ponta_valor": 34.43,
      "reativo_fp_kwh": 819,
      "reativo_fp_valor": 287.78,
      "total": 91533.57,
      "demanda_contratada_kw": 470,
      "demanda_registrada_ponta_kw": 438,
      "demanda_registrada_fp_kw": 462,
      "classe": "comercial",
      "uc": "118253377",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Alvorada Ii",
      "nome_analise": "Mercantil Nova Era (loja Alvorada Ii)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 18348.79,
          "kwh": 19831,
          "tarifa": 0.925258
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 59804.78,
          "kwh": 208488,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 6623.17,
          "kw": 470,
          "detalhe": "462 kW a 14,140000 + 8 kW a 11,312000"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 34.43
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 287.78
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -2311.29
        }
      ],
      "demanda_ref_potencia_kw": 438,
      "tarifa_ponta_total": 1.091008,
      "tarifa_fp_total": 0.4526,
      "energia_nf": {
        "fornecedor": "TRADENER",
        "total": 37863.93,
        "mwh": 228.44,
        "preco_kwh": 0.16575
      },
      "total_gasto_energia": 129397.5,
      "fonte": "NF3e Ambar Energia AM + TRADANER ALVORADA II.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 91533.57,
        "total": 91533.57,
        "diferenca": -0.0
      }
    },
    "checks": {
      "somaItens": 91533.57,
      "total": 91533.57,
      "diferenca": -0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-brasilia-2026-06",
    "sourceFile": "fatura-brasilia-2026-06_conciliada.json",
    "distribuidora": "Energisa Rondonia",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "9/18697898 (conta contrato)",
    "referencia": "06/2026",
    "total": 74106.71,
    "expected": {
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0028-77",
      "uc": "9/18697898 (conta contrato)",
      "distribuidora": "Energisa Rondonia",
      "distribuidora_display": "Energisa Rondônia S.A.",
      "localidade": "Porto Velho/RO",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "vencimento": "31/07/2026",
      "total": 74106.71,
      "apelido": "Brasilia",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Mercantil Nova Era (loja Brasília)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 43371.44,
          "kwh": 12524,
          "tarifa": 3.46306
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 25065.84,
          "kwh": 118775,
          "tarifa": 0.21103
        },
        {
          "nome": "Demanda (TUSD kW)",
          "valor": 25511.06,
          "kw": 324,
          "detalhe": "324 kW medida a 49,826320 + ULTRAPASSAGEM 94 kW a 99,652650"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 9.67
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 32.32
        },
        {
          "nome": "Debitos APCEI 05/2026",
          "valor": 40.33
        },
        {
          "nome": "Creditos APCEI 07/2026",
          "valor": -20773.62
        },
        {
          "nome": "COSIP",
          "valor": 849.67
        }
      ],
      "consumo_ponta_kwh": 12524,
      "consumo_fp_kwh": 118775,
      "demanda_contratada_kw": 230,
      "demanda_registrada_ponta_kw": 0,
      "demanda_registrada_fp_kw": 324,
      "demanda_ref_potencia_kw": 324,
      "ultrapassagem_valor": 9367.34,
      "ultrapassagem_kw": 94,
      "tarifa_demanda_kw": 49.82632,
      "reativo_ponta_kwh": 32,
      "reativo_fp_kwh": 108,
      "reativo_ponta_valor": 9.67,
      "reativo_fp_valor": 32.32,
      "tarifa_ponta_total": 3.7073954,
      "tarifa_fp_total": 0.4553654,
      "beneficio_isencao_valor": 20733.29,
      "energia_nf": {
        "fornecedor": "ENEL (fornecimento livre)",
        "total": 26064.48,
        "mwh": 106.675,
        "preco_kwh": 0.2443354,
        "obs": "NF secundaria (danfe R$ 7.566,39) informativa, fora da formacao de preco"
      },
      "total_gasto_energia": 107737.58,
      "fonte": "DANF3E Energisa RO + NF ENEL fornecimento",
      "conciliada": true,
      "prova": {
        "soma_itens": 74106.71,
        "total": 74106.71,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 74106.71,
      "total": 74106.71,
      "diferenca": 0.0,
      "itensCount": 8,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-cantuaria-2026-06",
    "sourceFile": "fatura-cantuaria-2026-06_conciliada.json",
    "distribuidora": "Energisa Rondonia",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "azul",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "9/18697841 (conta contrato)",
    "referencia": "06/2026",
    "total": 68542.76,
    "expected": {
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0028-77",
      "uc": "9/18697841 (conta contrato)",
      "distribuidora": "Energisa Rondonia",
      "distribuidora_display": "Energisa Rondônia S.A.",
      "localidade": "Porto Velho/RO",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "azul",
      "funcao": "peak_shaving",
      "classe": "comercial",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "vencimento": "17/07/2026",
      "total": 68542.76,
      "apelido": "Cantuaria",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Mercantil Nova Era (loja Cantuária)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 2928.34,
          "kwh": 13876,
          "tarifa": 0.21103
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 25097.5,
          "kwh": 118925,
          "tarifa": 0.21103
        },
        {
          "nome": "Demanda (TUSD kW ponta + fora ponta)",
          "valor": 63118.55,
          "kw": 360,
          "detalhe": "PONTA: 272 kW medida a 134,051980 + 88 kW NC a 107,911840 = 45.958,37; FP: 280 kW a 49,826320 + 80 kW NC a 40,110190 = 17.160,18"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 0.01
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 3.19
        },
        {
          "nome": "Encargo Covid Escassez Hidrica",
          "valor": 679.87
        },
        {
          "nome": "Debitos APCEI 05/2026",
          "valor": 45.03
        },
        {
          "nome": "Creditos APCEI 07/2026",
          "valor": -24179.4
        },
        {
          "nome": "COSIP",
          "valor": 849.67
        }
      ],
      "consumo_ponta_kwh": 13876,
      "consumo_fp_kwh": 118925,
      "demanda_contratada_kw": 360,
      "demanda_registrada_ponta_kw": 272,
      "demanda_registrada_fp_kw": 280,
      "demanda_ref_potencia_kw": 272,
      "demanda_ponta_valor_total": 45958.37,
      "tarifa_kw_ponta_medida": 134.05198,
      "tarifa_kw_ponta_nc": 107.91184,
      "reativo_ponta_kwh": 0,
      "reativo_fp_kwh": 11,
      "reativo_ponta_valor": 0.01,
      "reativo_fp_valor": 3.19,
      "tarifa_ponta_total": 0.5120238,
      "tarifa_fp_total": 0.5120238,
      "beneficio_isencao_valor": 24134.37,
      "demanda_complemento_valor": 12705.05,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 40247.08,
        "mwh": 133.714,
        "preco_kwh": 0.3009938
      },
      "total_gasto_energia": 108789.84,
      "fonte": "DANF3E Energisa RO + NF ECOM",
      "conciliada": true,
      "prova": {
        "soma_itens": 68542.76,
        "total": 68542.76,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 68542.76,
      "total": 68542.76,
      "diferenca": 0.0,
      "itensCount": 9,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-centro-2026-06",
    "sourceFile": "fatura-centro-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118252983",
    "referencia": "06/2026",
    "total": 41242.69,
    "expected": {
      "consumo_ponta_kwh": 5310,
      "consumo_fp_kwh": 86807,
      "demanda_complemento_valor": null,
      "ultrapassagem_kw": 32,
      "ultrapassagem_valor": 1808.8,
      "tarifa_demanda_kw": 14.1575,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 1,
      "reativo_fp_valor": 0.35,
      "total": 41242.69,
      "demanda_contratada_kw": 180,
      "demanda_registrada_ponta_kw": 118,
      "demanda_registrada_fp_kw": 212,
      "classe": "comercial",
      "uc": "118252983",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Centro",
      "nome_analise": "Mercantil Nova Era (loja Centro)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 4939.61,
          "kwh": 5310,
          "tarifa": 0.930248
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 25267.34,
          "kwh": 86807,
          "tarifa": 0.291075
        },
        {
          "nome": "Demanda",
          "valor": 3001.39,
          "kw": 212,
          "detalhe": "212 kW a 14,157500"
        },
        {
          "nome": "Ultrapassagem de demanda",
          "valor": 1808.8,
          "kw": 32,
          "detalhe": "32 kW a 56,525000 (em dobro)"
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 0.35
        },
        {
          "nome": "COSIP",
          "valor": 6399.45
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -174.25
        }
      ],
      "demanda_ref_potencia_kw": 118,
      "tarifa_ponta_total": 1.160523,
      "tarifa_fp_total": 0.52135,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 21332.91,
        "mwh": 92.641,
        "preco_kwh": 0.230275
      },
      "total_gasto_energia": 62575.6,
      "fonte": "NF3e Ambar Energia AM + A100010077710-danfe CENTRO.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 41242.69,
        "total": 41242.69,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 41242.69,
      "total": 41242.69,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-chibatao",
    "sourceFile": "fatura-chibatao_conciliada.json",
    "distribuidora": "Amazonas Energia",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Chibatao Navegacao e Comercio LTDA",
    "uc": "0449284-6",
    "referencia": "08/2025",
    "total": 700221.8,
    "expected": {
      "cliente": "Chibatao Navegacao e Comercio LTDA",
      "cnpj": "",
      "uc": "0449284-6",
      "distribuidora": "Amazonas Energia",
      "distribuidora_display": "Amazonas Energia S.A.",
      "localidade": "Manaus/AM",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "industrial",
      "classe_display": "Industrial / porto e navegacao",
      "referencia": "08/2025",
      "vencimento": "16/09/2025",
      "total": 700221.8,
      "apelido": "Chibatao Navegacao",
      "leitura_anterior": "31/07/2025",
      "leitura_atual": "31/08/2025",
      "nome_analise": "Chibatao Navegacao",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 107044.71,
          "kwh": 59178,
          "tarifa": 1.80886
        },
        {
          "nome": "Demanda",
          "valor": 49983.92,
          "kw": 2177,
          "tarifa": 22.96
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 5470.25
        },
        {
          "nome": "Reativo excedente de demanda (Dem R Exc)",
          "valor": 16439.36,
          "kw": 716,
          "tarifa": 22.96
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 458216.42,
          "kwh": 797328,
          "tarifa": 0.57469
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 54321.23
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "consumo_ponta_kwh": 59178,
      "consumo_fp_kwh": 797328,
      "demanda_contratada_kw": 2100,
      "demanda_registrada_fp_kw": 2177,
      "demanda_ref_potencia_kw": 2177,
      "tarifa_ponta_total": 1.80886,
      "tarifa_fp_total": 0.57469,
      "fonte": "Fatura Amazonas Energia 08/2025 (imagem via chat DK)",
      "conciliada": true,
      "prova": {
        "soma_itens": 700221.8,
        "total": 700221.8,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 700221.8,
      "total": 700221.8,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-cidade-de-deus-2026-06",
    "sourceFile": "fatura-cidade-de-deus-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254666",
    "referencia": "06/2026",
    "total": 52786.08,
    "expected": {
      "consumo_ponta_kwh": 9315,
      "consumo_fp_kwh": 104568,
      "demanda_complemento_valor": 1914.09,
      "reativo_ponta_kwh": 8,
      "reativo_ponta_valor": 2.81,
      "reativo_fp_kwh": 288,
      "reativo_fp_valor": 101.19,
      "total": 52786.08,
      "demanda_contratada_kw": 430,
      "demanda_registrada_ponta_kw": 228,
      "demanda_registrada_fp_kw": 261,
      "classe": "comercial",
      "uc": "118254666",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Cidade De Deus",
      "nome_analise": "Mercantil Nova Era (loja Cidade De Deus)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 8625.9,
          "kwh": 9315,
          "tarifa": 0.926023
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 29995.33,
          "kwh": 104568,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 5609.19,
          "kw": 430,
          "detalhe": "261 kW a 14,157500 + 169 kW a 11,326000"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 2.81
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 101.19
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -294.25
        }
      ],
      "demanda_ref_potencia_kw": 228,
      "tarifa_ponta_total": 1.1720855,
      "tarifa_fp_total": 0.5329125,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 28221.15,
        "mwh": 114.691,
        "preco_kwh": 0.2460625
      },
      "total_gasto_energia": 81007.23,
      "fonte": "NF3e Ambar Energia AM + A100010077816-danfe ECOM CIDADE DE DEUS.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 52786.08,
        "total": 52786.08,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 52786.08,
      "total": 52786.08,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-cidade-nova-2026-06",
    "sourceFile": "fatura-cidade-nova-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254161",
    "referencia": "06/2026",
    "total": 117142.97,
    "expected": {
      "consumo_ponta_kwh": 24200,
      "consumo_fp_kwh": 265910,
      "demanda_complemento_valor": 1030.66,
      "reativo_ponta_kwh": 16,
      "reativo_ponta_valor": 5.62,
      "reativo_fp_kwh": 403,
      "reativo_fp_valor": 141.6,
      "total": 117142.97,
      "demanda_contratada_kw": 650,
      "demanda_registrada_ponta_kw": 508,
      "demanda_registrada_fp_kw": 559,
      "classe": "comercial",
      "uc": "118254161",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Cidade Nova",
      "nome_analise": "Mercantil Nova Era (loja Cidade Nova)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 22512.0,
          "kwh": 24200,
          "tarifa": 0.930248
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 77399.75,
          "kwh": 265910,
          "tarifa": 0.291075
        },
        {
          "nome": "Demanda",
          "valor": 8944.7,
          "kw": 650,
          "detalhe": "559 kW a 14,157500 + 91 kW a 11,326000"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 5.62
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 141.6
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -606.61
        }
      ],
      "demanda_ref_potencia_kw": 508,
      "tarifa_ponta_total": 1.160523,
      "tarifa_fp_total": 0.52135,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 67176.29,
        "mwh": 291.722,
        "preco_kwh": 0.230275
      },
      "total_gasto_energia": 184319.26,
      "fonte": "NF3e Ambar Energia AM + A100010077711-danfe CIDADE NOVA.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 117142.97,
        "total": 117142.97,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 117142.97,
      "total": 117142.97,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-cidade-nova-ii-2026-06",
    "sourceFile": "fatura-cidade-nova-ii-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254185",
    "referencia": "06/2026",
    "total": 95597.7,
    "expected": {
      "consumo_ponta_kwh": 19999,
      "consumo_fp_kwh": 212674,
      "demanda_complemento_valor": 747.78,
      "reativo_ponta_kwh": 7,
      "reativo_ponta_valor": 2.45,
      "reativo_fp_kwh": 0,
      "reativo_fp_valor": 0.0,
      "total": 95597.7,
      "demanda_contratada_kw": 530,
      "demanda_registrada_ponta_kw": 435,
      "demanda_registrada_fp_kw": 464,
      "classe": "comercial",
      "uc": "118254185",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Cidade Nova Ii",
      "nome_analise": "Mercantil Nova Era (loja Cidade Nova Ii)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 18524.63,
          "kwh": 19999,
          "tarifa": 0.926278
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 61005.53,
          "kwh": 212674,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 7319.18,
          "kw": 530,
          "detalhe": "464 kW a 14,162500 + 66 kW a 11,330000"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 2.45
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "demanda_ref_potencia_kw": 435,
      "tarifa_ponta_total": 1.169078,
      "tarifa_fp_total": 0.52965,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 56964.28,
        "mwh": 234.614,
        "preco_kwh": 0.2428
      },
      "total_gasto_energia": 152561.98,
      "fonte": "NF3e Ambar Energia AM + NFE_0002562032_1 CIDADE NOVA II.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 95597.7,
        "total": 95597.7,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 95597.7,
      "total": 95597.7,
      "diferenca": 0.0,
      "itensCount": 5,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-compensa-2026-06",
    "sourceFile": "fatura-compensa-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118253098",
    "referencia": "06/2026",
    "total": 114712.25,
    "expected": {
      "consumo_ponta_kwh": 23884,
      "consumo_fp_kwh": 261163,
      "demanda_complemento_valor": 893.09,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 0,
      "reativo_fp_valor": 0.0,
      "total": 114712.25,
      "demanda_contratada_kw": 650,
      "demanda_registrada_ponta_kw": 512,
      "demanda_registrada_fp_kw": 571,
      "classe": "comercial",
      "uc": "118253098",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Compensa",
      "nome_analise": "Mercantil Nova Era (loja Compensa)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 22089.71,
          "kwh": 23884,
          "tarifa": 0.924875
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 74914.6,
          "kwh": 261163,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 8962.03,
          "kw": 650,
          "detalhe": "571 kW a 14,131250 + 79 kW a 11,305000"
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "demanda_ref_potencia_kw": 512,
      "tarifa_ponta_total": 1.16555,
      "tarifa_fp_total": 0.527525,
      "energia_nf": {
        "fornecedor": "ENEL",
        "total": 69015.73,
        "mwh": 286.759,
        "preco_kwh": 0.240675
      },
      "total_gasto_energia": 183727.98,
      "fonte": "NF3e Ambar Energia AM + 2026_06_FORNECIMENTO_ENEL_NOVA ERA - Compensa.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 114712.25,
        "total": 114712.25,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 114712.25,
      "total": 114712.25,
      "diferenca": 0.0,
      "itensCount": 4,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-coroado-2026-06",
    "sourceFile": "fatura-coroado-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254786",
    "referencia": "06/2026",
    "total": 93739.76,
    "expected": {
      "consumo_ponta_kwh": 19628,
      "consumo_fp_kwh": 203119,
      "demanda_complemento_valor": 1189.65,
      "reativo_ponta_kwh": 245,
      "reativo_ponta_valor": 86.08,
      "reativo_fp_kwh": 3164,
      "reativo_fp_valor": 1111.78,
      "total": 93739.76,
      "demanda_contratada_kw": 540,
      "demanda_registrada_ponta_kw": 404,
      "demanda_registrada_fp_kw": 435,
      "classe": "comercial",
      "uc": "118254786",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Coroado",
      "nome_analise": "Mercantil Nova Era (loja Coroado)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 18180.98,
          "kwh": 19628,
          "tarifa": 0.926278
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 58264.68,
          "kwh": 203119,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 7350.33,
          "kw": 540,
          "detalhe": "435 kW a 14,162500 + 105 kW a 11,330000"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 86.08
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 1111.78
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "demanda_ref_potencia_kw": 404,
      "tarifa_ponta_total": 1.169078,
      "tarifa_fp_total": 0.52965,
      "energia_nf": {
        "fornecedor": "ENEL",
        "total": 54414.64,
        "mwh": 224.113,
        "preco_kwh": 0.2428
      },
      "total_gasto_energia": 148154.4,
      "fonte": "NF3e Ambar Energia AM + NFE_0002562030_1 ENEL COROADO .pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 93739.76,
        "total": 93739.76,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 93739.76,
      "total": 93739.76,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-flores-2026-06",
    "sourceFile": "fatura-flores-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118253813",
    "referencia": "06/2026",
    "total": 254302.29,
    "expected": {
      "consumo_ponta_kwh": 53949,
      "consumo_fp_kwh": 598332,
      "demanda_complemento_valor": 5629.89,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 0,
      "reativo_fp_valor": 0.0,
      "total": 254302.29,
      "demanda_contratada_kw": 1800,
      "demanda_registrada_ponta_kw": 1083,
      "demanda_registrada_fp_kw": 1302,
      "classe": "comercial",
      "uc": "118253813",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Flores",
      "nome_analise": "Mercantil Nova Era (loja Flores)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 49896.08,
          "kwh": 53949,
          "tarifa": 0.924875
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 171631.53,
          "kwh": 598332,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 24028.77,
          "kw": 1800,
          "detalhe": "1.302 kW a 14,131250 + 498 kW a 11,305000"
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "demanda_ref_potencia_kw": 1083,
      "tarifa_ponta_total": 1.16555,
      "tarifa_fp_total": 0.527525,
      "energia_nf": {
        "fornecedor": "ENEL",
        "total": 165714.85,
        "mwh": 688.542,
        "preco_kwh": 0.240675
      },
      "total_gasto_energia": 420017.14,
      "fonte": "NF3e Ambar Energia AM + 2026_06_FORNECIMENTO_ENEL_NOVA ERA - Flores (Matriz).pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 254302.29,
        "total": 254302.29,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 254302.29,
      "total": 254302.29,
      "diferenca": 0.0,
      "itensCount": 4,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-grande-circular-2026-06",
    "sourceFile": "fatura-grande-circular-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254802",
    "referencia": "06/2026",
    "total": 100434.35,
    "expected": {
      "consumo_ponta_kwh": 19603,
      "consumo_fp_kwh": 223030,
      "demanda_complemento_valor": 1548.78,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 220,
      "reativo_fp_valor": 77.3,
      "total": 100434.35,
      "demanda_contratada_kw": 700,
      "demanda_registrada_ponta_kw": 430,
      "demanda_registrada_fp_kw": 563,
      "classe": "comercial",
      "uc": "118254802",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Grande Circular",
      "nome_analise": "Mercantil Nova Era (loja Grande Circular)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 18130.32,
          "kwh": 19603,
          "tarifa": 0.924875
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 63976.15,
          "kwh": 223030,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 9504.67,
          "kw": 700,
          "detalhe": "563 kW a 14,131250 + 137 kW a 11,305000"
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 77.3
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "demanda_ref_potencia_kw": 430,
      "tarifa_ponta_total": 1.16555,
      "tarifa_fp_total": 0.527525,
      "energia_nf": {
        "fornecedor": "ENEL",
        "total": 58743.95,
        "mwh": 244.08,
        "preco_kwh": 0.240675
      },
      "total_gasto_energia": 159178.3,
      "fonte": "NF3e Ambar Energia AM + 2026_06_FORNECIMENTO_ENEL_NOVA ERA - Grande Circular.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 100434.35,
        "total": 100434.35,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 100434.35,
      "total": 100434.35,
      "diferenca": 0.0,
      "itensCount": 5,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-gree-2026-04",
    "sourceFile": "fatura-gree-2026-04_conciliada.json",
    "distribuidora": "Amazonas Energia",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "azul",
    "cliente": "Gree Electric Appliances do Brasil Ltda",
    "uc": "0605254",
    "referencia": "04/2026",
    "total": 277423.97,
    "expected": {
      "cliente": "Gree Electric Appliances do Brasil Ltda",
      "cnpj": "03.519.167/0001",
      "uc": "0605254",
      "distribuidora": "Amazonas Energia",
      "distribuidora_display": "Amazonas Energia S.A.",
      "localidade": "Manaus/AM",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "azul",
      "funcao": "peak_shaving",
      "classe": "industrial",
      "classe_display": "Industrial / industrial",
      "referencia": "04/2026",
      "vencimento": "05/05/2026",
      "total": 277423.97,
      "apelido": "Gree",
      "leitura_anterior": "28/02/2026",
      "leitura_atual": "31/03/2026",
      "nome_analise": "Gree Electric Appliances do Brasil (PIM)",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 29026.83,
          "kwh": 41643,
          "tarifa": 0.69704
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 168816.12,
          "kwh": 340410,
          "tarifa": 0.49592
        },
        {
          "nome": "Demanda (ponta + fora ponta)",
          "valor": 61609.04,
          "kw": 1999,
          "detalhe": "PONTA: 771 kW medida + 29 NC a 42,60 = 34.080,00; FP: 1.199 kW a 22,96 = 27.529,04"
        },
        {
          "nome": "Ultrapassagem de demanda FP",
          "valor": 9138.08,
          "kw": 199
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 87.99
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "consumo_ponta_kwh": 41643,
      "consumo_fp_kwh": 340410,
      "demanda_contratada_kw": 1000,
      "demanda_registrada_ponta_kw": 771,
      "demanda_registrada_fp_kw": 1199,
      "demanda_ref_potencia_kw": 771,
      "demanda_ponta_valor_total": 34080.0,
      "tarifa_kw_ponta_medida": 42.6,
      "tarifa_kw_ponta_nc": 42.6,
      "ultrapassagem_kw": 199,
      "ultrapassagem_valor": 9138.08,
      "tarifa_demanda_kw": 22.96,
      "reativo_ponta_kwh": 0,
      "reativo_fp_kwh": 252,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_valor": 87.99,
      "tarifa_ponta_total": 0.69704,
      "tarifa_fp_total": 0.49592,
      "fonte": "Fatura Amazonas Energia 04/2026 (inbound)",
      "conciliada": true,
      "prova": {
        "soma_itens": 277423.97,
        "total": 277423.97,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 277423.97,
      "total": 277423.97,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-imigrantes-2026-06",
    "sourceFile": "fatura-imigrantes-2026-06_conciliada.json",
    "distribuidora": "Energisa Rondonia",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "1.208.807.020-04",
    "referencia": "06/2026",
    "total": 109980.7,
    "expected": {
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0028-77",
      "uc": "1.208.807.020-04",
      "distribuidora": "Energisa Rondonia",
      "distribuidora_display": "Energisa Rondônia S.A.",
      "localidade": "Porto Velho/RO",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "vencimento": "31/07/2026",
      "total": 109980.7,
      "apelido": "Imigrantes",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Mercantil Nova Era (loja Imigrantes)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 75733.8,
          "kwh": 21869,
          "tarifa": 3.46306
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 43302.13,
          "kwh": 205188,
          "tarifa": 0.21103
        },
        {
          "nome": "Demanda (TUSD kW)",
          "valor": 25606.24,
          "kw": 526,
          "detalhe": "464 kW medida a 49,826320 + 62 kW nao consumida a 40,110190"
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 1.09
        },
        {
          "nome": "Debitos APCEI 05/2026",
          "valor": 38.37
        },
        {
          "nome": "Creditos APCEI 07/2026",
          "valor": -35550.6
        },
        {
          "nome": "COSIP",
          "valor": 849.67
        }
      ],
      "consumo_ponta_kwh": 21869,
      "consumo_fp_kwh": 205188,
      "demanda_contratada_kw": 526,
      "demanda_registrada_ponta_kw": 0,
      "demanda_registrada_fp_kw": 464,
      "demanda_ref_potencia_kw": 464,
      "reativo_ponta_kwh": 0,
      "reativo_fp_kwh": 4,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_valor": 1.09,
      "tarifa_ponta_total": 3.7073954,
      "tarifa_fp_total": 0.4553654,
      "beneficio_isencao_valor": 35512.23,
      "demanda_complemento_valor": 2486.83,
      "energia_nf": {
        "fornecedor": "ENEL (fornecimento livre)",
        "total": 45187.88,
        "mwh": 184.942,
        "preco_kwh": 0.2443354,
        "obs": "NF secundaria (danfe R$ 13.117,61 / 43,581 MWh) informativa, fora da formacao de preco"
      },
      "total_gasto_energia": 168286.19,
      "fonte": "DANF3E Energisa RO emitida 07/07/2026 + NF ENEL fornecimento",
      "conciliada": true,
      "prova": {
        "soma_itens": 109980.7,
        "total": 109980.7,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 109980.7,
      "total": 109980.7,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-japiim-cenario",
    "sourceFile": "fatura-japiim-cenario_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "E da Silva Vieira EIRELI (Barateiro Japiim)",
    "uc": "0000452048002-07",
    "referencia": "06/2026",
    "total": 48959.37,
    "expected": {
      "cliente": "E da Silva Vieira EIRELI (Barateiro Japiim)",
      "cnpj": "",
      "uc": "0000452048002-07",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / supermercado (CENARIO SEM CREDITOS DE GERACAO)",
      "referencia": "06/2026",
      "vencimento": "14/07/2026",
      "total": 48959.37,
      "apelido": "Barateiro Japiim cenario",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Barateiro Japiim (cenario pos-creditos)",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 6186.11,
          "kwh": 3427,
          "tarifa": 1.80511
        },
        {
          "nome": "Demanda",
          "valor": 4069.8,
          "kw": 180,
          "tarifa": 22.61
        },
        {
          "nome": "Demanda complementar",
          "valor": 452.2,
          "kw": 20,
          "tarifa": 22.61
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 31851.81,
          "kwh": 61237,
          "tarifa": 0.52014
        },
        {
          "nome": "COSIP",
          "valor": 6399.45
        }
      ],
      "consumo_ponta_kwh": 3427,
      "consumo_fp_kwh": 61237,
      "demanda_contratada_kw": 200,
      "demanda_registrada_fp_kw": 176,
      "demanda_ref_potencia_kw": 176,
      "tarifa_ponta_total": 1.80511,
      "tarifa_fp_total": 0.52014,
      "fonte": "Fatura 06/2026 SEM as linhas de credito de geracao (cenario: creditos acumulados esgotados, ordem Dilkson 09/08)",
      "conciliada": true,
      "prova": {
        "soma_itens": 48959.37,
        "total": 48959.37,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 48959.37,
      "total": 48959.37,
      "diferenca": 0.0,
      "itensCount": 5,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-jardim-floresta-2026-06",
    "sourceFile": "fatura-jardim-floresta-2026-06_conciliada.json",
    "distribuidora": "Roraima Energia",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "01374052",
    "referencia": "06/2026",
    "total": 76295.48,
    "expected": {
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0043-06",
      "uc": "01374052",
      "distribuidora": "Roraima Energia",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "referencia": "06/2026",
      "vencimento": "21/07/2026",
      "total": 76295.48,
      "apelido": "Jardim Floresta",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "classe_display": "Comercial / comercial",
      "nome_analise": "Mercantil Nova Era (loja Jardim Floresta)",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 18557.99,
          "kwh": 6901,
          "tarifa": 2.689175
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 45275.83,
          "kwh": 72330,
          "tarifa": 0.625962
        },
        {
          "nome": "Demanda",
          "valor": 12315.42,
          "kw": 514,
          "detalhe": "167 kW com ICMS a 27,70 + 347 kW sem ICMS a 22,16"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 3.44
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 86.17
        },
        {
          "nome": "COSIP",
          "valor": 56.63
        }
      ],
      "consumo_ponta_kwh": 6901,
      "consumo_fp_kwh": 72330,
      "demanda_contratada_kw": 500,
      "demanda_registrada_ponta_kw": 151,
      "demanda_registrada_fp_kw": 167,
      "reativo_ponta_kwh": 8,
      "reativo_fp_kwh": 200,
      "reativo_ponta_valor": 3.44,
      "reativo_fp_valor": 86.17,
      "tarifa_ponta_total": 2.689175,
      "tarifa_fp_total": 0.625962,
      "demanda_complemento_valor": 7689.52,
      "nao_cobrados": [
        {
          "nome": "Adicional Bandeira Amarela",
          "valor": 1491.05,
          "motivo": "bandeira Verde R$ 0,00 na referencia — linha informativa"
        }
      ],
      "fonte": "NF 21471922 Roraima Energia, emitida 01/07/2026",
      "conciliada": true,
      "prova": {
        "soma_itens": 76295.48,
        "total": 76295.48,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 76295.48,
      "total": 76295.48,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 1,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-jatuarana-2026-06",
    "sourceFile": "fatura-jatuarana-2026-06_conciliada.json",
    "distribuidora": "Energisa Rondonia",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "9/18697896 (conta contrato)",
    "referencia": "06/2026",
    "total": 58966.72,
    "expected": {
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0028-77",
      "uc": "9/18697896 (conta contrato)",
      "distribuidora": "Energisa Rondonia",
      "distribuidora_display": "Energisa Rondônia S.A.",
      "localidade": "Porto Velho/RO",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "vencimento": "31/07/2026",
      "total": 58966.72,
      "apelido": "Jatuarana",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Mercantil Nova Era (loja Jatuarana)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 40064.21,
          "kwh": 11569,
          "tarifa": 3.46306
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 23491.93,
          "kwh": 111317,
          "tarifa": 0.21103
        },
        {
          "nome": "Demanda (TUSD kW)",
          "valor": 13368.4,
          "kw": 280,
          "detalhe": "220 kW medida a 49,826320 + 60 kW nao consumida a 40,110190"
        },
        {
          "nome": "Debitos APCEI 05/2026",
          "valor": 30.92
        },
        {
          "nome": "Creditos APCEI 07/2026",
          "valor": -18838.41
        },
        {
          "nome": "COSIP",
          "valor": 849.67
        }
      ],
      "consumo_ponta_kwh": 11569,
      "consumo_fp_kwh": 111317,
      "demanda_contratada_kw": 280,
      "demanda_registrada_ponta_kw": 0,
      "demanda_registrada_fp_kw": 220,
      "demanda_ref_potencia_kw": 220,
      "reativo_ponta_kwh": 0,
      "reativo_fp_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_valor": 0.0,
      "tarifa_ponta_total": 3.7073954,
      "tarifa_fp_total": 0.4553654,
      "beneficio_isencao_valor": 18807.49,
      "demanda_complemento_valor": 2406.61,
      "energia_nf": {
        "fornecedor": "ENEL (fornecimento livre)",
        "total": 24536.89,
        "mwh": 100.423,
        "preco_kwh": 0.2443354
      },
      "total_gasto_energia": 83503.61,
      "fonte": "DANF3E Energisa RO + NF ENEL fornecimento",
      "conciliada": true,
      "prova": {
        "soma_itens": 58966.72,
        "total": 58966.72,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 58966.72,
      "total": 58966.72,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-jvb-2026-06",
    "sourceFile": "fatura-jvb-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "JVB Servicos de Lavanderia LTDA (Novo Aleixo)",
    "uc": "0000793239002-74",
    "referencia": "06/2026",
    "total": 5650.75,
    "expected": {
      "cliente": "JVB Servicos de Lavanderia LTDA (Novo Aleixo)",
      "cnpj": "",
      "uc": "0000793239002-74",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM (ex-Amazonas Energia)",
      "localidade": "Manaus/AM",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / lavanderia industrial",
      "referencia": "06/2026",
      "vencimento": "10/08/2026",
      "total": 5650.75,
      "apelido": "JVB Lavanderia",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "JVB Lavanderia",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 3949.58,
          "kwh": 2188,
          "tarifa": 1.80511
        },
        {
          "nome": "Demanda",
          "valor": 1763.58,
          "kw": 78,
          "tarifa": 22.61
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 108.22
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 11389.5,
          "kwh": 21897,
          "tarifa": 0.52014
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 1086.49
        },
        {
          "nome": "Demanda de ultrapassagem",
          "valor": 587.86,
          "kw": 13,
          "tarifa": 45.22
        },
        {
          "nome": "COSIP",
          "valor": 2026.49
        },
        {
          "nome": "Encargos (Total de Encargos)",
          "valor": 78.11
        },
        {
          "nome": "Devolucoes (Total de Devolucoes)",
          "valor": -15339.08
        }
      ],
      "consumo_ponta_kwh": 2188,
      "consumo_fp_kwh": 21897,
      "demanda_contratada_kw": 65,
      "demanda_registrada_fp_kw": 78,
      "demanda_ref_potencia_kw": 78,
      "ultrapassagem_valor": 587.86,
      "ultrapassagem_kw": 13,
      "tarifa_ponta_total": 1.80511,
      "tarifa_fp_total": 0.52014,
      "fonte": "Fatura Ambar 06/2026 (deal 2233)",
      "conciliada": true,
      "prova": {
        "soma_itens": 5650.75,
        "total": 5650.75,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 5650.75,
      "total": 5650.75,
      "diferenca": 0.0,
      "itensCount": 9,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-laranjeiras-2026-06",
    "sourceFile": "fatura-laranjeiras-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254351",
    "referencia": "06/2026",
    "total": 59024.73,
    "expected": {
      "consumo_ponta_kwh": 13889,
      "consumo_fp_kwh": 114609,
      "demanda_complemento_valor": 1346.12,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 105,
      "reativo_fp_valor": 36.89,
      "total": 59024.73,
      "demanda_contratada_kw": 444,
      "demanda_registrada_ponta_kw": 282,
      "demanda_registrada_fp_kw": 325,
      "classe": "comercial",
      "uc": "118254351",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Laranjeiras",
      "nome_analise": "Mercantil Nova Era (loja Laranjeiras)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 12909.58,
          "kwh": 13889,
          "tarifa": 0.929483
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 33359.81,
          "kwh": 114609,
          "tarifa": 0.291075
        },
        {
          "nome": "Demanda",
          "valor": 5941.62,
          "kw": 444,
          "detalhe": "325 kW a 14,140000 + 119 kW a 11,312000"
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 36.89
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -1969.08
        }
      ],
      "demanda_ref_potencia_kw": 282,
      "tarifa_ponta_total": 1.095233,
      "tarifa_fp_total": 0.456825,
      "energia_nf": {
        "fornecedor": "TRADENER",
        "total": 21330.04,
        "mwh": 128.688,
        "preco_kwh": 0.16575
      },
      "total_gasto_energia": 80354.77,
      "fonte": "NF3e Ambar Energia AM + TRADENER LARANJEIRAS.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 59024.73,
        "total": 59024.73,
        "diferenca": -0.0
      }
    },
    "checks": {
      "somaItens": 59024.73,
      "total": 59024.73,
      "diferenca": -0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-amq",
    "sourceFile": "fatura-ml-amq_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Am Produtos Quimicos",
    "uc": "3531002-1",
    "referencia": "07/2026",
    "total": 86186.2,
    "expected": {
      "cliente": "Am Produtos Quimicos",
      "cnpj": "",
      "uc": "3531002-1",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Eletron (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 86186.2,
      "apelido": "Am Produtos Quimicos",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Am Produtos Quimicos",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 3163.94,
          "kwh": 4275,
          "tarifa": 0.740105
        },
        {
          "nome": "Demanda",
          "valor": 7917.0,
          "kw": 700,
          "detalhe": "586 kW a 11.31 + 114 kW a 11.31",
          "tarifa": 11.31
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 106.25,
          "kwh": 378,
          "tarifa": 0.28111
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 28925.95,
          "kwh": 126050,
          "tarifa": 0.22948
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 464.95,
          "kwh": 1654,
          "tarifa": 0.28111
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolução Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -280.59
        },
        {
          "nome": "Energia mercado livre (NF ELETRON)",
          "valor": 37142.79,
          "kwh": 131235,
          "tarifa": 0.283025
        }
      ],
      "consumo_ponta_kwh": 4275,
      "consumo_fp_kwh": 126050,
      "demanda_contratada_kw": 700.0,
      "demanda_registrada_fp_kw": 700,
      "demanda_ref_potencia_kw": 700,
      "tarifa_ponta_total": 1.02313,
      "tarifa_fp_total": 0.512505,
      "preco_energia_acl_mwh": 283.03,
      "energia_nf": {
        "fornecedor": "Eletron",
        "preco_kwh": 0.283025,
        "total": 37142.79,
        "mwh": 131.235
      },
      "total_gasto_energia": 86186.2,
      "fonte": "Fatura distribuidora (deal 2399) + NF ELETRON (deal 2399)",
      "conciliada": true,
      "prova": {
        "soma_itens": 86186.2,
        "total": 86186.2,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 86186.2,
      "total": 86186.2,
      "diferenca": 0.0,
      "itensCount": 8,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-bac",
    "sourceFile": "fatura-ml-bac_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Barateiro 03 Unidades Acl",
    "uc": "7168002-1",
    "referencia": "07/2026",
    "total": 65248.43,
    "expected": {
      "cliente": "Barateiro 03 Unidades Acl",
      "cnpj": "",
      "uc": "7168002-1",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Comerc (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 65248.43,
      "apelido": "Barateiro 03 Unidades Acl",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Barateiro 03 Unidades Acl",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 2140.64,
          "kwh": 2304,
          "tarifa": 0.9291
        },
        {
          "nome": "Demanda",
          "valor": 2184.68,
          "kw": 160,
          "detalhe": "133 kW a 14.13125 + 27 kW a 11.305"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 52.0,
          "kwh": 148,
          "tarifa": 0.351387
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 14191.36,
          "kwh": 48755,
          "tarifa": 0.291075
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 351.73,
          "kwh": 1001,
          "tarifa": 0.351387
        },
        {
          "nome": "COSIP",
          "valor": 6399.45
        },
        {
          "nome": "Disponibilizacao Dados De Medicao",
          "valor": 88.06
        },
        {
          "nome": "Energia mercado livre (NF COMERC)",
          "valor": 39840.51,
          "kwh": 164406,
          "tarifa": 0.24233
        }
      ],
      "consumo_ponta_kwh": 2304,
      "consumo_fp_kwh": 48755,
      "demanda_contratada_kw": 160.0,
      "demanda_registrada_fp_kw": 160,
      "demanda_ref_potencia_kw": 160,
      "tarifa_ponta_total": 1.17143,
      "tarifa_fp_total": 0.533405,
      "preco_energia_acl_mwh": 242.33,
      "energia_nf": {
        "fornecedor": "Comerc",
        "preco_kwh": 0.24233002445166235,
        "total": 39840.51,
        "mwh": 164.406
      },
      "total_gasto_energia": 65248.43,
      "fonte": "Fatura distribuidora (deal 2251) + NF COMERC (deal 2251)",
      "conciliada": true,
      "prova": {
        "soma_itens": 65248.43,
        "total": 65248.43,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 65248.43,
      "total": 65248.43,
      "diferenca": 0.0,
      "itensCount": 8,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-cam",
    "sourceFile": "fatura-ml-cam_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Colegio Adventista Manaus Centro",
    "uc": "0624314-2",
    "referencia": "06/2026",
    "total": 11223.49,
    "expected": {
      "cliente": "Colegio Adventista Manaus Centro",
      "cnpj": "",
      "uc": "0624314-2",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Fornecedor Acl (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "06/2026",
      "vencimento": "conferir",
      "total": 11223.49,
      "apelido": "Colegio Adventista Manaus Centro",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Colegio Adventista Manaus Centro",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 248.0,
          "kwh": 285,
          "tarifa": 0.870192
        },
        {
          "nome": "Demanda",
          "valor": 1396.41,
          "kw": 100,
          "detalhe": "88 kW a 14.3075 + 12 kW a 11.446"
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 3756.99,
          "kwh": 16623,
          "tarifa": 0.226012
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 0.84,
          "kwh": 2,
          "tarifa": 0.420006
        },
        {
          "nome": "COSIP",
          "valor": 1279.89
        },
        {
          "nome": "Energia mercado livre (NF fornecedor ACL)",
          "valor": 4541.36,
          "kwh": 17040,
          "tarifa": 0.266512
        }
      ],
      "consumo_ponta_kwh": 285,
      "consumo_fp_kwh": 16623,
      "demanda_contratada_kw": 100.0,
      "demanda_registrada_fp_kw": 100,
      "demanda_ref_potencia_kw": 100,
      "tarifa_ponta_total": 1.136704,
      "tarifa_fp_total": 0.492524,
      "preco_energia_acl_mwh": 266.51,
      "energia_nf": {
        "fornecedor": "Fornecedor Acl",
        "preco_kwh": 0.266512,
        "total": 4541.36,
        "mwh": 17.04
      },
      "total_gasto_energia": 11223.49,
      "fonte": "Fatura distribuidora (deal 2111) + NF fornecedor ACL (deal 2111)",
      "conciliada": true,
      "prova": {
        "soma_itens": 11223.49,
        "total": 11223.49,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 11223.49,
      "total": 11223.49,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-ccn",
    "sourceFile": "fatura-ml-ccn_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Cacn",
    "uc": "0107117-3",
    "referencia": "06/2026",
    "total": 23246.53,
    "expected": {
      "cliente": "Cacn",
      "cnpj": "",
      "uc": "0107117-3",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Fornecedor Acl (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "06/2026",
      "vencimento": "conferir",
      "total": 23246.53,
      "apelido": "Cacn",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Cacn",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 796.22,
          "kwh": 915,
          "tarifa": 0.870192
        },
        {
          "nome": "Demanda",
          "valor": 2638.29,
          "kw": 185,
          "detalhe": "182 kW a 14.3075 + 3 kW a 11.446"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 10.5,
          "kwh": 25,
          "tarifa": 0.420006
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 7658.41,
          "kwh": 33885,
          "tarifa": 0.226012
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 120.96,
          "kwh": 288,
          "tarifa": 0.420006
        },
        {
          "nome": "COSIP",
          "valor": 2666.44
        },
        {
          "nome": "Energia mercado livre (NF fornecedor ACL)",
          "valor": 9355.71,
          "kwh": 35090,
          "tarifa": 0.26662
        }
      ],
      "consumo_ponta_kwh": 915,
      "consumo_fp_kwh": 33885,
      "demanda_contratada_kw": 185.0,
      "demanda_registrada_fp_kw": 185,
      "demanda_ref_potencia_kw": 185,
      "tarifa_ponta_total": 1.136812,
      "tarifa_fp_total": 0.492632,
      "preco_energia_acl_mwh": 266.62,
      "energia_nf": {
        "fornecedor": "Fornecedor Acl",
        "preco_kwh": 0.26662,
        "total": 9355.71,
        "mwh": 35.09
      },
      "total_gasto_energia": 23246.53,
      "fonte": "Fatura distribuidora (deal 2113) + NF fornecedor ACL (deal 2113)",
      "conciliada": true,
      "prova": {
        "soma_itens": 23246.53,
        "total": 23246.53,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 23246.53,
      "total": 23246.53,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-eah",
    "sourceFile": "fatura-ml-eah_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Eah Hotelaria Da Vinci",
    "uc": "3236002-5",
    "referencia": "07/2026",
    "total": 49824.39,
    "expected": {
      "cliente": "Eah Hotelaria Da Vinci",
      "cnpj": "",
      "uc": "3236002-5",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Thopen (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 49824.39,
      "apelido": "Eah Hotelaria Da Vinci",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Eah Hotelaria Da Vinci",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 5479.34,
          "kwh": 5891,
          "tarifa": 0.930121
        },
        {
          "nome": "Demanda",
          "valor": 2873.46,
          "kw": 215,
          "detalhe": "155 kW a 14.155 + 60 kW a 11.324"
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 16487.65,
          "kwh": 56644,
          "tarifa": 0.291075
        },
        {
          "nome": "COSIP",
          "valor": 6399.45
        },
        {
          "nome": "Energia mercado livre (NF THOPEN)",
          "valor": 18584.49,
          "kwh": 63376,
          "tarifa": 0.293242
        }
      ],
      "consumo_ponta_kwh": 5891,
      "consumo_fp_kwh": 56644,
      "demanda_contratada_kw": 215.0,
      "demanda_registrada_fp_kw": 215,
      "demanda_ref_potencia_kw": 215,
      "tarifa_ponta_total": 1.2233627634435749,
      "tarifa_fp_total": 0.5843167634435749,
      "preco_energia_acl_mwh": 293.24,
      "energia_nf": {
        "fornecedor": "Thopen",
        "preco_kwh": 0.2932417634435749,
        "total": 18584.49,
        "mwh": 63.376
      },
      "total_gasto_energia": 49824.39,
      "fonte": "Fatura distribuidora (deal 2379) + NF THOPEN (deal 2379)",
      "conciliada": true,
      "prova": {
        "soma_itens": 49824.39,
        "total": 49824.39,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 49824.39,
      "total": 49824.39,
      "diferenca": 0.0,
      "itensCount": 5,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-ebc",
    "sourceFile": "fatura-ml-ebc_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Ester Barateiro Compensa",
    "uc": "1703002-1",
    "referencia": "07/2026",
    "total": 20983.46,
    "expected": {
      "cliente": "Ester Barateiro Compensa",
      "cnpj": "",
      "uc": "1703002-1",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Axia (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 20983.46,
      "apelido": "Ester Barateiro Compensa",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Ester Barateiro Compensa",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 767.43,
          "kwh": 826,
          "tarifa": 0.9291
        },
        {
          "nome": "Demanda",
          "valor": 1215.28,
          "kw": 90,
          "detalhe": "70 kW a 14.13125 + 20 kW a 11.305"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 23.54,
          "kwh": 67,
          "tarifa": 0.351387
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 7820.02,
          "kwh": 26866,
          "tarifa": 0.291075
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 73.08,
          "kwh": 208,
          "tarifa": 0.351387
        },
        {
          "nome": "COSIP",
          "valor": 2026.49
        },
        {
          "nome": "Energia mercado livre (NF AXIA)",
          "valor": 9057.62,
          "kwh": 27856,
          "tarifa": 0.325159
        }
      ],
      "consumo_ponta_kwh": 826,
      "consumo_fp_kwh": 26866,
      "demanda_contratada_kw": 90.0,
      "demanda_registrada_fp_kw": 90,
      "demanda_ref_potencia_kw": 90,
      "tarifa_ponta_total": 1.254259,
      "tarifa_fp_total": 0.616234,
      "preco_energia_acl_mwh": 325.16,
      "energia_nf": {
        "fornecedor": "Axia",
        "preco_kwh": 0.325159,
        "total": 9057.62,
        "mwh": 27.856
      },
      "total_gasto_energia": 20983.46,
      "fonte": "Fatura distribuidora (deal 2243) + NF AXIA (deal 2243)",
      "conciliada": true,
      "prova": {
        "soma_itens": 20983.46,
        "total": 20983.46,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 20983.46,
      "total": 20983.46,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-enh",
    "sourceFile": "fatura-ml-enh_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Empresa Nacional De Hotelaria",
    "uc": "3311002-0",
    "referencia": "07/2026",
    "total": 13985.74,
    "expected": {
      "cliente": "Empresa Nacional De Hotelaria",
      "cnpj": "",
      "uc": "3311002-0",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Thopen (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 13985.74,
      "apelido": "Empresa Nacional De Hotelaria",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Empresa Nacional De Hotelaria",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 1594.33,
          "kwh": 1716,
          "tarifa": 0.9291
        },
        {
          "nome": "Demanda",
          "valor": 1068.32,
          "kw": 80,
          "detalhe": "58 kW a 14.13125 + 22 kW a 11.305"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 0.35,
          "kwh": 1,
          "tarifa": 0.351387
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 4527.96,
          "kwh": 15556,
          "tarifa": 0.291075
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 128.6,
          "kwh": 366,
          "tarifa": 0.351387
        },
        {
          "nome": "COSIP",
          "valor": 1279.89
        },
        {
          "nome": "Energia mercado livre (NF THOPEN)",
          "valor": 5386.29,
          "kwh": 17406,
          "tarifa": 0.30945
        }
      ],
      "consumo_ponta_kwh": 1716,
      "consumo_fp_kwh": 15556,
      "demanda_contratada_kw": 80.0,
      "demanda_registrada_fp_kw": 80,
      "demanda_ref_potencia_kw": 80,
      "tarifa_ponta_total": 1.23855,
      "tarifa_fp_total": 0.600525,
      "preco_energia_acl_mwh": 309.45,
      "energia_nf": {
        "fornecedor": "Thopen",
        "preco_kwh": 0.30945,
        "total": 5386.29,
        "mwh": 17.406
      },
      "total_gasto_energia": 13985.74,
      "fonte": "Fatura distribuidora (deal 2277) + NF THOPEN (deal 2277)",
      "conciliada": true,
      "prova": {
        "soma_itens": 13985.74,
        "total": 13985.74,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 13985.74,
      "total": 13985.74,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-gnt",
    "sourceFile": "fatura-ml-gnt_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Gn Transportes",
    "uc": "0571950-0",
    "referencia": "07/2026",
    "total": 18560.01,
    "expected": {
      "cliente": "Gn Transportes",
      "cnpj": "",
      "uc": "0571950-0",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Comerc (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 18560.01,
      "apelido": "Gn Transportes",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Gn Transportes",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 3066.95,
          "kwh": 3301,
          "tarifa": 0.9291
        },
        {
          "nome": "Demanda",
          "valor": 1235.06,
          "kw": 90,
          "detalhe": "77 kW a 14.13125 + 13 kW a 11.305"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 155.66,
          "kwh": 443,
          "tarifa": 0.351387
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 10197.23,
          "kwh": 35033,
          "tarifa": 0.291075
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 873.19,
          "kwh": 2485,
          "tarifa": 0.351387
        },
        {
          "nome": "COSIP",
          "valor": 2666.44
        },
        {
          "nome": "Correcao monetaria ilum. publica (multa)",
          "valor": 1.49
        },
        {
          "nome": "Atualizacao monetaria IPCA/IGPM",
          "valor": 8.01
        },
        {
          "nome": "Multa por atraso ilum. publica",
          "valor": 53.35
        },
        {
          "nome": "Juros de mora ilum. publica",
          "valor": 2.66
        },
        {
          "nome": "Multa por atraso",
          "valor": 285.69
        },
        {
          "nome": "Juros de mora",
          "valor": 14.28
        },
        {
          "nome": "Energia mercado livre (NF COMERC)",
          "valor": 0.0,
          "kwh": 38636,
          "tarifa": 0.0
        }
      ],
      "consumo_ponta_kwh": 3301,
      "consumo_fp_kwh": 35033,
      "demanda_contratada_kw": 90.0,
      "demanda_registrada_fp_kw": 90,
      "demanda_ref_potencia_kw": 90,
      "tarifa_ponta_total": 0.9291,
      "tarifa_fp_total": 0.291075,
      "preco_energia_acl_mwh": 0.0,
      "energia_nf": {
        "fornecedor": "Comerc",
        "preco_kwh": 0.0,
        "total": 0.0,
        "mwh": 38.636
      },
      "total_gasto_energia": 18560.01,
      "fonte": "Fatura distribuidora (deal 2525) + NF COMERC (deal 2525)",
      "conciliada": true,
      "prova": {
        "soma_itens": 18560.01,
        "total": 18560.01,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 18560.01,
      "total": 18560.01,
      "diferenca": 0.0,
      "itensCount": 13,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-mirante",
    "sourceFile": "fatura-ml-mirante_conciliada.json",
    "distribuidora": "Energisa Rondonia",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Instituto Adventista da Amazonia Ocidental - Mirante da Serra",
    "uc": "conferir",
    "referencia": "07/2026",
    "total": 47689.4,
    "expected": {
      "cliente": "Instituto Adventista da Amazonia Ocidental - Mirante da Serra",
      "cnpj": "",
      "uc": "conferir",
      "distribuidora": "Energisa Rondonia",
      "distribuidora_display": "Energisa Rondonia + Comerc (ACL, com APCEI)",
      "localidade": "Mirante da Serra/RO",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Educacao / mercado livre (A4 verde, APCEI)",
      "referencia": "07/2026",
      "vencimento": "17/07/2026",
      "total": 47689.4,
      "apelido": "Instituto Adventista Mirante da Serra",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Instituto Adventista Mirante da Serra",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 14940.11,
          "kwh": 4314.13,
          "tarifa": 3.4630643953705613,
          "detalhe": "TUSD em kWh Ponta (tarifa cheia; APCEI lancado como credito a parte)"
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 9448.05,
          "kwh": 44769.77,
          "tarifa": 0.2110363756615234
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 18.35
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 362.71
        },
        {
          "nome": "Demanda",
          "valor": 10496.91,
          "kw": 210.67
        },
        {
          "nome": "Demanda nao consumida (encargo TUSD kW)",
          "valor": 574.77
        },
        {
          "nome": "Adicional Conta Covid Escassez Hidrica",
          "valor": 251.28
        },
        {
          "nome": "Credito TUSD kW-APCEI",
          "valor": -3834.19
        },
        {
          "nome": "Credito TUSD kW-APCEI nao consumida",
          "valor": -260.81
        },
        {
          "nome": "Credito TUSD kWh Ponta-APCEI",
          "valor": -5124.6
        },
        {
          "nome": "COSIP (Contrib Ilum Pub)",
          "valor": 162.96
        },
        {
          "nome": "Energia mercado livre (NF COMERC)",
          "valor": 20653.86,
          "kwh": 52149,
          "tarifa": 0.396055
        }
      ],
      "consumo_ponta_kwh": 4314.13,
      "consumo_fp_kwh": 44769.77,
      "demanda_contratada_kw": 225,
      "demanda_registrada_ponta_kw": 147.84,
      "demanda_registrada_fp_kw": 210.67,
      "demanda_ref_potencia_kw": 210.67,
      "tarifa_ponta_total": 3.8591191615213982,
      "tarifa_fp_total": 0.6070911418123605,
      "preco_energia_acl_mwh": 396.05,
      "energia_nf": {
        "fornecedor": "Comerc",
        "preco_kwh": 0.39605476615083707,
        "total": 20653.86,
        "mwh": 52.149
      },
      "total_gasto_energia": 47689.4,
      "fonte": "DANF3E Energisa Rondonia (deal 2313) + NF COMERC",
      "conciliada": true,
      "prova": {
        "soma_itens": 47689.4,
        "total": 47689.4,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 47689.4,
      "total": 47689.4,
      "diferenca": 0.0,
      "itensCount": 12,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-onc2",
    "sourceFile": "fatura-ml-onc2_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Oncoclin Cachoeirinha",
    "uc": "1737002-2",
    "referencia": "07/2026",
    "total": 13049.68,
    "expected": {
      "cliente": "Oncoclin Cachoeirinha",
      "cnpj": "",
      "uc": "1737002-2",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Thopen (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 13049.68,
      "apelido": "Oncoclin Cachoeirinha",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Oncoclin Cachoeirinha",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 1439.82,
          "kwh": 1548,
          "tarifa": 0.930121
        },
        {
          "nome": "Demanda",
          "valor": 1874.12,
          "kw": 150,
          "detalhe": "62 kW a 14.155 + 88 kW a 11.324"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 22.13,
          "kwh": 63,
          "tarifa": 0.351387
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 4283.45,
          "kwh": 14716,
          "tarifa": 0.291075
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 253.35,
          "kwh": 721,
          "tarifa": 0.351387
        },
        {
          "nome": "COSIP",
          "valor": 1279.89
        },
        {
          "nome": "Devolução Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -636.81
        },
        {
          "nome": "Energia mercado livre (NF THOPEN)",
          "valor": 4533.73,
          "kwh": 16361,
          "tarifa": 0.277106
        }
      ],
      "consumo_ponta_kwh": 1548,
      "consumo_fp_kwh": 14716,
      "demanda_contratada_kw": 150.0,
      "demanda_registrada_fp_kw": 150,
      "demanda_ref_potencia_kw": 150,
      "tarifa_ponta_total": 1.2072269226208667,
      "tarifa_fp_total": 0.5681809226208666,
      "preco_energia_acl_mwh": 277.11,
      "energia_nf": {
        "fornecedor": "Thopen",
        "preco_kwh": 0.27710592262086664,
        "total": 4533.73,
        "mwh": 16.361
      },
      "total_gasto_energia": 13049.68,
      "fonte": "Fatura distribuidora (deal 2267) + NF THOPEN (deal 2267)",
      "conciliada": true,
      "prova": {
        "soma_itens": 13049.68,
        "total": 13049.68,
        "diferenca": -0.0
      }
    },
    "checks": {
      "somaItens": 13049.68,
      "total": 13049.68,
      "diferenca": -0.0,
      "itensCount": 8,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-onc",
    "sourceFile": "fatura-ml-onc_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Oncoclin",
    "uc": "9364002-5",
    "referencia": "07/2026",
    "total": 15936.0,
    "expected": {
      "cliente": "Oncoclin",
      "cnpj": "",
      "uc": "9364002-5",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Thopen (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 15936.0,
      "apelido": "Oncoclin",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Oncoclin",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 2217.4,
          "kwh": 2384,
          "tarifa": 0.930121
        },
        {
          "nome": "Demanda",
          "valor": 1307.92,
          "kw": 100,
          "detalhe": "62 kW a 14.155 + 38 kW a 11.324"
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 5404.68,
          "kwh": 18568,
          "tarifa": 0.291075
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 6.67,
          "kwh": 19,
          "tarifa": 0.351387
        },
        {
          "nome": "COSIP",
          "valor": 2026.49
        },
        {
          "nome": "Devolução Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -605.69
        },
        {
          "nome": "Energia mercado livre (NF THOPEN)",
          "valor": 5578.53,
          "kwh": 21093,
          "tarifa": 0.264473
        }
      ],
      "consumo_ponta_kwh": 2384,
      "consumo_fp_kwh": 18568,
      "demanda_contratada_kw": 100.0,
      "demanda_registrada_fp_kw": 100,
      "demanda_ref_potencia_kw": 100,
      "tarifa_ponta_total": 1.194594047930593,
      "tarifa_fp_total": 0.555548047930593,
      "preco_energia_acl_mwh": 264.47,
      "energia_nf": {
        "fornecedor": "Thopen",
        "preco_kwh": 0.26447304793059306,
        "total": 5578.53,
        "mwh": 21.093
      },
      "total_gasto_energia": 15936.0,
      "fonte": "Fatura distribuidora (deal 2231) + NF THOPEN (deal 2231)",
      "conciliada": true,
      "prova": {
        "soma_itens": 15936.0,
        "total": 15936.0,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 15936.0,
      "total": 15936.0,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-ptf",
    "sourceFile": "fatura-ml-ptf_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Porteira Fornecimento",
    "uc": "9561002-4",
    "referencia": "08/2026",
    "total": 48771.59,
    "expected": {
      "cliente": "Porteira Fornecimento",
      "cnpj": "",
      "uc": "9561002-4",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Thopen (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "08/2026",
      "vencimento": "conferir",
      "total": 48771.59,
      "apelido": "Porteira Fornecimento",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Porteira Fornecimento",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 5875.73,
          "kwh": 6346,
          "tarifa": 0.925896
        },
        {
          "nome": "Demanda",
          "valor": 2403.51,
          "kw": 170,
          "detalhe": "169 kW a 14.155 + 1 kW a 11.324"
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 16269.27,
          "kwh": 56717,
          "tarifa": 0.28685
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 18.62,
          "kwh": 53,
          "tarifa": 0.351387
        },
        {
          "nome": "COSIP",
          "valor": 6399.45
        },
        {
          "nome": "Energia mercado livre (NF THOPEN)",
          "valor": 17805.01,
          "kwh": 63660,
          "tarifa": 0.279689
        }
      ],
      "consumo_ponta_kwh": 6346,
      "consumo_fp_kwh": 56717,
      "demanda_contratada_kw": 170.0,
      "demanda_registrada_fp_kw": 170,
      "demanda_ref_potencia_kw": 170,
      "tarifa_ponta_total": 1.2055851297518065,
      "tarifa_fp_total": 0.5665391297518064,
      "preco_energia_acl_mwh": 279.69,
      "energia_nf": {
        "fornecedor": "Thopen",
        "preco_kwh": 0.27968912975180643,
        "total": 17805.01,
        "mwh": 63.66
      },
      "total_gasto_energia": 48771.59,
      "fonte": "Fatura distribuidora (deal 2529) + NF THOPEN (deal 2529)",
      "conciliada": true,
      "prova": {
        "soma_itens": 48771.59,
        "total": 48771.59,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 48771.59,
      "total": 48771.59,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-riobranco",
    "sourceFile": "fatura-ml-riobranco_conciliada.json",
    "distribuidora": "Energisa Acre",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Colegio Adventista de Rio Branco",
    "uc": "conferir",
    "referencia": "06/2026",
    "total": 17940.66,
    "expected": {
      "cliente": "Colegio Adventista de Rio Branco",
      "cnpj": "",
      "uc": "conferir",
      "distribuidora": "Energisa Acre",
      "distribuidora_display": "Energisa Acre + Comerc (ACL, com APCEI)",
      "localidade": "Rio Branco/AC",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Educacao / mercado livre (A4 verde, APCEI)",
      "referencia": "06/2026",
      "vencimento": "conferir",
      "total": 17940.66,
      "apelido": "Colegio Adventista de Rio Branco",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Colegio Adventista de Rio Branco",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 3061.16,
          "kwh": 858.9,
          "tarifa": 3.5640470369076724,
          "detalhe": "TUSD em kWh Ponta (tarifa cheia; APCEI lancado como credito a parte)"
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 2884.98,
          "kwh": 15519.0,
          "tarifa": 0.1858998646820027
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 4.23
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 53.27
        },
        {
          "nome": "Demanda",
          "valor": 7577.11,
          "kw": 124.32
        },
        {
          "nome": "Demanda nao consumida (encargo TUSD kW)",
          "valor": 2174.64
        },
        {
          "nome": "Adicional Conta Covid Escassez Hidrica",
          "valor": 357.82
        },
        {
          "nome": "Credito TUSD kW-APCEI",
          "valor": -2927.11
        },
        {
          "nome": "Credito TUSD kW-APCEI nao consumida",
          "valor": -840.09
        },
        {
          "nome": "Credito TUSD kWh Ponta-APCEI",
          "valor": -1120.88
        },
        {
          "nome": "COSIP (Contrib Ilum Pub)",
          "valor": 112.49
        },
        {
          "nome": "Energia mercado livre (NF COMERC)",
          "valor": 6603.04,
          "kwh": 16441,
          "tarifa": 0.40162
        }
      ],
      "consumo_ponta_kwh": 858.9,
      "consumo_fp_kwh": 15519.0,
      "demanda_contratada_kw": 160,
      "demanda_registrada_ponta_kw": 47.6,
      "demanda_registrada_fp_kw": 124.32,
      "demanda_ref_potencia_kw": 124.32,
      "tarifa_ponta_total": 3.9656673763030863,
      "tarifa_fp_total": 0.5875202040774166,
      "preco_energia_acl_mwh": 401.62,
      "energia_nf": {
        "fornecedor": "Comerc",
        "preco_kwh": 0.4016203393954139,
        "total": 6603.04,
        "mwh": 16.441
      },
      "total_gasto_energia": 17940.66,
      "fonte": "DANF3E Energisa Acre (deal 2377) + NF COMERC",
      "conciliada": true,
      "prova": {
        "soma_itens": 17940.66,
        "total": 17940.66,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 17940.66,
      "total": 17940.66,
      "diferenca": 0.0,
      "itensCount": 12,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-tbv",
    "sourceFile": "fatura-ml-tbv_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Terra Boa Adao E Eva",
    "uc": "5543002-2",
    "referencia": "07/2026",
    "total": 38141.42,
    "expected": {
      "cliente": "Terra Boa Adao E Eva",
      "cnpj": "",
      "uc": "5543002-2",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM + Matrix (ACL)",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / mercado livre (A4 verde)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 38141.42,
      "apelido": "Terra Boa Adao E Eva",
      "leitura_anterior": "conferir",
      "leitura_atual": "conferir",
      "nome_analise": "Terra Boa Adao E Eva",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 3180.3,
          "kwh": 3423,
          "tarifa": 0.9291
        },
        {
          "nome": "Demanda",
          "valor": 1820.1,
          "kw": 130,
          "detalhe": "124 kW a 14.13125 + 6 kW a 11.305"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 0.7,
          "kwh": 2,
          "tarifa": 0.351387
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 14683.27,
          "kwh": 50445,
          "tarifa": 0.291075
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 3.86,
          "kwh": 11,
          "tarifa": 0.351387
        },
        {
          "nome": "COSIP",
          "valor": 6399.45
        },
        {
          "nome": "Energia mercado livre (NF MATRIX)",
          "valor": 12053.74,
          "kwh": 52655,
          "tarifa": 0.228919
        }
      ],
      "consumo_ponta_kwh": 3423,
      "consumo_fp_kwh": 50445,
      "demanda_contratada_kw": 130.0,
      "demanda_registrada_fp_kw": 130,
      "demanda_ref_potencia_kw": 130,
      "tarifa_ponta_total": 1.1580191909600228,
      "tarifa_fp_total": 0.5199941909600228,
      "preco_energia_acl_mwh": 228.92,
      "energia_nf": {
        "fornecedor": "Matrix",
        "preco_kwh": 0.22891919096002278,
        "total": 12053.74,
        "mwh": 52.655
      },
      "total_gasto_energia": 38141.42,
      "fonte": "Fatura distribuidora (deal 2289) + NF MATRIX (deal 2289)",
      "conciliada": true,
      "prova": {
        "soma_itens": 38141.42,
        "total": 38141.42,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 38141.42,
      "total": 38141.42,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ml-vilhena",
    "sourceFile": "fatura-ml-vilhena_conciliada.json",
    "distribuidora": "Energisa Rondonia",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Escola Adventista de Vilhena",
    "uc": "conferir",
    "referencia": "07/2026",
    "total": 6664.21,
    "expected": {
      "cliente": "Escola Adventista de Vilhena",
      "cnpj": "",
      "uc": "conferir",
      "distribuidora": "Energisa Rondonia",
      "distribuidora_display": "Energisa Rondonia + Comerc (ACL, com APCEI)",
      "localidade": "Vilhena/RO",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Educacao / mercado livre (A4 verde, APCEI)",
      "referencia": "07/2026",
      "vencimento": "conferir",
      "total": 6664.21,
      "apelido": "Escola Adventista de Vilhena",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Escola Adventista de Vilhena",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 556.72,
          "kwh": 160.76,
          "tarifa": 3.463050510077134,
          "detalhe": "TUSD em kWh Ponta (tarifa cheia; APCEI lancado como credito a parte)"
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 1210.08,
          "kwh": 5733.99,
          "tarifa": 0.21103629409887356
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 0.09
        },
        {
          "nome": "Demanda",
          "valor": 2765.03,
          "kw": 55.49
        },
        {
          "nome": "Demanda de ultrapassagem",
          "valor": 547.44,
          "kw": 5.49
        },
        {
          "nome": "Adicional Conta Covid Escassez Hidrica",
          "valor": 30.17
        },
        {
          "nome": "Credito TUSD kW-APCEI",
          "valor": -1009.98
        },
        {
          "nome": "Credito TUSD kWh Ponta-APCEI",
          "valor": -190.95
        },
        {
          "nome": "COSIP (Contrib Ilum Pub)",
          "valor": 220.96
        },
        {
          "nome": "Juros de mora",
          "valor": 6.45
        },
        {
          "nome": "Atualizacao monetaria",
          "valor": 4.3
        },
        {
          "nome": "Multa por atraso",
          "valor": 96.72
        },
        {
          "nome": "Energia mercado livre (NF COMERC)",
          "valor": 2427.18,
          "kwh": 5912,
          "tarifa": 0.410551
        }
      ],
      "consumo_ponta_kwh": 160.76,
      "consumo_fp_kwh": 5733.99,
      "demanda_contratada_kw": 50,
      "demanda_registrada_ponta_kw": 0,
      "demanda_registrada_fp_kw": 55.49,
      "demanda_ref_potencia_kw": 55.49,
      "tarifa_ponta_total": 3.8736019309161054,
      "tarifa_fp_total": 0.6215877149378451,
      "preco_energia_acl_mwh": 410.55,
      "energia_nf": {
        "fornecedor": "Comerc",
        "preco_kwh": 0.41055142083897156,
        "total": 2427.18,
        "mwh": 5.912
      },
      "total_gasto_energia": 6664.21,
      "fonte": "DANF3E Energisa Rondonia (deal 2307) + NF COMERC",
      "ultrapassagem_valor": 547.44,
      "ultrapassagem_kw": 5.49,
      "conciliada": true,
      "prova": {
        "soma_itens": 6664.21,
        "total": 6664.21,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 6664.21,
      "total": 6664.21,
      "diferenca": 0.0,
      "itensCount": 13,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-norte-gelo-2026-06",
    "sourceFile": "fatura-norte-gelo-2026-06_conciliada.json",
    "distribuidora": "Roraima Energia",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Norte Gelo Ltda",
    "uc": "conferir na fatura",
    "referencia": "06/2026",
    "total": 23491.89,
    "expected": {
      "cliente": "Norte Gelo Ltda",
      "cnpj": "",
      "uc": "conferir na fatura",
      "distribuidora": "Roraima Energia",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "industrial",
      "classe_display": "Industrial / industrial",
      "referencia": "06/2026",
      "vencimento": "conferir",
      "total": 23491.89,
      "apelido": "Norte Gelo",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Norte Gelo (fabrica de gelo — Boa Vista/RR)",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 4770.59,
          "kwh": 1774,
          "tarifa": 2.689175
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 15035.6,
          "kwh": 24020,
          "tarifa": 0.625962
        },
        {
          "nome": "Demanda",
          "valor": 2781.08,
          "kw": 104,
          "detalhe": "86 kW com ICMS a 27,70 + 18 kW sem ICMS a 22,16"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 71.95
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 790.2
        },
        {
          "nome": "COSIP",
          "valor": 42.47
        }
      ],
      "consumo_ponta_kwh": 1774,
      "consumo_fp_kwh": 24020,
      "demanda_contratada_kw": 104,
      "demanda_registrada_ponta_kw": 86,
      "demanda_registrada_fp_kw": 86,
      "demanda_ref_potencia_kw": 86,
      "reativo_ponta_kwh": 167,
      "reativo_fp_kwh": 1834,
      "reativo_ponta_valor": 71.95,
      "reativo_fp_valor": 790.2,
      "tarifa_ponta_total": 2.689175,
      "tarifa_fp_total": 0.625962,
      "demanda_complemento_valor": 398.88,
      "nao_cobrados": [
        {
          "nome": "Adicional Bandeira Amarela",
          "valor": 485.47,
          "motivo": "bandeira Verde 0,00 na referencia — informativa"
        }
      ],
      "fonte": "roraima_energia.pdf (DM Dilkson 09/08)",
      "conciliada": true,
      "prova": {
        "soma_itens": 23491.89,
        "total": 23491.89,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 23491.89,
      "total": 23491.89,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 1,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-patio-adrianopolis-2026-06",
    "sourceFile": "fatura-patio-adrianopolis-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118253561",
    "referencia": "06/2026",
    "total": 110215.27,
    "expected": {
      "consumo_ponta_kwh": 22617,
      "consumo_fp_kwh": 249837,
      "demanda_complemento_valor": 633.08,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 0,
      "reativo_fp_valor": 0.0,
      "total": 110215.27,
      "demanda_contratada_kw": 640,
      "demanda_registrada_ponta_kw": 521,
      "demanda_registrada_fp_kw": 584,
      "classe": "comercial",
      "uc": "118253561",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Patio Adrianopolis",
      "nome_analise": "Mercantil Nova Era (loja Patio Adrianopolis)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 20917.89,
          "kwh": 22617,
          "tarifa": 0.924875
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 71665.74,
          "kwh": 249837,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 8885.73,
          "kw": 640,
          "detalhe": "584 kW a 14,131250 + 56 kW a 11,305000"
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "demanda_ref_potencia_kw": 521,
      "tarifa_ponta_total": 1.16555,
      "tarifa_fp_total": 0.527525,
      "energia_nf": {
        "fornecedor": "ENEL",
        "total": 66036.65,
        "mwh": 274.381,
        "preco_kwh": 0.240675
      },
      "total_gasto_energia": 176251.92,
      "fonte": "NF3e Ambar Energia AM + 2026_06_FORNECIMENTO_ENEL_NOVA ERA - Patio Adrianopolis.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 110215.27,
        "total": 110215.27,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 110215.27,
      "total": 110215.27,
      "diferenca": 0.0,
      "itensCount": 4,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-patio-djalma-2026-06",
    "sourceFile": "fatura-patio-djalma-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118253622",
    "referencia": "06/2026",
    "total": 83844.37,
    "expected": {
      "consumo_ponta_kwh": 16056,
      "consumo_fp_kwh": 188412,
      "demanda_complemento_valor": 826.79,
      "reativo_ponta_kwh": 4,
      "reativo_ponta_valor": 1.4,
      "reativo_fp_kwh": 4,
      "reativo_fp_valor": 1.4,
      "total": 83844.37,
      "demanda_contratada_kw": 480,
      "demanda_registrada_ponta_kw": 354,
      "demanda_registrada_fp_kw": 407,
      "classe": "comercial",
      "uc": "118253622",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Patio Djalma",
      "nome_analise": "Mercantil Nova Era (loja Patio Djalma)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 14868.22,
          "kwh": 16056,
          "tarifa": 0.926023
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 54045.98,
          "kwh": 188412,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 6588.89,
          "kw": 480,
          "detalhe": "407 kW a 14,157500 + 73 kW a 11,326000"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 1.4
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 1.4
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -407.43
        }
      ],
      "demanda_ref_potencia_kw": 354,
      "tarifa_ponta_total": 1.166698,
      "tarifa_fp_total": 0.527525,
      "energia_nf": {
        "fornecedor": "ENEL",
        "total": 49552.81,
        "mwh": 205.891,
        "preco_kwh": 0.240675
      },
      "total_gasto_energia": 133397.18,
      "fonte": "NF3e Ambar Energia AM + 2026_06_FORNECIMENTO_ENEL_NOVA ERA - Patio Djalma.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 83844.37,
        "total": 83844.37,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 83844.37,
      "total": 83844.37,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-patio-morada-2026-06",
    "sourceFile": "fatura-patio-morada-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118253493",
    "referencia": "06/2026",
    "total": 82092.92,
    "expected": {
      "consumo_ponta_kwh": 14490,
      "consumo_fp_kwh": 180406,
      "demanda_complemento_valor": null,
      "ultrapassagem_kw": 31,
      "ultrapassagem_valor": 1752.27,
      "tarifa_demanda_kw": 14.13125,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 0,
      "reativo_fp_valor": 0.0,
      "total": 82092.92,
      "demanda_contratada_kw": 425,
      "demanda_registrada_ponta_kw": 349,
      "demanda_registrada_fp_kw": 456,
      "classe": "comercial",
      "uc": "118253493",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Patio Morada",
      "nome_analise": "Mercantil Nova Era (loja Patio Morada)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 13401.43,
          "kwh": 14490,
          "tarifa": 0.924875
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 51749.46,
          "kwh": 180406,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 6443.85,
          "kw": 456,
          "detalhe": "456 kW a 14,131250"
        },
        {
          "nome": "Ultrapassagem de demanda",
          "valor": 1752.27,
          "kw": 31,
          "detalhe": "31 kW a 56,525000 (em dobro)"
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "demanda_ref_potencia_kw": 349,
      "tarifa_ponta_total": 1.16555,
      "tarifa_fp_total": 0.527525,
      "energia_nf": {
        "fornecedor": "ENEL",
        "total": 47268.09,
        "mwh": 196.398,
        "preco_kwh": 0.240675
      },
      "total_gasto_energia": 129361.01,
      "fonte": "NF3e Ambar Energia AM + 2026_06_FORNECIMENTO_ENEL_NOVA ERA - Morada do Sol.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 82092.92,
        "total": 82092.92,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 82092.92,
      "total": 82092.92,
      "diferenca": 0.0,
      "itensCount": 5,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ponta-negra-2026-06",
    "sourceFile": "fatura-ponta-negra-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "000147906",
    "referencia": "06/2026",
    "total": 138730.79,
    "expected": {
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "uc": "000147906",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "vencimento": "14/07/2026",
      "total": 138730.79,
      "apelido": "Ponta Negra",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Mercantil Nova Era (loja Ponta Negra)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 26099.03,
          "kwh": 28056,
          "tarifa": 0.930248
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 93630.38,
          "kwh": 321671,
          "tarifa": 0.291075
        },
        {
          "nome": "Demanda",
          "valor": 10167.91,
          "kw": 730,
          "detalhe": "671 kW medida a 14,157500 + 59 kW a 11,326000 (desconto demanda 49,91%)"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 51.65
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 762.5
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd-Ccee 04/26",
          "valor": -726.59
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "consumo_ponta_kwh": 28056,
      "consumo_fp_kwh": 321671,
      "demanda_contratada_kw": 730,
      "demanda_registrada_ponta_kw": 613,
      "demanda_registrada_fp_kw": 671,
      "demanda_ref_potencia_kw": 613,
      "reativo_ponta_kwh": 147,
      "reativo_fp_kwh": 2170,
      "reativo_ponta_valor": 51.65,
      "reativo_fp_valor": 762.5,
      "tarifa_ponta_total": 1.160523,
      "tarifa_fp_total": 0.52135,
      "demanda_complemento_valor": 668.23,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 80987.26,
        "mwh": 351.698,
        "preco_kwh": 0.230275
      },
      "total_gasto_energia": 219718.05,
      "fonte": "NF3e Ambar Energia AM + danfe ECOM A100010077712",
      "conciliada": true,
      "prova": {
        "soma_itens": 138730.79,
        "total": 138730.79,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 138730.79,
      "total": 138730.79,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ponte-2026-06",
    "sourceFile": "fatura-ponte-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118253107",
    "referencia": "06/2026",
    "total": 74626.81,
    "expected": {
      "consumo_ponta_kwh": 15733,
      "consumo_fp_kwh": 161683,
      "demanda_complemento_valor": null,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 2,
      "reativo_fp_valor": 0.7,
      "total": 74626.81,
      "demanda_contratada_kw": 360,
      "demanda_registrada_ponta_kw": 354,
      "demanda_registrada_fp_kw": 378,
      "classe": "comercial",
      "uc": "118253107",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Ponte",
      "nome_analise": "Mercantil Nova Era (loja Ponte)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 14569.11,
          "kwh": 15733,
          "tarifa": 0.926023
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 46378.76,
          "kwh": 161683,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 5351.53,
          "kw": 378,
          "detalhe": "378 kW a 14,157500"
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 0.7
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -419.2
        }
      ],
      "demanda_ref_potencia_kw": 354,
      "tarifa_ponta_total": 1.1720855,
      "tarifa_fp_total": 0.5329125,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 43891.89,
        "mwh": 178.377,
        "preco_kwh": 0.2460625
      },
      "total_gasto_energia": 118518.7,
      "fonte": "NF3e Ambar Energia AM + A100010077818-danfe ECOM PONTE.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 74626.81,
        "total": 74626.81,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 74626.81,
      "total": 74626.81,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-ppm-2026",
    "sourceFile": "fatura-ppm-2026_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "PPM Empreendimentos (Chateau Motel)",
    "uc": "118253991",
    "referencia": "06/2026",
    "total": 20403.78,
    "expected": {
      "modalidade": "verde",
      "consumo_ponta_kwh": 1835,
      "tarifa_p": 1.82396,
      "consumo_fp_kwh": 23601,
      "tarifa_fp": 0.53899,
      "demanda_complemento_valor": null,
      "reativo_ponta_kwh": 1,
      "reativo_ponta_valor": 0.28,
      "reativo_fp_kwh": 172,
      "reativo_fp_valor": 48.35,
      "total": 20403.78,
      "demanda_contratada_kw": 100,
      "demanda_contratada_fp_kw": 100,
      "demanda_registrada_ponta_kw": 70,
      "demanda_registrada_fp_kw": 79,
      "classe": "comercial",
      "uc": "118253991",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "vencimento": "14/07/2026",
      "referencia": "06/2026",
      "distribuidora": "Ambar Energia AM",
      "cliente": "PPM Empreendimentos (Chateau Motel)",
      "cnpj": "",
      "regime": "cativo",
      "grupo": "A",
      "classe_display": "Comercial / comercial",
      "apelido": "PPM Empreendimentos",
      "nome_analise": "PPM Empreendimentos (Chateau Motel)",
      "distribuidora_display": "Ambar Energia AM",
      "localidade": "Manaus/AM",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 3346.96,
          "kwh": 1835,
          "tarifa": 1.82396
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 12720.7,
          "kwh": 23601,
          "tarifa": 0.53899
        },
        {
          "nome": "Demanda",
          "valor": 2261.0,
          "kw": 100,
          "detalhe": "79 kW a 22,610000 + 21 kW a 22,610000"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 0.28
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 48.35
        },
        {
          "nome": "COSIP",
          "valor": 2026.49
        }
      ],
      "demanda_ref_potencia_kw": 70,
      "tarifa_ponta_total": 1.82396,
      "tarifa_fp_total": 0.53899,
      "fonte": "FATURA_PPM---fb45bdbc-998c-453c-9f69-d8b2ebaf9eab.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 20403.78,
        "total": 20403.78,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 20403.78,
      "total": 20403.78,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-resende",
    "sourceFile": "fatura-resende_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Resende Comercio de Produtos Alimenticios LTDA",
    "uc": "0340394-7",
    "referencia": "06/2026",
    "total": 29217.65,
    "expected": {
      "cliente": "Resende Comercio de Produtos Alimenticios LTDA",
      "cnpj": "",
      "uc": "0340394-7",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM (ex-Amazonas Energia)",
      "localidade": "Manaus/AM",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / alimentos",
      "referencia": "06/2026",
      "vencimento": "14/07/2026",
      "total": 29217.65,
      "apelido": "Resende",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Resende Alimentos",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 5625.09,
          "kwh": 3084,
          "tarifa": 1.82396
        },
        {
          "nome": "Demanda",
          "valor": 2690.59,
          "kw": 119,
          "tarifa": 22.61
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 1.4
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 17810.18,
          "kwh": 33047,
          "tarifa": 0.53899,
          "detalhe": "32.951 kWh a 0,538990 + 96 kWh a 0,520140"
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 66.9
        },
        {
          "nome": "Demanda de ultrapassagem",
          "valor": 406.98,
          "kw": 9,
          "tarifa": 45.22
        },
        {
          "nome": "COSIP",
          "valor": 2666.44
        },
        {
          "nome": "Credito de geracao fora ponta",
          "valor": -49.93
        }
      ],
      "consumo_ponta_kwh": 3084,
      "consumo_fp_kwh": 33047,
      "demanda_contratada_kw": 110,
      "demanda_registrada_fp_kw": 119,
      "demanda_ref_potencia_kw": 119,
      "ultrapassagem_valor": 406.98,
      "ultrapassagem_kw": 9,
      "tarifa_ponta_total": 1.82396,
      "tarifa_fp_total": 0.53899,
      "fonte": "Fatura Ambar Energia 06/2026 (via para pagamento)",
      "conciliada": true,
      "prova": {
        "soma_itens": 29217.65,
        "total": 29217.65,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 29217.65,
      "total": 29217.65,
      "diferenca": 0.0,
      "itensCount": 8,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-rodrigues",
    "sourceFile": "fatura-rodrigues_conciliada.json",
    "distribuidora": "Equatorial Para",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Rodrigues Industria e C. C. LTDA (Rodrigues Colchoes)",
    "uc": "3.001.042.013-90",
    "referencia": "06/2026",
    "total": 51737.0,
    "expected": {
      "cliente": "Rodrigues Industria e C. C. LTDA (Rodrigues Colchoes)",
      "cnpj": "",
      "uc": "3.001.042.013-90",
      "distribuidora": "Equatorial Para",
      "distribuidora_display": "Equatorial Para Distribuidora de Energia S.A.",
      "localidade": "Ananindeua/PA",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "industrial",
      "classe_display": "Industrial / fabricacao de colchoes (A4 verde)",
      "referencia": "06/2026",
      "vencimento": "18/07/2026",
      "total": 51737.0,
      "apelido": "Rodrigues Colchoes",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Rodrigues Colchoes",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 8215.83,
          "kwh": 2015,
          "tarifa": 4.077295
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 19139.06,
          "kwh": 33702,
          "tarifa": 0.567892
        },
        {
          "nome": "Demanda ativa",
          "valor": 9854.99,
          "kw": 163,
          "tarifa": 60.474902
        },
        {
          "nome": "Demanda de ultrapassagem",
          "valor": 11243.5,
          "kw": 93,
          "tarifa": 120.949871
        },
        {
          "nome": "Adicional bandeira",
          "valor": 908.63
        },
        {
          "nome": "COSIP (Cip-Ilum Pub Pref Munic)",
          "valor": 2374.99
        }
      ],
      "consumo_ponta_kwh": 2015,
      "consumo_fp_kwh": 33702,
      "demanda_contratada_kw": 70,
      "demanda_registrada_fp_kw": 163,
      "demanda_ref_potencia_kw": 163,
      "ultrapassagem_valor": 11243.5,
      "ultrapassagem_kw": 93,
      "tarifa_ponta_total": 4.077295,
      "tarifa_fp_total": 0.567892,
      "fonte": "Fatura Equatorial PA 06/2026 (Junho-2026_Equatorial_PA.pdf)",
      "conciliada": true,
      "prova": {
        "soma_itens": 51737.0,
        "total": 51737.0,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 51737.0,
      "total": 51737.0,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-rs1-2026",
    "sourceFile": "fatura-rs1-2026_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Comercial Risadinha (UC 0582983-6)",
    "uc": "118252451",
    "referencia": "06/2026",
    "total": 22798.55,
    "expected": {
      "modalidade": "verde",
      "consumo_ponta_kwh": 2076,
      "tarifa_p": 1.82396,
      "consumo_fp_kwh": 26461,
      "tarifa_fp": 0.53899,
      "demanda_complemento_valor": null,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 36,
      "reativo_fp_valor": 10.11,
      "total": 22798.55,
      "demanda_contratada_kw": 120,
      "demanda_contratada_fp_kw": 120,
      "demanda_registrada_ponta_kw": 44,
      "demanda_registrada_fp_kw": 93,
      "classe": "comercial",
      "uc": "118252451",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "vencimento": "14/07/2026",
      "referencia": "06/2026",
      "distribuidora": "Ambar Energia AM",
      "cliente": "Comercial Risadinha (UC 0582983-6)",
      "cnpj": "",
      "regime": "cativo",
      "grupo": "A",
      "classe_display": "Comercial / comercial",
      "apelido": "Comercial Risadinha",
      "nome_analise": "Comercial Risadinha (UC 0582983-6)",
      "distribuidora_display": "Ambar Energia AM",
      "localidade": "Manaus/AM",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 3786.54,
          "kwh": 2076,
          "tarifa": 1.82396
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 14262.21,
          "kwh": 26461,
          "tarifa": 0.53899
        },
        {
          "nome": "Demanda",
          "valor": 2713.2,
          "kw": 120,
          "detalhe": "93 kW a 22,610000 + 27 kW a 22,610000"
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 10.11
        },
        {
          "nome": "COSIP",
          "valor": 2026.49
        }
      ],
      "demanda_ref_potencia_kw": 44,
      "tarifa_ponta_total": 1.82396,
      "tarifa_fp_total": 0.53899,
      "fonte": "FATURA_COMERCIAL_RISADINHA_UC_0582983-6---5087a36a-c8e3-4e93-aadc-87612ff502cc.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 22798.55,
        "total": 22798.55,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 22798.55,
      "total": 22798.55,
      "diferenca": 0.0,
      "itensCount": 5,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-santa-tereza-2026-06",
    "sourceFile": "fatura-santa-tereza-2026-06_conciliada.json",
    "distribuidora": "Roraima Energia",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "01939890",
    "referencia": "06/2026",
    "total": 174636.7,
    "expected": {
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0043-06",
      "uc": "01939890",
      "distribuidora": "Roraima Energia",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "referencia": "06/2026",
      "vencimento": "26/07/2026",
      "total": 174636.7,
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 46842.73,
          "kwh": 17419,
          "tarifa": 2.689175
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 114646.81,
          "kwh": 183153,
          "tarifa": 0.625962
        },
        {
          "nome": "Demanda",
          "valor": 13113.18,
          "kw": 500,
          "detalhe": "133 kW sem ICMS a 22,16 + 367 kW com ICMS a 27,70"
        },
        {
          "nome": "COSIP",
          "valor": 33.98
        }
      ],
      "consumo_ponta_kwh": 17419,
      "consumo_fp_kwh": 183153,
      "demanda_contratada_kw": 500,
      "demanda_registrada_ponta_kw": 346,
      "demanda_registrada_fp_kw": 367,
      "reativo_ponta_kwh": 0,
      "reativo_fp_kwh": 0,
      "tarifa_ponta_total": 2.689175,
      "tarifa_fp_total": 0.625962,
      "nao_cobrados": [
        {
          "nome": "Adicional Bandeira Amarela",
          "valor": 3774.59,
          "motivo": "bandeira Verde R$ 0,00 na referencia — linha informativa fora do total"
        }
      ],
      "fonte": "NF 21471964 (16pp nao — fatura avulsa), emitida 01/07/2026",
      "apelido": "Santa Tereza",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "classe_display": "Comercial / comercial",
      "nome_analise": "Mercantil Nova Era (loja Santa Tereza)",
      "demanda_complemento_valor": 2947.28,
      "conciliada": true,
      "prova": {
        "soma_itens": 174636.7,
        "total": 174636.7,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 174636.7,
      "total": 174636.7,
      "diferenca": 0.0,
      "itensCount": 4,
      "naoCobradosCount": 1,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-silves-2026-06",
    "sourceFile": "fatura-silves-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254740",
    "referencia": "06/2026",
    "total": 76751.87,
    "expected": {
      "consumo_ponta_kwh": 14721,
      "consumo_fp_kwh": 170452,
      "demanda_complemento_valor": 339.78,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 0,
      "reativo_fp_valor": 0.0,
      "total": 76751.87,
      "demanda_contratada_kw": 420,
      "demanda_registrada_ponta_kw": 323,
      "demanda_registrada_fp_kw": 390,
      "classe": "comercial",
      "uc": "118254740",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Silves",
      "nome_analise": "Mercantil Nova Era (loja Silves)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 13631.98,
          "kwh": 14721,
          "tarifa": 0.926023
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 48894.15,
          "kwh": 170452,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 5861.2,
          "kw": 420,
          "detalhe": "390 kW a 14,157500 + 30 kW a 11,326000"
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -381.37
        }
      ],
      "demanda_ref_potencia_kw": 323,
      "tarifa_ponta_total": 1.1720855,
      "tarifa_fp_total": 0.5329125,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 45889.18,
        "mwh": 186.494,
        "preco_kwh": 0.2460625
      },
      "total_gasto_energia": 122641.05,
      "fonte": "NF3e Ambar Energia AM + A100010077817-danfe ECOM SILVES.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 76751.87,
        "total": 76751.87,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 76751.87,
      "total": 76751.87,
      "diferenca": 0.0,
      "itensCount": 5,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-superfrios-2026-06",
    "sourceFile": "fatura-superfrios-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254691",
    "referencia": "06/2026",
    "total": 197863.63,
    "expected": {
      "consumo_ponta_kwh": 45213,
      "consumo_fp_kwh": 445462,
      "demanda_complemento_valor": null,
      "ultrapassagem_kw": 106,
      "ultrapassagem_valor": 5991.65,
      "tarifa_demanda_kw": 14.13125,
      "reativo_ponta_kwh": 10,
      "reativo_ponta_valor": 3.51,
      "reativo_fp_kwh": 178,
      "reativo_fp_valor": 62.54,
      "total": 197863.63,
      "demanda_contratada_kw": 700,
      "demanda_registrada_ponta_kw": 806,
      "demanda_registrada_fp_kw": 800,
      "classe": "comercial",
      "uc": "118254691",
      "vencimento": "20/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Superfrios",
      "nome_analise": "Mercantil Nova Era (loja Superfrios)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 42007.39,
          "kwh": 45213,
          "tarifa": 0.9291
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 129662.85,
          "kwh": 445462,
          "tarifa": 0.291075
        },
        {
          "nome": "Demanda",
          "valor": 11389.78,
          "kw": 806,
          "detalhe": "806 kW a 14,131250"
        },
        {
          "nome": "Ultrapassagem de demanda",
          "valor": 5991.65,
          "kw": 106,
          "detalhe": "106 kW a 56,525000 (em dobro)"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 3.51
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 62.54
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "demanda_ref_potencia_kw": 806,
      "tarifa_ponta_total": 1.159375,
      "tarifa_fp_total": 0.52135,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 113836.68,
        "mwh": 494.351,
        "preco_kwh": 0.230275
      },
      "total_gasto_energia": 311700.31,
      "fonte": "NF3e Ambar Energia AM + A100010077709-danfe SUPERFRIOS.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 197863.63,
        "total": 197863.63,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 197863.63,
      "total": 197863.63,
      "diferenca": 0.0,
      "itensCount": 7,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-tbt-2026",
    "sourceFile": "fatura-tbt-2026_conciliada.json",
    "distribuidora": "Amazonas Energia",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "TBT",
    "uc": "96298590",
    "referencia": "01/2025",
    "total": 44650.88,
    "expected": {
      "modalidade": "verde",
      "consumo_ponta_kwh": 2380,
      "tarifa_p": 1.79345,
      "consumo_fp_kwh": 57050,
      "tarifa_fp": 0.51358,
      "demanda_complemento_valor": null,
      "ultrapassagem_kw": 71,
      "ultrapassagem_valor": 3429.3,
      "tarifa_demanda_kw": 24.15,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 1890,
      "reativo_fp_valor": 731.61,
      "total": 44650.88,
      "demanda_contratada_kw": 200,
      "demanda_contratada_fp_kw": 200,
      "demanda_registrada_ponta_kw": 81,
      "demanda_registrada_fp_kw": 271,
      "classe": "comercial",
      "uc": "96298590",
      "leitura_anterior": "06/01/2025",
      "leitura_atual": "06/01/2025",
      "vencimento": "17/01/2025",
      "referencia": "01/2025",
      "distribuidora": "Amazonas Energia",
      "cliente": "TBT",
      "cnpj": "",
      "regime": "cativo",
      "grupo": "A",
      "classe_display": "Comercial / comercial",
      "apelido": "TBT",
      "nome_analise": "TBT",
      "distribuidora_display": "Amazonas Energia",
      "localidade": "Manaus/AM",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 4268.41,
          "kwh": 2380,
          "tarifa": 1.79345
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 29299.73,
          "kwh": 57050,
          "tarifa": 0.51358
        },
        {
          "nome": "Demanda",
          "valor": 6544.65,
          "kw": 271,
          "detalhe": "271 kW a 24,150000"
        },
        {
          "nome": "Ultrapassagem de demanda",
          "valor": 3429.3,
          "kw": 71
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 731.61
        },
        {
          "nome": "COSIP",
          "valor": 377.18
        }
      ],
      "demanda_ref_potencia_kw": 81,
      "tarifa_ponta_total": 1.79345,
      "tarifa_fp_total": 0.51358,
      "fonte": "12._Energia_TBT_Dezembro---638f1f25-15ca-4d6d-96e3-abef88a97302.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 44650.88,
        "total": 44650.88,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 44650.88,
      "total": 44650.88,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-tet-2026-06",
    "sourceFile": "fatura-tet-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "T E T Comercio e Industria de Hortifrutigranjeiros LTDA (T&T)",
    "uc": "5328002-0",
    "referencia": "06/2026",
    "total": 28114.04,
    "expected": {
      "cliente": "T E T Comercio e Industria de Hortifrutigranjeiros LTDA (T&T)",
      "cnpj": "",
      "uc": "5328002-0",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Ambar Energia - AM (ex-Amazonas Energia)",
      "localidade": "Manaus/AM",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / hortifrutigranjeiros",
      "referencia": "06/2026",
      "vencimento": "conferir",
      "total": 28114.04,
      "apelido": "T&T Hortifruti",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "T&T Hortifruti",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 6484.17,
          "kwh": 3555,
          "tarifa": 1.82396
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 13358.32,
          "kwh": 24784,
          "tarifa": 0.53899
        },
        {
          "nome": "Demanda",
          "valor": 4522.0,
          "kw": 200,
          "tarifa": 22.61,
          "detalhe": "135 kW + 65 kW a 22,61"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 55.94
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 1027.17
        },
        {
          "nome": "COSIP",
          "valor": 2666.44
        }
      ],
      "consumo_ponta_kwh": 3555,
      "consumo_fp_kwh": 24784,
      "demanda_contratada_kw": 200,
      "demanda_registrada_fp_kw": 200,
      "demanda_ref_potencia_kw": 200,
      "tarifa_ponta_total": 1.82396,
      "tarifa_fp_total": 0.53899,
      "fonte": "Fatura Ambar 06/2026 (deal 2375; deal 2121 = mesma UC 05/2026)",
      "conciliada": true,
      "prova": {
        "soma_itens": 28114.04,
        "total": 28114.04,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 28114.04,
      "total": 28114.04,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-tff-2026-04",
    "sourceFile": "fatura-tff-2026-04_conciliada.json",
    "distribuidora": "Amazonas Energia",
    "regime": "cativo",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Tefe (TFF 1)",
    "uc": "conferir",
    "referencia": "04/2026",
    "total": 23202.17,
    "expected": {
      "cliente": "Tefe (TFF 1)",
      "cnpj": "",
      "uc": "conferir",
      "distribuidora": "Amazonas Energia",
      "distribuidora_display": "Amazonas Energia S.A.",
      "localidade": "Tefe/AM",
      "regime": "cativo",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "comercial",
      "classe_display": "Comercial / comercial",
      "referencia": "04/2026",
      "vencimento": "conferir",
      "total": 23202.17,
      "apelido": "Tefe TFF",
      "leitura_anterior": "31/03/2026",
      "leitura_atual": "30/04/2026",
      "nome_analise": "Unidade Tefe (TFF 1)",
      "itens": [
        {
          "nome": "Consumo Ponta",
          "valor": 4262.94,
          "kwh": 2464,
          "tarifa": 1.73009
        },
        {
          "nome": "Consumo Fora Ponta",
          "valor": 13334.29,
          "kwh": 26888,
          "tarifa": 0.49592
        },
        {
          "nome": "Demanda",
          "valor": 4592.0,
          "kw": 200,
          "detalhe": "193 kW a 22,96 + 7 kW a 22,96"
        },
        {
          "nome": "Reativo excedente ponta",
          "valor": 50.63
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 399.81
        },
        {
          "nome": "Desligamento e Religacao Programados (2x)",
          "valor": 562.5
        }
      ],
      "consumo_ponta_kwh": 2464,
      "consumo_fp_kwh": 26888,
      "demanda_contratada_kw": 200,
      "demanda_registrada_ponta_kw": 193,
      "demanda_registrada_fp_kw": 193,
      "demanda_ref_potencia_kw": 193,
      "reativo_ponta_kwh": 145,
      "reativo_fp_kwh": 1145,
      "reativo_ponta_valor": 50.63,
      "reativo_fp_valor": 399.81,
      "tarifa_ponta_total": 1.73009,
      "tarifa_fp_total": 0.49592,
      "demanda_complemento_valor": 160.72,
      "fonte": "2026.04 Fatura Amazonas Energia TFF_1",
      "conciliada": true,
      "prova": {
        "soma_itens": 23202.17,
        "total": 23202.17,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 23202.17,
      "total": 23202.17,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": false
    }
  },
  {
    "id": "fatura-torres-2026-06",
    "sourceFile": "fatura-torres-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254816",
    "referencia": "06/2026",
    "total": 106904.63,
    "expected": {
      "consumo_ponta_kwh": 22045,
      "consumo_fp_kwh": 238396,
      "demanda_complemento_valor": 2023.59,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 0,
      "reativo_fp_valor": 0.0,
      "total": 106904.63,
      "demanda_contratada_kw": 700,
      "demanda_registrada_ponta_kw": 435,
      "demanda_registrada_fp_kw": 521,
      "classe": "comercial",
      "uc": "118254816",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Torres",
      "nome_analise": "Mercantil Nova Era (loja Torres)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 20388.86,
          "kwh": 22045,
          "tarifa": 0.924875
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 68383.89,
          "kwh": 238396,
          "tarifa": 0.28685
        },
        {
          "nome": "Demanda",
          "valor": 9385.97,
          "kw": 700,
          "detalhe": "521 kW a 14,131250 + 179 kW a 11,305000"
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "demanda_ref_potencia_kw": 435,
      "tarifa_ponta_total": 1.1709375,
      "tarifa_fp_total": 0.5329125,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 64644.06,
        "mwh": 262.714,
        "preco_kwh": 0.2460625
      },
      "total_gasto_energia": 171548.69,
      "fonte": "NF3e Ambar Energia AM + A100010077815-danfe ECOM TORRES.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 106904.63,
        "total": 106904.63,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 106904.63,
      "total": 106904.63,
      "diferenca": 0.0,
      "itensCount": 4,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-torres-ii-2026-06",
    "sourceFile": "fatura-torres-ii-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "000127875",
    "referencia": "06/2026",
    "total": 90168.68,
    "expected": {
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "uc": "000127875",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe": "industrial",
      "classe_display": "Industrial / industrial",
      "referencia": "06/2026",
      "vencimento": "14/07/2026",
      "total": 90168.68,
      "apelido": "Torres II",
      "leitura_anterior": "31/05/2026",
      "leitura_atual": "30/06/2026",
      "nome_analise": "Mercantil Nova Era (loja Torres II)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 18745.91,
          "kwh": 20146,
          "tarifa": 0.930503
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 55135.42,
          "kwh": 189420,
          "tarifa": 0.291075
        },
        {
          "nome": "Demanda",
          "valor": 7531.61,
          "kw": 550,
          "detalhe": "459 kW medida a 14,162500 + 91 kW a 11,330000 (desconto demanda 49,89%)"
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 9.83
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        }
      ],
      "consumo_ponta_kwh": 20146,
      "consumo_fp_kwh": 189420,
      "demanda_contratada_kw": 550,
      "demanda_registrada_ponta_kw": 430,
      "demanda_registrada_fp_kw": 459,
      "demanda_ref_potencia_kw": 430,
      "reativo_ponta_kwh": 0,
      "reativo_fp_kwh": 28,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_valor": 9.83,
      "tarifa_ponta_total": 1.173303,
      "tarifa_fp_total": 0.533875,
      "demanda_complemento_valor": 1031.03,
      "energia_nf": {
        "fornecedor": "ENEL (NFE)",
        "total": 51133.68,
        "mwh": 210.6,
        "preco_kwh": 0.2428
      },
      "total_gasto_energia": 141302.36,
      "fonte": "NF3e Ambar Energia AM + NFE ENEL 0002562031",
      "conciliada": true,
      "prova": {
        "soma_itens": 90168.68,
        "total": 90168.68,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 90168.68,
      "total": 90168.68,
      "diferenca": 0.0,
      "itensCount": 5,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-tps-azul-2026-01",
    "sourceFile": "fatura-tps-azul-2026-01_conciliada.json",
    "distribuidora": "Energisa Rondonia",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "azul",
    "cliente": "Concessionaria dos Aeroportos da Amazonia S/A",
    "uc": "TPS Porto Velho",
    "referencia": "01/2026",
    "total": 172974.78,
    "expected": {
      "cliente": "Concessionaria dos Aeroportos da Amazonia S/A",
      "cnpj": "",
      "uc": "TPS Porto Velho",
      "distribuidora": "Energisa Rondonia",
      "distribuidora_display": "Energisa Rondônia S.A.",
      "localidade": "Porto Velho/RO",
      "regime": "mercado_livre",
      "grupo": "A",
      "classe": "comercial",
      "classe_display": "Comercial / aeroportuário",
      "referencia": "01/2026",
      "vencimento": "02/2026",
      "total": 172974.78,
      "leitura_anterior": "31/12/2025",
      "leitura_atual": "31/01/2026",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 5838.32,
          "kwh": 27665,
          "tarifa": 0.21103
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 59741.65,
          "kwh": 283087,
          "tarifa": 0.21103
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 8113.45
        },
        {
          "nome": "Demanda (TUSD kW ponta + fora ponta)",
          "valor": 97257.21,
          "kw": 560,
          "detalhe": "PONTA: 508 kW a 134,051980 + 12 NC a 107,911840 = 69.393,34; FP: 556 kW a 49,826320 + 4 NC a 40,110193 = 27.863,87"
        },
        {
          "nome": "Reativo excedente kW fora ponta",
          "valor": 3652.01
        },
        {
          "nome": "Encargo Covid Escassez Hidrica",
          "valor": 1590.9
        },
        {
          "nome": "Debitos APCEI 12/2025",
          "valor": 28951.88
        },
        {
          "nome": "Creditos APCEI 02/2026",
          "valor": -35653.8
        },
        {
          "nome": "COSIP",
          "valor": 849.67
        },
        {
          "nome": "Juros/multa/atualizacao 01/2026",
          "valor": 2633.49
        }
      ],
      "consumo_ponta_kwh": 27665,
      "consumo_fp_kwh": 283087,
      "demanda_contratada_kw": 560,
      "demanda_registrada_ponta_kw": 508,
      "demanda_registrada_fp_kw": 556,
      "demanda_ref_potencia_kw": 508,
      "reativo_ponta_kwh": 0,
      "reativo_fp_kwh": 27049,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_valor": 11765.46,
      "energia_nf": {
        "fornecedor": "PREMISSA mercado RO (sem NF recebida)",
        "total": 75927.28,
        "mwh": 310.752,
        "preco_kwh": 0.244334,
        "obs": "PREMISSA: preco de referencia RO R$ 244,334/MWh (ENEL nas demais contas do grupo). Substituir pela NF real do fornecedor do TPS."
      },
      "total_gasto_energia": 248902.06,
      "fonte": "Fatura Energisa RO 01/2026 + simulacao verde (CSV Plugga)",
      "modalidade": "azul",
      "funcao": "peak_shaving",
      "apelido": "TPS Porto Velho (azul)",
      "nome_analise": "Aeroporto de Porto Velho — TPS (permanecendo azul)",
      "demanda_ponta_valor_total": 69393.34,
      "tarifa_kw_ponta_medida": 134.05198,
      "tarifa_kw_ponta_nc": 107.91184,
      "tarifa_ponta_total": 0.455364,
      "tarifa_fp_total": 0.455364,
      "conciliada": true,
      "prova": {
        "soma_itens": 172974.78,
        "total": 172974.78,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 172974.78,
      "total": 172974.78,
      "diferenca": 0.0,
      "itensCount": 10,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-tps-verde-2026-01",
    "sourceFile": "fatura-tps-verde-2026-01_conciliada.json",
    "distribuidora": "Energisa Rondonia",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Concessionaria dos Aeroportos da Amazonia S/A",
    "uc": "TPS Porto Velho",
    "referencia": "01/2026",
    "total": 193548.65,
    "expected": {
      "cliente": "Concessionaria dos Aeroportos da Amazonia S/A",
      "cnpj": "",
      "uc": "TPS Porto Velho",
      "distribuidora": "Energisa Rondonia",
      "distribuidora_display": "Energisa Rondônia S.A.",
      "localidade": "Porto Velho/RO",
      "regime": "mercado_livre",
      "grupo": "A",
      "classe": "comercial",
      "classe_display": "Comercial / aeroportuário",
      "referencia": "01/2026",
      "vencimento": "02/2026",
      "total": 193548.65,
      "leitura_anterior": "31/12/2025",
      "leitura_atual": "31/01/2026",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 95805.74,
          "kwh": 27665,
          "tarifa": 3.463067
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 59741.66,
          "kwh": 283087,
          "tarifa": 0.211036
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 8113.46
        },
        {
          "nome": "Demanda (TUSD kW unica verde)",
          "valor": 27863.88,
          "kw": 560,
          "detalhe": "556 kW medida a 49,826327 + 4 kW NC a 40,110193"
        },
        {
          "nome": "Reativo excedente kW fora ponta",
          "valor": 3651.77
        },
        {
          "nome": "Encargo Covid Escassez Hidrica",
          "valor": 1590.9
        },
        {
          "nome": "Debitos APCEI 12/2025",
          "valor": 28951.88
        },
        {
          "nome": "Creditos APCEI 02/2026",
          "valor": -35653.8
        },
        {
          "nome": "COSIP",
          "valor": 849.67
        },
        {
          "nome": "Juros/multa/atualizacao 01/2026",
          "valor": 2633.49
        }
      ],
      "consumo_ponta_kwh": 27665,
      "consumo_fp_kwh": 283087,
      "demanda_contratada_kw": 560,
      "demanda_registrada_ponta_kw": 508,
      "demanda_registrada_fp_kw": 556,
      "demanda_ref_potencia_kw": 508,
      "reativo_ponta_kwh": 0,
      "reativo_fp_kwh": 27049,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_valor": 11765.46,
      "energia_nf": {
        "fornecedor": "PREMISSA mercado RO (sem NF recebida)",
        "total": 75927.28,
        "mwh": 310.752,
        "preco_kwh": 0.244334,
        "obs": "PREMISSA: preco de referencia RO R$ 244,334/MWh (ENEL nas demais contas do grupo). Substituir pela NF real do fornecedor do TPS."
      },
      "total_gasto_energia": 269476.13,
      "fonte": "Fatura Energisa RO 01/2026 + simulacao verde (CSV Plugga)",
      "modalidade": "verde",
      "apelido": "TPS Porto Velho (verde)",
      "nome_analise": "Aeroporto de Porto Velho — TPS (migrado p/ verde)",
      "tarifa_ponta_total": 3.707401,
      "tarifa_fp_total": 0.45537,
      "conciliada": true,
      "prova": {
        "soma_itens": 193548.65,
        "total": 193548.65,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 193548.65,
      "total": 193548.65,
      "diferenca": 0.0,
      "itensCount": 10,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": false,
      "temEnergiaNf": true
    }
  },
  {
    "id": "fatura-viver-melhor-2026-06",
    "sourceFile": "fatura-viver-melhor-2026-06_conciliada.json",
    "distribuidora": "Ambar Energia AM",
    "regime": "mercado_livre",
    "grupo": "A",
    "modalidade": "verde",
    "cliente": "Mercantil Nova Era Ltda",
    "uc": "118254537",
    "referencia": "06/2026",
    "total": 77856.34,
    "expected": {
      "consumo_ponta_kwh": 14758,
      "consumo_fp_kwh": 167395,
      "demanda_complemento_valor": 1404.42,
      "reativo_ponta_kwh": 0,
      "reativo_ponta_valor": 0.0,
      "reativo_fp_kwh": 4,
      "reativo_fp_valor": 1.4,
      "total": 77856.34,
      "demanda_contratada_kw": 525,
      "demanda_registrada_ponta_kw": 372,
      "demanda_registrada_fp_kw": 401,
      "classe": "comercial",
      "uc": "118254537",
      "vencimento": "14/07/2026",
      "leitura_anterior": "02/07/2026",
      "leitura_atual": "02/07/2026",
      "cliente": "Mercantil Nova Era Ltda",
      "cnpj": "04.240.370/0001-77",
      "distribuidora": "Ambar Energia AM",
      "distribuidora_display": "Âmbar Energia - AM",
      "localidade": "Manaus/AM",
      "regime": "mercado_livre",
      "grupo": "A",
      "modalidade": "verde",
      "classe_display": "Comercial / comercial",
      "referencia": "06/2026",
      "apelido": "Viver Melhor",
      "nome_analise": "Mercantil Nova Era (loja Viver Melhor)",
      "itens": [
        {
          "nome": "Consumo Ponta (TUSD)",
          "valor": 13728.59,
          "kwh": 14758,
          "tarifa": 0.930248
        },
        {
          "nome": "Consumo Fora Ponta (TUSD)",
          "valor": 48724.49,
          "kwh": 167395,
          "tarifa": 0.291075
        },
        {
          "nome": "Demanda",
          "valor": 7081.57,
          "kw": 525,
          "detalhe": "401 kW a 14,157500 + 124 kW a 11,326000"
        },
        {
          "nome": "Reativo excedente fora ponta",
          "valor": 1.4
        },
        {
          "nome": "COSIP",
          "valor": 8745.91
        },
        {
          "nome": "Devolucao Diferenca Desconto Tusd - Ccee 04/26-",
          "valor": -425.62
        }
      ],
      "demanda_ref_potencia_kw": 372,
      "tarifa_ponta_total": 1.160523,
      "tarifa_fp_total": 0.52135,
      "energia_nf": {
        "fornecedor": "ECOM Energia",
        "total": 42168.19,
        "mwh": 183.121,
        "preco_kwh": 0.230275
      },
      "total_gasto_energia": 120024.53,
      "fonte": "NF3e Ambar Energia AM + A100010077707-danfe VIVER MELHOR.pdf",
      "conciliada": true,
      "prova": {
        "soma_itens": 77856.34,
        "total": 77856.34,
        "diferenca": 0.0
      }
    },
    "checks": {
      "somaItens": 77856.34,
      "total": 77856.34,
      "diferenca": 0.0,
      "itensCount": 6,
      "naoCobradosCount": 0,
      "temDemandaComplementoValor": true,
      "temEnergiaNf": true
    }
  }
] as const satisfies readonly GoldenFaturaCase[];

export const GOLDEN_CASES_BY_DISTRIBUIDORA = GOLDEN_FATURA_CASES.reduce((acc, caso) => {
  (acc[caso.distribuidora] ??= []).push(caso);
  return acc;
}, {} as Record<string, GoldenFaturaCase[]>);

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function somaItensFaturados(fatura: Pick<FaturaConciliadaEsperada, 'itens'>): number {
  return roundMoney((fatura.itens ?? []).reduce((acc, item) => acc + Number(item.valor || 0), 0));
}

export function trava1Fecha(fatura: FaturaConciliadaEsperada): boolean {
  return roundMoney(somaItensFaturados(fatura) - Number(fatura.total || 0)) === 0;
}

/**
 * Regra semantica segura para bandeira/adicional:
 * - se incluir o item estoura a soma, mas remover fecha o total, nasce como informativo;
 * - se a soma so fecha incluindo, permanece faturado.
 * O parser real deve registrar motivo: marcado_como_informativo_por_trava_1.
 */
export function deveNascerInformativoPorTrava1(args: {
  rotulo: string;
  total: number;
  somaComItem: number;
  valorItem: number;
}): boolean {
  const rotulo = args.rotulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pareceBandeira = /\b(bandeira|adicional bandeira|bandeira tarifaria)\b/.test(rotulo);
  if (!pareceBandeira) return false;
  const diferencaCom = roundMoney(args.somaComItem - args.total);
  const diferencaSem = roundMoney(args.somaComItem - args.valorItem - args.total);
  return diferencaCom !== 0 && diferencaSem === 0;
}

export const GOLDEN_CASES_SUMMARY = {
  "Ambar Energia AM": 39,
  "Energisa Rondonia": 8,
  "Amazonas Energia": 4,
  "Roraima Energia": 3,
  "Energisa Acre": 1,
  "Equatorial Para": 1
} as const;
