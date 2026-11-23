import { z } from "zod";

import { diaDoCalendario, quantidadeString } from "./compras.js";
import { companyKeySchema } from "./organization.js";
import { isoDate, uuid } from "./primitivas.js";

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

/** Erro 409 do check-in antes do dia agendado, sem `confirmarAntecipado`. */
export const CODIGO_CHECKIN_ANTECIPADO = "checkin_antecipado";

// ---------------------------------------------------------------- arquivos

export const ARQUIVO_DE_ORDEM_MAX_BYTES = 25 * 1024 * 1024;
/** Fotos do laudo; conferidas pelo conteúdo, não pela extensão. */
export const tiposDeFotoDaOrdem = ["image/jpeg", "image/png", "image/webp"] as const;
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
    ...equipamentoEntrada,
  })
  .strict();
export type CriarOrdemDeServico = z.infer<typeof criarOrdemDeServicoSchema>;

/** Dados e equipamento; vale enquanto a O.S. não está concluída nem cancelada. */
export const editarOrdemDeServicoSchema = z
  .object({
    tipo: tipoDeOrdemDeServicoSchema.optional(),
    ucId: uuid.nullable().optional(),
    local: textoOpcional(300),
    descricao: texto(1, 2000, "descreva o serviço").optional(),
    prioridade: prioridadeDaOrdemDeServicoSchema.optional(),
    prazo: diaDoCalendario.optional(),
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
  tecnico: pessoa.nullable(),
  apoio: pessoa.nullable(),
  agendadaPara: isoDate.nullable(),
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
});
export type OpcoesDaEngenhariaResposta = z.infer<typeof opcoesDaEngenhariaRespostaSchema>;

/** OS-0001. */
export function codigoDaOrdemDeServico(numero: number): string {
  return `OS-${String(numero).padStart(4, "0")}`;
}
