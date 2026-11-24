import { z } from "zod";

import { diaDoCalendario, quantidadeString } from "./compras.js";
import { companyKeySchema } from "./organization.js";
import { isoDate, uuid } from "./primitivas.js";
import { ocorrenciaDeTarefaSchema } from "./tarefas.js";
import { monitoramentoDaVisaoGeralSchema } from "./usinas.js";

/**
 * Engenharia e Obras (PLU-345): a ordem de serviço, em
 * `/engenharia/ordens-de-servico`, no lugar das tarefas "O.S ..." do Bitrix.
 *
 * ```
 * aberta → agendada → em_campo → laudo → concluida
 *    │        │  ▲        │
 *    │        ▼  │agendar │
 *    │      adiada ◄──────┘
 *    └──── cancelada (de qualquer situação antes de concluida)
 * ```
 *
 * - Agendar exige técnico, data e horário, nunca no passado (Manaus).
 * - Check-in antes do dia agendado pede confirmação; confirmado, remarca para
 *   agora e registra na linha do tempo.
 * - O laudo exige o que foi encontrado, o que foi feito e ao menos uma foto.
 * - O termo assinado (na tela ou PDF assinado à parte) conclui a O.S.
 * - Adiada exige motivo e nova data; volta por "agendar".
 * - Concluída não reabre (decisão de 23/11/2026): abre-se outra O.S. ligada à
 *   anterior por `ordemAnteriorId`.
 *
 * A empresa (Plugga ou Waze) é campo obrigatório e filtro; a visão é global.
 */

// ---------------------------------------------------------------- enums

/** E10: eletroposto, grid zero/BESS e análise de energia são tipos, sem tela própria. */
export const tiposDeOrdemDeServico = [
  "manutencao",
  "limpeza",
  "garantia",
  "emergencia",
  "visita_tecnica",
  "instalacao",
  "configuracao",
  "comissionamento",
  "orcamento_tecnico",
  "eletroposto",
  "grid_zero_bess",
  "analise_energia",
  "outros",
] as const;
export const tipoDeOrdemDeServicoSchema = z.enum(tiposDeOrdemDeServico);
export type TipoDeOrdemDeServico = z.infer<typeof tipoDeOrdemDeServicoSchema>;

/** E1. */
export const situacoesDaOrdemDeServico = ["aberta", "agendada", "em_campo", "laudo", "concluida", "adiada", "cancelada"] as const;
export const situacaoDaOrdemDeServicoSchema = z.enum(situacoesDaOrdemDeServico);
export type SituacaoDaOrdemDeServico = z.infer<typeof situacaoDaOrdemDeServicoSchema>;

/**
 * Colunas do quadro, na ordem da tela. Cada situação cai numa coluna, menos a
 * cancelada, que fica fora do quadro (aparece na lista com o filtro).
 */
export const colunasDoQuadroDeOrdens = ["para_agendar", "agendadas", "em_campo", "colher_assinatura", "concluidas", "adiadas"] as const;
export const colunaDoQuadroDeOrdensSchema = z.enum(colunasDoQuadroDeOrdens);
export type ColunaDoQuadroDeOrdens = z.infer<typeof colunaDoQuadroDeOrdensSchema>;

export const COLUNA_DA_SITUACAO: Record<SituacaoDaOrdemDeServico, ColunaDoQuadroDeOrdens | null> = {
  aberta: "para_agendar",
  agendada: "agendadas",
  em_campo: "em_campo",
  laudo: "colher_assinatura",
  concluida: "concluidas",
  adiada: "adiadas",
  cancelada: null,
};

/** Grupos do filtro Situação. */
export const gruposDeSituacao = ["em_andamento", "encerradas"] as const;
export const grupoDeSituacaoSchema = z.enum(gruposDeSituacao);
export const SITUACOES_DO_GRUPO: Record<(typeof gruposDeSituacao)[number], readonly SituacaoDaOrdemDeServico[]> = {
  em_andamento: ["aberta", "agendada", "em_campo", "laudo", "adiada"],
  encerradas: ["concluida", "cancelada"],
};

/** Grupo "Atenção" do filtro Situação e os metric cards. */
export const filtrosDeAtencao = ["atrasadas", "em_campo_hoje"] as const;
export const filtroDeAtencaoSchema = z.enum(filtrosDeAtencao);
export type FiltroDeAtencao = z.infer<typeof filtroDeAtencaoSchema>;

export const prioridadesDaOrdemDeServico = ["baixa", "normal", "alta", "urgente"] as const;
export const prioridadeDaOrdemDeServicoSchema = z.enum(prioridadesDaOrdemDeServico);
export type PrioridadeDaOrdemDeServico = z.infer<typeof prioridadeDaOrdemDeServicoSchema>;

/** De onde veio a O.S. O robô (DK JUNIOR) registra também o canal. */
export const origensDaOrdemDeServico = ["manual", "monitoramento", "crm", "robo"] as const;
export const origemDaOrdemDeServicoSchema = z.enum(origensDaOrdemDeServico);
export type OrigemDaOrdemDeServico = z.infer<typeof origemDaOrdemDeServicoSchema>;

/** E2: desenho na tela, Enter com o nome digitado, ou PDF assinado à parte. */
export const modosDeAssinaturaDoTermo = ["desenhada", "nome_digitado", "pdf_externo"] as const;
export const modoDeAssinaturaDoTermoSchema = z.enum(modosDeAssinaturaDoTermo);
export type ModoDeAssinaturaDoTermo = z.infer<typeof modoDeAssinaturaDoTermoSchema>;

export const acoesDaOrdemDeServico = [
  "editar",
  "agendar",
  "check_in",
  "enviar_foto",
  "registrar_laudo",
  "colher_termo",
  "adiar",
  "cancelar",
  "pedir_material",
] as const;
export type AcaoPermitidaDaOrdemDeServico = (typeof acoesDaOrdemDeServico)[number];

/**
 * Check-in antes do dia agendado, sem `confirmarAntecipado`: 409 `CONFLITO_ESTADO`
 * com `motivo` igual a esta constante e `agendadaPara` (ISO) no envelope.
 */
export const CODIGO_CHECKIN_ANTECIPADO = "checkin_antecipado";

// ---------------------------------------------------------------- arquivos

export const ARQUIVO_DE_ORDEM_MAX_BYTES = 25 * 1024 * 1024;
/** Fotos do laudo; conferidas pelo conteúdo, não pela extensão. */
export const tiposDeFotoDaOrdem = ["image/jpeg", "image/png"] as const;
/** Assinatura desenhada: PNG, pequeno. */
export const ASSINATURA_MAX_BYTES = 512 * 1024;

// ---------------------------------------------------------------- entradas

const texto = (min: number, max: number, problema: string) => z.string().trim().min(min, problema).max(max);
const textoOpcional = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable()).optional();

/** Horário do dia (HH:mm, 24 h), no fuso de Manaus. */
export const horarioDoDia = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use o formato HH:mm");

const equipamentoEntrada = {
  equipamento: textoOpcional(120),
  fabricante: textoOpcional(120),
  modelo: textoOpcional(120),
  numeroSerie: textoOpcional(120),
};

export const criarOrdemDeServicoSchema = z
  .object({
    empresa: companyKeySchema,
    tipo: tipoDeOrdemDeServicoSchema,
    clienteId: uuid,
    /** Unidade consumidora do cliente, opcional. */
    ucId: uuid.nullable().optional(),
    local: textoOpcional(300),
    descricao: texto(1, 2000, "descreva o serviço"),
    prioridade: prioridadeDaOrdemDeServicoSchema.default("normal"),
    origem: origemDaOrdemDeServicoSchema.default("manual"),
    /** Quando veio do robô: WhatsApp Técnicos, Telegram ENGENHARIA E OBRAS. */
    canal: textoOpcional(120),
    /** Dia-limite para o atendimento; não pode estar no passado. */
    prazo: diaDoCalendario,
    /** O.S. de origem quando esta continua uma concluída (a concluída não reabre). */
    ordemAnteriorId: uuid.nullable().optional(),
    /** Usina do cliente (PLU-347); o equipamento vem dela quando não é informado. */
    usinaId: uuid.nullable().optional(),
    /** Obra do mesmo cliente e empresa (PLU-350). */
    obraId: uuid.nullable().optional(),
    ...equipamentoEntrada,
  })
  .strict();
export type CriarOrdemDeServico = z.infer<typeof criarOrdemDeServicoSchema>;

// ---------------------------------------------------------------- entrada pelo robô (PLU-351)

/** Canais de onde o robô (DK JUNIOR) recebe o pedido. */
export const canaisDoRobo = ["whatsapp", "telegram"] as const;
export const canalDoRoboSchema = z.enum(canaisDoRobo);
export type CanalDoRobo = z.infer<typeof canalDoRoboSchema>;

/**
 * O.S. aberta pelo agente (`POST /agentes/engenharia/ordens-de-servico`, com o
 * cabeçalho `Idempotency-Key`). O cliente vem pela chave natural: o código da UC
 * ou o CNPJ/CPF; o nome não basta (422). Sem prazo, vale o prazo padrão do tipo.
 */
export const criarOrdemPeloAgenteSchema = z
  .object({
    empresa: companyKeySchema,
    tipo: tipoDeOrdemDeServicoSchema,
    descricao: texto(1, 2000, "descreva o serviço"),
    /** Código da UC, como o cliente informa (pontos e traços são ignorados). */
    uc: z.string().trim().min(3).max(40).optional(),
    /** CNPJ ou CPF do cliente, só os dígitos ou formatado. */
    documento: z.string().trim().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^(\d{11}|\d{14})$/, "CPF com 11 ou CNPJ com 14 dígitos")).optional(),
    local: textoOpcional(300),
    prioridade: prioridadeDaOrdemDeServicoSchema.default("normal"),
    prazo: diaDoCalendario.optional(),
    origem: z.object({
      canal: canalDoRoboSchema,
      /** Grupo ou conversa de onde veio o pedido. */
      grupo: texto(1, 120, "informe o grupo"),
      /** Quem pediu no canal (nome ou apelido). Fica na O.S., nunca em evento ou log. */
      solicitante: texto(1, 120, "informe quem pediu"),
    }).strict(),
  })
  .strict();
export type CriarOrdemPeloAgente = z.infer<typeof criarOrdemPeloAgenteSchema>;

export const ordemPeloAgenteRespostaSchema = z.object({
  ordem: z.object({ id: uuid, codigo: z.string(), situacao: situacaoDaOrdemDeServicoSchema, prazo: diaDoCalendario }),
  /** O mesmo pedido (mesma chave e mesmo corpo) já tinha criado esta O.S. */
  repetido: z.boolean(),
});
export type OrdemPeloAgenteResposta = z.infer<typeof ordemPeloAgenteRespostaSchema>;

/** Dados e equipamento; vale enquanto a O.S. não está concluída nem cancelada. */
export const editarOrdemDeServicoSchema = z
  .object({
    tipo: tipoDeOrdemDeServicoSchema.optional(),
    ucId: uuid.nullable().optional(),
    local: textoOpcional(300),
    descricao: texto(1, 2000, "descreva o serviço").optional(),
    prioridade: prioridadeDaOrdemDeServicoSchema.optional(),
    prazo: diaDoCalendario.optional(),
    /** Obra do mesmo cliente e empresa (PLU-350); nulo desliga. */
    obraId: uuid.nullable().optional(),
    ...equipamentoEntrada,
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "informe ao menos um campo");
export type EditarOrdemDeServico = z.infer<typeof editarOrdemDeServicoSchema>;

export const acaoDaOrdemDeServicoSchema = z.discriminatedUnion("acao", [
  /** aberta | adiada | agendada → agendada (agendar de novo remarca). Data e horário não podem estar no passado. */
  z
    .object({
      acao: z.literal("agendar"),
      tecnicoId: uuid,
      apoioId: uuid.nullable().optional(),
      data: diaDoCalendario,
      horario: horarioDoDia,
    })
    .strict(),
  /**
   * agendada → em_campo. Antes do dia agendado responde 409
   * `checkin_antecipado`; com `confirmarAntecipado`, remarca para agora e registra.
   */
  z.object({ acao: z.literal("check_in"), confirmarAntecipado: z.boolean().optional() }).strict(),
  /** em_campo → laudo. Exige ao menos uma foto já enviada. */
  z
    .object({
      acao: z.literal("registrar_laudo"),
      encontrado: texto(1, 4000, "descreva o que foi encontrado"),
      feito: texto(1, 4000, "descreva o que foi feito"),
      recomendacao: textoOpcional(4000),
    })
    .strict(),
  /** agendada | em_campo → adiada. Nova data futura obrigatória. */
  z
    .object({
      acao: z.literal("adiar"),
      motivo: texto(1, 1000, "informe o motivo do adiamento"),
      novaData: diaDoCalendario,
      horario: horarioDoDia.nullable().optional(),
    })
    .strict(),
  /** Qualquer situação antes de concluida. */
  z.object({ acao: z.literal("cancelar"), motivo: texto(1, 1000, "informe o motivo do cancelamento") }).strict(),
]);
export type AcaoDaOrdemDeServico = z.infer<typeof acaoDaOrdemDeServicoSchema>;

/**
 * Termo assinado na tela do celular do técnico (`POST .../:id/termo`,
 * multipart). Em `desenhada`, o PNG vai no campo de arquivo `assinatura`; em
 * `nome_digitado`, o nome digitado é a assinatura. O PDF é gerado na API.
 */
export const colherTermoSchema = z
  .object({
    modo: modoDeAssinaturaDoTermoSchema.exclude(["pdf_externo"]),
    nome: texto(3, 200, "informe o nome de quem assina"),
    /** CPF, CNPJ ou RG de quem assina, como está no documento: texto livre, sem conferir dígito (o RG não tem um padrão nacional). */
    documento: texto(5, 30, "informe o documento de quem assina"),
  })
  .strict();
export type ColherTermo = z.infer<typeof colherTermoSchema>;

/** Material para a O.S., criado como pedido de compra em Suprimentos (PLU-327). */
export const pedirMaterialSchema = z
  .object({
    titulo: textoOpcional(200),
    descricao: textoOpcional(2000),
    prazoEntregaDesejado: diaDoCalendario,
    itens: z
      .array(
        z
          .object({ descricao: texto(1, 300, "descreva o material"), quantidade: quantidadeString, unidade: textoOpcional(20) })
          .strict(),
      )
      .min(1, "informe ao menos um material")
      .max(100),
  })
  .strict();
export type PedirMaterial = z.infer<typeof pedirMaterialSchema>;

// ---------------------------------------------------------------- consultas

const filtrosDeOrdens = {
  empresa: companyKeySchema.optional(),
  tipo: tipoDeOrdemDeServicoSchema.optional(),
  tecnicoId: uuid.optional(),
  situacao: situacaoDaOrdemDeServicoSchema.optional(),
  grupo: grupoDeSituacaoSchema.optional(),
  /** Atrasadas: passaram do prazo ou do horário agendado sem concluir. Em campo hoje: check-in hoje, ainda em campo. */
  atencao: filtroDeAtencaoSchema.optional(),
  /** Código (OS-0012 ou 12), cliente ou descrição. */
  busca: z.string().trim().min(1).max(150).optional(),
};

export const listarOrdensDeServicoQuerySchema = z.object(filtrosDeOrdens).strict();
export type ListarOrdensDeServicoQuery = z.infer<typeof listarOrdensDeServicoQuerySchema>;

export const quadroDeOrdensQuerySchema = z.object(filtrosDeOrdens).omit({ situacao: true, grupo: true, atencao: true }).strict();
export type QuadroDeOrdensQuery = z.infer<typeof quadroDeOrdensQuerySchema>;

/** A lista traz as mais recentes primeiro, até este teto; `total` conta todas as que casam. */
export const LIMITE_DA_LISTA_DE_ORDENS = 200;
/** No quadro, a coluna Concluídas mostra só as concluídas nestes últimos dias. */
export const DIAS_DE_CONCLUIDAS_NO_QUADRO = 30;

export const buscarClientesDaEngenhariaQuerySchema = z.object({ busca: z.string().trim().min(2).max(150) }).strict();
export type BuscarClientesDaEngenhariaQuery = z.infer<typeof buscarClientesDaEngenhariaQuerySchema>;

// ---------------------------------------------------------------- saídas

const pessoa = z.object({ id: uuid, nome: z.string() });
export type PessoaDaEngenharia = z.infer<typeof pessoa>;
const registro = z.object({ por: pessoa.nullable(), em: isoDate });

const ucResumida = z.object({ id: uuid, codigo: z.string(), distribuidora: z.string() });

export const clienteDaEngenhariaSchema = z.object({ id: uuid, nome: z.string(), ucs: z.array(ucResumida) });
export const buscarClientesDaEngenhariaRespostaSchema = z.object({ itens: z.array(clienteDaEngenhariaSchema) });
export type BuscarClientesDaEngenhariaResposta = z.infer<typeof buscarClientesDaEngenhariaRespostaSchema>;

export const arquivoDaOrdemSchema = z.object({
  id: uuid,
  nome: z.string(),
  tamanhoBytes: z.number().int().positive(),
  tipo: z.string(),
  /** Caminho da API para baixar (nunca a URL do armazenamento). */
  url: z.string(),
  enviado: registro,
});
export type ArquivoDaOrdem = z.infer<typeof arquivoDaOrdemSchema>;

export const termoDaOrdemSchema = z.object({
  modo: modoDeAssinaturaDoTermoSchema,
  /** Nulos no PDF assinado à parte. */
  nome: z.string().nullable(),
  /** Só os últimos dígitos (ex.: •••.•••.789-01). */
  documentoMascarado: z.string().nullable(),
  assinado: registro,
  /** O PDF gerado ou o assinado à parte. */
  pdf: arquivoDaOrdemSchema,
});
export type TermoDaOrdem = z.infer<typeof termoDaOrdemSchema>;

export const pedidoDeMaterialDaOrdemSchema = z.object({
  id: uuid,
  numero: z.number().int().positive(),
  titulo: z.string(),
  etapa: z.string(),
  situacao: z.string(),
  createdAt: isoDate,
});

export const tiposDeEventoDaOrdem = [
  "criada",
  "editada",
  "agendada",
  "remarcada",
  "checkin",
  "checkin_antecipado",
  "foto_enviada",
  "laudo_registrado",
  "termo_assinado",
  "concluida",
  "adiada",
  "cancelada",
  "material_pedido",
] as const;
export const eventoDaOrdemSchema = z.object({
  id: uuid,
  tipo: z.enum(tiposDeEventoDaOrdem),
  em: isoDate,
  por: pessoa.nullable(),
  /** Texto pronto da linha do tempo ("Agendada para 25/11 às 09:00 com Igor"). */
  descricao: z.string(),
  /** Motivo do adiamento ou do cancelamento, observação. */
  detalhe: z.string().nullable(),
});
export type EventoDaOrdem = z.infer<typeof eventoDaOrdemSchema>;

const equipamentoSaida = z.object({
  equipamento: z.string().nullable(),
  fabricante: z.string().nullable(),
  modelo: z.string().nullable(),
  numeroSerie: z.string().nullable(),
});

export const ordemDeServicoResumoSchema = z.object({
  id: uuid,
  numero: z.number().int().positive(),
  /** OS-0001. */
  codigo: z.string(),
  empresa: companyKeySchema,
  tipo: tipoDeOrdemDeServicoSchema,
  situacao: situacaoDaOrdemDeServicoSchema,
  coluna: colunaDoQuadroDeOrdensSchema.nullable(),
  prioridade: prioridadeDaOrdemDeServicoSchema,
  origem: origemDaOrdemDeServicoSchema,
  descricao: z.string(),
  cliente: pessoa,
  local: z.string().nullable(),
  /** Usina da O.S. (PLU-347): "82 kWp · Growatt" no card. */
  usina: z.object({ id: uuid, nome: z.string(), potenciaKwp: z.string(), plataforma: z.string() }).nullable(),
  tecnico: pessoa.nullable(),
  apoio: pessoa.nullable(),
  agendadaPara: isoDate.nullable(),
  /** Nova data do adiamento; preenchida só na adiada (= adiamento.novaData). */
  novaData: diaDoCalendario.nullable(),
  prazo: diaDoCalendario,
  /** Passou do prazo (ou do horário agendado) sem concluir. */
  atrasada: z.boolean(),
  fotos: z.number().int().nonnegative(),
  createdAt: isoDate,
});
export type OrdemDeServicoResumo = z.infer<typeof ordemDeServicoResumoSchema>;

export const ordemDeServicoSchema = ordemDeServicoResumoSchema.extend({
  canal: z.string().nullable(),
  uc: ucResumida.nullable(),
  equipamento: equipamentoSaida,
  checkinEm: isoDate.nullable(),
  laudo: z.object({ encontrado: z.string(), feito: z.string(), recomendacao: z.string().nullable(), registrado: registro }).nullable(),
  adiamento: registro.extend({ motivo: z.string(), novaData: diaDoCalendario }).nullable(),
  cancelamento: registro.extend({ motivo: z.string(), situacaoAnterior: situacaoDaOrdemDeServicoSchema }).nullable(),
  termo: termoDaOrdemSchema.nullable(),
  fotos: z.array(arquivoDaOrdemSchema),
  pedidosDeMaterial: z.array(pedidoDeMaterialDaOrdemSchema),
  ordemAnterior: z.object({ id: uuid, codigo: z.string() }).nullable(),
  /** A obra da O.S. (PLU-350). */
  obra: z.object({ id: uuid, nome: z.string() }).nullable().optional(),
  /** A usina cadastrada a partir desta O.S. de comissionamento (no máximo uma). */
  usinaDoComissionamento: z.object({ id: uuid, nome: z.string() }).nullable().optional(),
  historico: z.array(eventoDaOrdemSchema),
  criada: registro,
  concluidaEm: isoDate.nullable(),
  /** O que a pessoa da requisição pode fazer agora, já considerando situação e acesso. */
  acoesPermitidas: z.array(z.enum(acoesDaOrdemDeServico)),
  updatedAt: isoDate,
});
export type OrdemDeServico = z.infer<typeof ordemDeServicoSchema>;

const contagem = z.number().int().nonnegative();
export const contagensDasColunasSchema = z.object({
  para_agendar: contagem,
  agendadas: contagem,
  em_campo: contagem,
  colher_assinatura: contagem,
  concluidas: contagem,
  adiadas: contagem,
  canceladas: contagem,
  /** Grupo "Atenção" (não são colunas). */
  atrasadas: contagem,
  em_campo_hoje: contagem,
});
export type ContagensDasColunas = z.infer<typeof contagensDasColunasSchema>;

export const listarOrdensDeServicoRespostaSchema = z.object({
  itens: z.array(ordemDeServicoResumoSchema),
  total: z.number().int().nonnegative(),
  /** Por coluna e de atenção, com os filtros de empresa, tipo, técnico e busca (sem os de situação e atenção). */
  contagens: contagensDasColunasSchema,
  /** Dia do prazo da atrasada mais antiga ("a mais antiga há N dias"); nulo sem atrasadas. */
  atrasadaMaisAntigaEm: diaDoCalendario.nullable(),
});
export type ListarOrdensDeServicoResposta = z.infer<typeof listarOrdensDeServicoRespostaSchema>;

export const quadroDeOrdensRespostaSchema = z.object({
  colunas: z.array(
    z.object({
      coluna: colunaDoQuadroDeOrdensSchema,
      quantidade: z.number().int().nonnegative(),
      atrasadas: z.number().int().nonnegative(),
      ordens: z.array(ordemDeServicoResumoSchema),
    }),
  ),
});
export type QuadroDeOrdensResposta = z.infer<typeof quadroDeOrdensRespostaSchema>;

/** Opções dos menus: técnicos (pessoas da Engenharia) e os enums. */
export const opcoesDaEngenhariaRespostaSchema = z.object({
  tecnicos: z.array(pessoa),
  tipos: z.array(tipoDeOrdemDeServicoSchema),
  prioridades: z.array(prioridadeDaOrdemDeServicoSchema),
  origens: z.array(origemDaOrdemDeServicoSchema),
  /** Prazo sugerido para a Nova O.S. de cada tipo, pelo prazo padrão das Configurações (PLU-349). */
  prazoSugerido: z.record(tipoDeOrdemDeServicoSchema, diaDoCalendario),
});
export type OpcoesDaEngenhariaResposta = z.infer<typeof opcoesDaEngenhariaRespostaSchema>;

// ---------------------------------------------------------------- configurações (PLU-349)

/**
 * Prazo padrão de cada tipo, em dias úteis (feriado conta como dia útil), quando
 * ninguém mudou nas Configurações. 0 = no mesmo dia.
 */
export const PRAZO_PADRAO_DO_TIPO: Record<TipoDeOrdemDeServico, number> = {
  manutencao: 3, limpeza: 3, garantia: 3, emergencia: 0, visita_tecnica: 3, instalacao: 3, configuracao: 3,
  comissionamento: 3, orcamento_tecnico: 2, eletroposto: 3, grid_zero_bess: 3, analise_energia: 3, outros: 3,
};

export const configuracaoDeTipoDeOrdemSchema = z.object({
  tipo: tipoDeOrdemDeServicoSchema,
  prazoPadraoDiasUteis: z.number().int().min(0).max(30),
  /** O prazo que a Nova O.S. de hoje sugere. */
  prazoSugerido: diaDoCalendario,
  /** Quem agenda as O.S. do tipo; nulo = qualquer pessoa da Engenharia. */
  agendador: pessoa.nullable(),
  /** O.S. do tipo em andamento. */
  abertas: z.number().int().nonnegative(),
  /** Nulo enquanto vale o padrão. */
  atualizado: registro.nullable(),
});
export type ConfiguracaoDeTipoDeOrdem = z.infer<typeof configuracaoDeTipoDeOrdemSchema>;

/** `GET /engenharia/configuracoes`. As Plataformas entram com as Usinas (PLU-347). */
export const configuracoesDaEngenhariaRespostaSchema = z.object({
  tipos: z.array(configuracaoDeTipoDeOrdemSchema),
  /** Gerente da Engenharia ou plataforma. */
  podeEditar: z.boolean(),
});
export type ConfiguracoesDaEngenharia = z.infer<typeof configuracoesDaEngenhariaRespostaSchema>;

/** `PUT /engenharia/configuracoes/tipos/:tipo`. */
export const editarConfiguracaoDeTipoDeOrdemSchema = z
  .object({ prazoPadraoDiasUteis: z.number().int().min(0, "de 0 a 30").max(30, "de 0 a 30"), agendadorId: uuid.nullable() })
  .strict();
export type EditarConfiguracaoDeTipoDeOrdem = z.infer<typeof editarConfiguracaoDeTipoDeOrdemSchema>;

// ---------------------------------------------------------------- agenda de campo (PLU-346)

/**
 * `GET /engenharia/agenda?semana=&empresa=&tecnicoId=`: a semana × técnico. A
 * semana é qualquer dia dela (a API usa a segunda). Reagendar é a ação `agendar`
 * da O.S. (`POST /engenharia/ordens-de-servico/:id/acoes`), com as mesmas regras.
 */
export const agendaQuerySchema = z
  .object({ semana: diaDoCalendario.optional(), empresa: companyKeySchema.optional(), tecnicoId: uuid.optional() })
  .strict();
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;

const diaDaAgenda = z.object({ dia: diaDoCalendario, ordens: z.array(ordemDeServicoResumoSchema) });

export const agendaRespostaSchema = z.object({
  hoje: diaDoCalendario,
  semana: z.object({ inicio: diaDoCalendario, fim: diaDoCalendario, anterior: diaDoCalendario, proxima: diaDoCalendario }),
  /** Sempre os 7 dias, de segunda a domingo. `util` é segunda a sexta (feriado conta como dia útil). Orientação à web: mostrar sábado e domingo só se tiverem O.S. */
  dias: z.array(z.object({ dia: diaDoCalendario, util: z.boolean(), hoje: z.boolean() })),
  /** Uma linha por técnico (ativos da Engenharia e quem aparece numa O.S. da semana), com as O.S. de cada dia, pela hora. */
  linhas: z.array(z.object({ tecnico: pessoa, dias: z.array(diaDaAgenda) })),
  /** O.S. agendadas sem técnico (não deveria haver; o agendamento exige técnico). */
  semTecnico: z.array(diaDaAgenda),
  /** Abertas e adiadas, pelo prazo (até 100): o bloco "Para agendar". */
  paraAgendar: z.array(ordemDeServicoResumoSchema),
});
export type AgendaDeCampo = z.infer<typeof agendaRespostaSchema>;

// ---------------------------------------------------------------- visão geral (PLU-349)

/** `GET /engenharia/visao-geral?empresa=`: o dia da Engenharia. */
export const visaoGeralDaEngenhariaQuerySchema = z.object({ empresa: companyKeySchema.optional() }).strict();
export type VisaoGeralDaEngenhariaQuery = z.infer<typeof visaoGeralDaEngenhariaQuerySchema>;

export const visaoGeralDaEngenhariaRespostaSchema = z.object({
  hoje: diaDoCalendario,
  /** Metric cards. `usinasComAtencao` fica nulo até as Usinas (PLU-347). */
  metricas: z.object({
    emAberto: z.number().int().nonnegative(),
    atrasadas: z.number().int().nonnegative(),
    emCampoHoje: z.number().int().nonnegative(),
    usinasComAtencao: z.number().int().nonnegative().nullable(),
  }),
  /** Agendadas para hoje e em campo, pela hora. */
  campoHoje: z.array(ordemDeServicoResumoSchema),
  /** As atrasadas mais antigas (até 5) e o total. */
  atrasadas: z.object({ total: z.number().int().nonnegative(), itens: z.array(ordemDeServicoResumoSchema) }),
  /** Tarefas de hoje da Engenharia (as atrasadas primeiro, até 8) e o progresso do dia. */
  tarefasHoje: z.object({ concluidas: z.number().int().nonnegative(), total: z.number().int().nonnegative(), itens: z.array(ocorrenciaDeTarefaSchema) }),
  /** Monitoramento do dia (PLU-347): "5 de 9 plataformas" e as pendentes. Protocolos da semana: nulo até a PLU-348. */
  monitoramentoHoje: monitoramentoDaVisaoGeralSchema.nullable(),
  protocolos: z.null(),
});
export type VisaoGeralDaEngenharia = z.infer<typeof visaoGeralDaEngenhariaRespostaSchema>;

/** OS-0001. */
export function codigoDaOrdemDeServico(numero: number): string {
  return `OS-${String(numero).padStart(4, "0")}`;
}
