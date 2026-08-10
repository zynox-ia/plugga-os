import { z } from "zod";

/**
 * Contratos do processo de Execução e Gestão de Obras (POP-OBR-001 v1 +
 * FLX-OBR-001, 10/08/2026).
 *
 * Escopo desta primeira fatia: estados da Obra, evidência de campo e
 * segurança do trabalho (EPI/APR/incidente/liberação) — POP §2, §5.1 e §8.
 * Projeto versionado, pendência de campo e medição técnica ficam para depois;
 * o POP já as descreve, mas o ticket que trouxe este arquivo pediu só estas
 * três fatias.
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
