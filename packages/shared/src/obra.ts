import { z } from "zod";

import { companyKeySchema } from "./organization.js";
import { isoDate, uuid } from "./primitivas.js";

/**
 * Contratos do processo de Execução e Gestão de Obras (POP-OBR-001 v1 +
 * FLX-OBR-001, 10/08/2026).
 *
 * Cobre estados da Obra, evidência de campo, segurança do trabalho
 * (EPI/APR/incidente/liberação), pendência de campo, medição técnica e
 * versionamento de projeto — POP §2, §3, §5.1, §6, §8 e §9.
 */

// --- Estados do processo (POP §2) -----------------------------------------

export const obraEtapaSchema = z.enum([
  "obra_criada",
  "projeto_em_elaboracao",
  "em_aprovacao_tecnica",
  "projeto_aprovado",
  "liberacao_campo_pendente",
  "liberada_para_execucao",
  "em_execucao",
  "pendencia_campo",
  "medicao_tecnica",
  "medicao_aprovada",
  "obra_concluida_tecnicamente",
  "obra_encerrada",
]);
export type ObraEtapa = z.infer<typeof obraEtapaSchema>;

/** `obra_encerrada` é terminal — não há transição para fora dele (POP §2, item 12). */
export const OBRA_ETAPA_TERMINAL: ObraEtapa = "obra_encerrada";

// --- Evidência de campo (POP §5.1) ----------------------------------------

/**
 * Formatos aceitos na v1. Assinatura digital e vídeo ficam de fora — o POP
 * §7 marca os dois como "em aberto"; incluí-los aqui inventaria decisão que o
 * documento explicitamente não tomou.
 */
export const evidenciaTipoSchema = z.enum(["imagem", "pdf", "documento", "checklist"]);
export type EvidenciaTipo = z.infer<typeof evidenciaTipoSchema>;

// --- Segurança do trabalho (POP §8) ---------------------------------------

/** Quem pode assinar/liberar, conforme POP §8.4. */
export const papelLiberadorSchema = z.enum(["seguranca", "supervisor", "engenheiro"]);
export type PapelLiberador = z.infer<typeof papelLiberadorSchema>;

/**
 * Tipos de pendência de segurança que bloqueiam avanço (POP §8.2/§8.3).
 * A gravidade do incidente fica como texto livre — o POP §7 marca a escala
 * de gravidade como algo a validar com o time de segurança, não uma decisão
 * já tomada.
 */
export const incidenteGravidadeMinimaQueBloqueia = "grave";

// --- Leitura ---------------------------------------------------------------

/**
 * A Obra em si (nome, empresa, cliente) já é cadastrada pelo módulo de
 * Compras (`POST /compras/obras`, POP-COMP-001) — é a mesma entidade que o
 * comentário do model Prisma `Obra` documenta. Este módulo não recria o
 * cadastro; opera etapa/evidência/segurança sobre uma Obra que já existe.
 */
export const obraExecucaoSchema = z.object({
  id: uuid,
  companyId: companyKeySchema,
  nome: z.string(),
  etapaAtual: obraEtapaSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ObraExecucao = z.infer<typeof obraExecucaoSchema>;

export const passagemDeObraSchema = z.object({
  id: uuid,
  etapa: obraEtapaSchema,
  entrouEm: isoDate,
  saiuEm: isoDate.nullable(),
  responsavelId: uuid.nullable(),
});
export type PassagemDeObra = z.infer<typeof passagemDeObraSchema>;

export const evidenciaDeObraSchema = z.object({
  id: uuid,
  etapa: obraEtapaSchema,
  autorId: uuid,
  tipo: evidenciaTipoSchema,
  descricao: z.string(),
  statusRelacionado: z.string().nullable(),
  arquivoNome: z.string(),
  createdAt: isoDate,
});
export type EvidenciaDeObra = z.infer<typeof evidenciaDeObraSchema>;

export const registroEpiSchema = z.object({
  id: uuid,
  colaboradorId: uuid.nullable(),
  equipeDescricao: z.string().nullable(),
  epiExigido: z.string(),
  conferidoEm: isoDate.nullable(),
  conferidoPorId: uuid.nullable(),
  createdAt: isoDate,
});
export type RegistroEpi = z.infer<typeof registroEpiSchema>;

export const registroAprSchema = z.object({
  id: uuid,
  atividade: z.string(),
  segurancaAssinouId: uuid.nullable(),
  segurancaAssinouEm: isoDate.nullable(),
  supervisorAssinouId: uuid.nullable(),
  supervisorAssinouEm: isoDate.nullable(),
  createdAt: isoDate,
});
export type RegistroApr = z.infer<typeof registroAprSchema>;

export const incidenteSchema = z.object({
  id: uuid,
  ocorreuEm: isoDate,
  local: z.string(),
  descricao: z.string(),
  envolvidos: z.string().nullable(),
  tipo: z.string(),
  gravidade: z.string(),
  acaoImediata: z.string().nullable(),
  registradoPorId: uuid,
  responsavelTratativaId: uuid.nullable(),
  createdAt: isoDate,
});
export type Incidente = z.infer<typeof incidenteSchema>;

export const liberacaoSegurancaSchema = z.object({
  id: uuid,
  incidenteId: uuid.nullable(),
  papelLiberador: papelLiberadorSchema,
  liberadoPorId: uuid,
  liberadoEm: isoDate,
  revogadoPorId: uuid.nullable(),
  revogadoEm: isoDate.nullable(),
  motivoRevogacao: z.string().nullable(),
});
export type LiberacaoSeguranca = z.infer<typeof liberacaoSegurancaSchema>;

// --- Requests ----------------------------------------------------------------

export const avancarEtapaDeObraRequestSchema = z
  .object({
    companyId: companyKeySchema,
    paraEtapa: obraEtapaSchema,
    responsavelId: uuid.optional(),
  })
  .strict();
export type AvancarEtapaDeObraRequest = z.infer<typeof avancarEtapaDeObraRequestSchema>;

export const reabrirProjetoRequestSchema = z
  .object({
    companyId: companyKeySchema,
    justificativa: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type ReabrirProjetoRequest = z.infer<typeof reabrirProjetoRequestSchema>;

export const registrarEvidenciaRequestSchema = z
  .object({
    companyId: companyKeySchema,
    tipo: evidenciaTipoSchema,
    descricao: z.string().trim().min(1).max(2000),
    statusRelacionado: z.string().trim().max(200).optional(),
  })
  .strict();
export type RegistrarEvidenciaRequest = z.infer<typeof registrarEvidenciaRequestSchema>;

export const registrarEpiRequestSchema = z
  .object({
    companyId: companyKeySchema,
    colaboradorId: uuid.optional(),
    equipeDescricao: z.string().trim().max(500).optional(),
    epiExigido: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.colaboradorId && !value.equipeDescricao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["colaboradorId"],
        message: "informe o colaborador ou a descrição da equipe (POP §8.1)",
      });
    }
  });
export type RegistrarEpiRequest = z.infer<typeof registrarEpiRequestSchema>;

export const conferirEpiRequestSchema = z.object({ companyId: companyKeySchema }).strict();
export type ConferirEpiRequest = z.infer<typeof conferirEpiRequestSchema>;

export const registrarAprRequestSchema = z
  .object({
    companyId: companyKeySchema,
    atividade: z.string().trim().min(1).max(500),
  })
  .strict();
export type RegistrarAprRequest = z.infer<typeof registrarAprRequestSchema>;

export const assinarAprPapelSchema = z.enum(["seguranca", "supervisor"]);
export type AssinarAprPapel = z.infer<typeof assinarAprPapelSchema>;

export const assinarAprRequestSchema = z
  .object({
    companyId: companyKeySchema,
    papel: assinarAprPapelSchema,
  })
  .strict();
export type AssinarAprRequest = z.infer<typeof assinarAprRequestSchema>;

export const registrarIncidenteRequestSchema = z
  .object({
    companyId: companyKeySchema,
    ocorreuEm: isoDate,
    local: z.string().trim().min(1).max(300),
    descricao: z.string().trim().min(1).max(3000),
    envolvidos: z.string().trim().max(1000).optional(),
    tipo: z.string().trim().min(1).max(200),
    gravidade: z.string().trim().min(1).max(50),
    acaoImediata: z.string().trim().max(2000).optional(),
    responsavelTratativaId: uuid.optional(),
  })
  .strict();
export type RegistrarIncidenteRequest = z.infer<typeof registrarIncidenteRequestSchema>;

export const registrarLiberacaoRequestSchema = z
  .object({
    companyId: companyKeySchema,
    papelLiberador: papelLiberadorSchema,
    incidenteId: uuid.optional(),
  })
  .strict();
export type RegistrarLiberacaoRequest = z.infer<typeof registrarLiberacaoRequestSchema>;

export const revogarLiberacaoRequestSchema = z
  .object({
    companyId: companyKeySchema,
    motivoRevogacao: z.string().trim().min(1).max(1000),
  })
  .strict();
export type RevogarLiberacaoRequest = z.infer<typeof revogarLiberacaoRequestSchema>;

// --- Pendência de campo (POP §6) --------------------------------------------

/**
 * Tipos mínimos do POP §6. "Clima" fica de fora — o POP §7 marca "se será
 * tipo próprio" como em aberto; inventar aqui decidiria por ele.
 */
export const pendenciaTipoSchema = z.enum([
  "material_insuficiente",
  "divergencia_projeto",
  "condicao_insegura",
  "acesso_indisponivel",
  "cliente_pendente",
  "equipe_indisponivel",
  "outro",
]);
export type PendenciaTipo = z.infer<typeof pendenciaTipoSchema>;

export const pendenciaStatusSchema = z.enum(["aberta", "encerrada"]);
export type PendenciaStatus = z.infer<typeof pendenciaStatusSchema>;

export const pendenciaDeCampoSchema = z.object({
  id: uuid,
  tipo: pendenciaTipoSchema,
  prioridade: z.string().nullable(),
  status: pendenciaStatusSchema,
  descricao: z.string(),
  abertaPorId: uuid,
  encerradoPorId: uuid.nullable(),
  encerradoEm: isoDate.nullable(),
  createdAt: isoDate,
});
export type PendenciaDeCampo = z.infer<typeof pendenciaDeCampoSchema>;

export const registrarPendenciaRequestSchema = z
  .object({
    companyId: companyKeySchema,
    tipo: pendenciaTipoSchema,
    descricao: z.string().trim().min(1).max(2000),
  })
  .strict();
export type RegistrarPendenciaRequest = z.infer<typeof registrarPendenciaRequestSchema>;

export const classificarPrioridadeRequestSchema = z
  .object({
    companyId: companyKeySchema,
    prioridade: z.string().trim().min(1).max(50),
  })
  .strict();
export type ClassificarPrioridadeRequest = z.infer<typeof classificarPrioridadeRequestSchema>;

export const encerrarPendenciaRequestSchema = z.object({ companyId: companyKeySchema }).strict();
export type EncerrarPendenciaRequest = z.infer<typeof encerrarPendenciaRequestSchema>;

// --- Medição técnica e avanço físico (POP §9) -------------------------------

export const medicaoStatusSchema = z.enum(["pendente", "aprovada", "em_correcao"]);
export type MedicaoStatus = z.infer<typeof medicaoStatusSchema>;

export const medicaoTecnicaSchema = z.object({
  id: uuid,
  etapaExecutada: z.string(),
  pendenciasRemanescentes: z.string().nullable(),
  status: medicaoStatusSchema,
  responsavelId: uuid,
  aprovadoPorId: uuid.nullable(),
  aprovadoEm: isoDate.nullable(),
  createdAt: isoDate,
});
export type MedicaoTecnica = z.infer<typeof medicaoTecnicaSchema>;

/**
 * `percentualOuMarco` é texto livre de propósito. O POP §7, item 8, marca o
 * critério de medição (percentual físico, marco, item de checklist ou etapa)
 * como algo a decidir por tipo de obra — uma coluna numérica aqui fixaria
 * "percentual" como a resposta antes de o documento decidir.
 */
export const lancarMedicaoRequestSchema = z
  .object({
    companyId: companyKeySchema,
    etapaExecutada: z.string().trim().min(1).max(500),
    pendenciasRemanescentes: z.string().trim().max(2000).optional(),
  })
  .strict();
export type LancarMedicaoRequest = z.infer<typeof lancarMedicaoRequestSchema>;

export const aprovarMedicaoRequestSchema = z.object({ companyId: companyKeySchema }).strict();
export type AprovarMedicaoRequest = z.infer<typeof aprovarMedicaoRequestSchema>;

export const solicitarCorrecaoMedicaoRequestSchema = z
  .object({
    companyId: companyKeySchema,
    motivo: z.string().trim().min(1).max(2000),
  })
  .strict();
export type SolicitarCorrecaoMedicaoRequest = z.infer<typeof solicitarCorrecaoMedicaoRequestSchema>;

// --- Versionamento de projeto (POP §3) --------------------------------------

/**
 * `elaboracao → em_aprovacao → aprovado | elaboracao` é o ciclo normal de uma
 * versão. `superado` não é alcançado por transição desta versão: nasce quando
 * uma versão seguinte é criada (POP §3 — "todo retorno gera nova versão,
 * nunca sobrescreve"), e é por isso que a reabertura de `projeto_aprovado`
 * cria uma linha nova em vez de mover a existente.
 */
export const projetoVersaoStatusSchema = z.enum(["elaboracao", "em_aprovacao", "aprovado", "superado"]);
export type ProjetoVersaoStatus = z.infer<typeof projetoVersaoStatusSchema>;

export const projetoVersaoSchema = z.object({
  id: uuid,
  versao: z.number().int().positive(),
  status: projetoVersaoStatusSchema,
  descricao: z.string(),
  autorId: uuid,
  aprovadoPorId: uuid.nullable(),
  aprovadoEm: isoDate.nullable(),
  justificativaReabertura: z.string().nullable(),
  arquivoNome: z.string().nullable(),
  createdAt: isoDate,
});
export type ProjetoVersao = z.infer<typeof projetoVersaoSchema>;

export const criarVersaoDeProjetoRequestSchema = z
  .object({
    companyId: companyKeySchema,
    descricao: z.string().trim().min(1).max(2000),
  })
  .strict();
export type CriarVersaoDeProjetoRequest = z.infer<typeof criarVersaoDeProjetoRequestSchema>;

export const enviarProjetoParaAprovacaoRequestSchema = z.object({ companyId: companyKeySchema }).strict();
export type EnviarProjetoParaAprovacaoRequest = z.infer<typeof enviarProjetoParaAprovacaoRequestSchema>;

export const aprovarProjetoRequestSchema = z.object({ companyId: companyKeySchema }).strict();
export type AprovarProjetoRequest = z.infer<typeof aprovarProjetoRequestSchema>;

export const solicitarRevisaoDeProjetoRequestSchema = z
  .object({
    companyId: companyKeySchema,
    motivo: z.string().trim().min(1).max(2000),
  })
  .strict();
export type SolicitarRevisaoDeProjetoRequest = z.infer<typeof solicitarRevisaoDeProjetoRequestSchema>;

// --- Detalhe completo --------------------------------------------------------

export const obraExecucaoDetalheSchema = obraExecucaoSchema.extend({
  etapas: z.array(passagemDeObraSchema),
  evidencias: z.array(evidenciaDeObraSchema),
  registrosEpi: z.array(registroEpiSchema),
  registrosApr: z.array(registroAprSchema),
  incidentes: z.array(incidenteSchema),
  liberacoes: z.array(liberacaoSegurancaSchema),
  pendencias: z.array(pendenciaDeCampoSchema),
  medicoes: z.array(medicaoTecnicaSchema),
  versoesDeProjeto: z.array(projetoVersaoSchema),
});
export type ObraExecucaoDetalhe = z.infer<typeof obraExecucaoDetalheSchema>;
