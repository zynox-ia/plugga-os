import { z } from "zod";

import { diaDoCalendario } from "./compras.js";
import { companyKeySchema } from "./organization.js";
import { isoDate, uuid } from "./primitivas.js";
import { potenciaKwpSchema } from "./usinas.js";

/**
 * Obras com marcos, documentos e cronograma (PLU-350). A obra é também o
 * **centro de custo** do Financeiro (CC1): um cadastro só, Cliente → Obra, com
 * o tipo. O cronograma detalhado continua no MS Project (D30), anexado com
 * versões; aqui ficam os marcos.
 *
 * - Início pode ser no passado (obra em andamento); a entrega prevista vem pelo
 *   menos no dia seguinte ao início e, em obra criada agora, a partir de amanhã.
 * - A obra nasce com os 6 marcos padrão (E8), distribuídos entre o início e a
 *   entrega. "Marcar como feito" vale para o próximo marco, a partir do início.
 *   Um marco pendente com a data passada, ou feito depois dela, está atrasado.
 * - Documentos e cronograma com versões, sem exclusão. O projeto elétrico pode
 *   apontar o protocolo na distribuidora (E11).
 * - O orçamento é do gerente da Engenharia (CC-D6); o Financeiro só lê. Os
 *   custos da obra (pedidos e material do estoque, CC4/CC5) são do Financeiro.
 *
 * Rotas (atrás do portão da Engenharia):
 *
 * ```
 * GET   /engenharia/obras?empresa=&busca=&situacao=&atrasadas=sim&clienteId=
 * POST  /engenharia/obras                                 (CadastrarObra → Obra)
 * GET   /engenharia/obras/opcoes                          responsáveis e catálogos
 * GET   /engenharia/obras/clientes?busca=                 clientes com UCs (a mesma resposta da busca das O.S.)
 * GET   /engenharia/obras/:id                             ficha (Obra)
 * PATCH /engenharia/obras/:id                             (EditarObra → Obra)
 * POST  /engenharia/obras/:id/marcos/:marcoId/feito       → Obra
 * PATCH /engenharia/obras/:id/marcos/:marcoId             (ReprogramarMarco → Obra)
 * POST  /engenharia/obras/:id/documentos                  multipart: arquivo + EnviarDocumentoDeObra → Obra
 * GET   /engenharia/obras/:id/documentos/:documentoId     baixa a versão
 * ```
 */

// ---------------------------------------------------------------- enums e catálogos

/** Tipo do centro de custo (CC1). A Engenharia cria obras com cliente; o interno é do Financeiro. */
export const tiposDeObra = ["obra_solar", "projeto", "manutencao", "gestao_de_energia", "interno"] as const;
export const tipoDeObraSchema = z.enum(tiposDeObra);
export type TipoDeObra = z.infer<typeof tipoDeObraSchema>;

/** Os 6 marcos padrão (E8), na ordem. */
export const MARCOS_PADRAO_DA_OBRA = ["Contrato assinado", "Projeto aprovado", "Material entregue", "Instalação concluída", "Comissionamento", "Termo de entrega"] as const;

export const categoriasDeDocumentoDeObra = ["cronograma", "evte", "rvt", "grd", "ata", "projeto_eletrico", "outro"] as const;
export const categoriaDeDocumentoDeObraSchema = z.enum(categoriasDeDocumentoDeObra);
export type CategoriaDeDocumentoDeObra = z.infer<typeof categoriaDeDocumentoDeObraSchema>;
export const ROTULO_DA_CATEGORIA_DE_DOCUMENTO: Readonly<Record<CategoriaDeDocumentoDeObra, string>> = {
  cronograma: "Cronograma do MS Project",
  evte: "EVTE",
  rvt: "RVT",
  grd: "GRD",
  ata: "Ata",
  projeto_eletrico: "Projeto elétrico",
  outro: "Documento",
};

export const DOCUMENTO_DE_OBRA_MAX_BYTES = 50 * 1024 * 1024;
/** PDF, imagem ou o arquivo do MS Project (.mpp), conferidos pelo conteúdo. */
export const tiposDeDocumentoDeObra = ["application/pdf", "image/jpeg", "image/png", "application/vnd.ms-project"] as const;

export const situacoesDaObra = ["sem_marcos", "em_andamento", "entregue"] as const;
export type SituacaoDaObra = (typeof situacoesDaObra)[number];

// ---------------------------------------------------------------- entradas

const texto = (min: number, max: number, problema: string) => z.string().trim().min(min, problema).max(max);
const valorEmReais = z
  .string()
  .trim()
  .regex(/^\d{1,12}([.,]\d{1,2})?$/, "use um valor como 125000,50")
  .transform((v) => v.replace(",", "."))
  // O mesmo do CHECK obras_orcamento_positivo: zero vira 400 de campo, não 500.
  .refine((v) => Number(v) > 0, "o orçamento precisa ser maior que zero");

export const cadastrarObraSchema = z
  .object({
    empresa: companyKeySchema,
    clienteId: uuid,
    nome: texto(1, 120, "dê um nome à obra"),
    /** Sem o interno, que não tem cliente (é do Financeiro). */
    tipo: tipoDeObraSchema.exclude(["interno"]).default("obra_solar"),
    potenciaKwp: potenciaKwpSchema,
    responsavelId: uuid.nullable().optional(),
    /** Pode ser no passado: obra já em andamento. */
    inicioEm: diaDoCalendario,
    /** No mínimo no dia seguinte ao início e a partir de amanhã. */
    entregaPrevistaEm: diaDoCalendario,
  })
  .strict()
  .refine((o) => o.entregaPrevistaEm > o.inicioEm, { message: "a entrega vem depois do início", path: ["entregaPrevistaEm"] });
export type CadastrarObra = z.infer<typeof cadastrarObraSchema>;

export const editarObraSchema = z
  .object({
    nome: texto(1, 120, "dê um nome à obra").optional(),
    potenciaKwp: potenciaKwpSchema.optional(),
    responsavelId: uuid.nullable().optional(),
    /** Só na obra que ainda não tem início (as criadas pelo Compras). */
    inicioEm: diaDoCalendario.optional(),
    entregaPrevistaEm: diaDoCalendario.optional(),
    /** Só o gerente da Engenharia (CC-D6). */
    orcamento: valorEmReais.nullable().optional(),
    ativa: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "informe ao menos um campo");
export type EditarObra = z.infer<typeof editarObraSchema>;

/** Reprograma um marco pendente, dentro do período da obra e não no passado. */
export const reprogramarMarcoSchema = z.object({ previstoEm: diaDoCalendario }).strict();
export type ReprogramarMarco = z.infer<typeof reprogramarMarcoSchema>;

/** Campos do multipart do documento. `substitui`: o documento atual que esta versão troca. */
export const enviarDocumentoDeObraSchema = z
  .object({
    categoria: categoriaDeDocumentoDeObraSchema,
    substitui: uuid.optional(),
    /** Só no projeto elétrico: o protocolo na distribuidora (E11). */
    protocoloId: uuid.optional(),
  })
  .strict()
  .refine((d) => !d.protocoloId || d.categoria === "projeto_eletrico", { message: "o protocolo vale só para o projeto elétrico", path: ["protocoloId"] });
export type EnviarDocumentoDeObra = z.infer<typeof enviarDocumentoDeObraSchema>;

export const listarObrasQuerySchema = z
  .object({
    empresa: companyKeySchema.optional(),
    busca: z.string().trim().min(1).max(150).optional(),
    situacao: z.enum(situacoesDaObra).optional(),
    /** Só as com marco atrasado. */
    atrasadas: z.enum(["sim"]).optional(),
    clienteId: uuid.optional(),
    /** Inclui as inativas. */
    inativas: z.enum(["incluir"]).optional(),
  })
  .strict();
export type ListarObrasQuery = z.infer<typeof listarObrasQuerySchema>;

// ---------------------------------------------------------------- saídas

const pessoa = z.object({ id: uuid, nome: z.string() });
const registro = z.object({ por: pessoa.nullable(), em: isoDate });

export const proximoMarcoSchema = z.object({ nome: z.string(), previstoEm: diaDoCalendario, atrasado: z.boolean() });

export const obraResumoSchema = z.object({
  id: uuid,
  nome: z.string(),
  empresa: companyKeySchema,
  tipo: tipoDeObraSchema,
  cliente: pessoa.nullable(),
  potenciaKwp: z.string().nullable(),
  responsavel: pessoa.nullable(),
  inicioEm: diaDoCalendario.nullable(),
  entregaPrevistaEm: diaDoCalendario.nullable(),
  situacao: z.enum(situacoesDaObra),
  marcos: z.object({ feitos: z.number().int().nonnegative(), total: z.number().int().nonnegative(), proximo: proximoMarcoSchema.nullable(), atrasados: z.number().int().nonnegative() }),
  documentos: z.number().int().nonnegative(),
  osAbertas: z.number().int().nonnegative(),
  ativa: z.boolean(),
});
export type ObraResumo = z.infer<typeof obraResumoSchema>;

export const marcoDaObraSchema = z.object({
  id: uuid,
  ordem: z.number().int().positive(),
  nome: z.string(),
  previstoEm: diaDoCalendario,
  feito: registro.nullable(),
  /** Pendente com a data passada, ou feito depois dela. */
  atrasado: z.boolean(),
  /** O próximo da fila: o único que pode ser marcado como feito. */
  proximo: z.boolean(),
});
export type MarcoDaObra = z.infer<typeof marcoDaObraSchema>;

const versaoDoDocumento = z.object({ id: uuid, versao: z.number().int().positive(), nome: z.string(), tamanhoBytes: z.number().int().positive(), mime: z.string(), enviado: registro, url: z.string() });

export const documentoDaObraSchema = versaoDoDocumento.extend({
  serieId: uuid,
  categoria: categoriaDeDocumentoDeObraSchema,
  protocolo: z.object({ id: uuid, numero: z.string() }).nullable(),
  /** Da mais recente à mais antiga, sem a atual. */
  versoesAnteriores: z.array(versaoDoDocumento),
});
export type DocumentoDaObra = z.infer<typeof documentoDaObraSchema>;

export const obraSchema = obraResumoSchema.extend({
  /** Só o gerente da Engenharia muda (CC-D6). */
  orcamento: z.string().nullable(),
  marcosDaObra: z.array(marcoDaObraSchema),
  /** Os documentos atuais; o cronograma primeiro. */
  documentosDaObra: z.array(documentoDaObraSchema),
  ordens: z.array(z.object({ id: uuid, codigo: z.string(), tipo: z.string(), situacao: z.string(), descricao: z.string(), prazo: diaDoCalendario })),
  /** Custos do centro (pedidos e material do estoque): do Financeiro, pendente das decisões CC-D1 a CC-D8. */
  custos: z.null(),
  criada: registro,
  acoesPermitidas: z.array(z.enum(["editar", "marcar_marco", "reprogramar_marco", "anexar", "editar_orcamento"])),
});
export type Obra = z.infer<typeof obraSchema>;

export const listarObrasRespostaSchema = z.object({
  hoje: diaDoCalendario,
  itens: z.array(obraResumoSchema),
  total: z.number().int().nonnegative(),
  /** Com os filtros, sem o de situação e o de atrasadas. */
  contagens: z.object({ emAndamento: z.number().int().nonnegative(), comMarcoAtrasado: z.number().int().nonnegative(), entregues: z.number().int().nonnegative() }),
});
export type ListarObrasResposta = z.infer<typeof listarObrasRespostaSchema>;

/** Opções da Nova obra: responsáveis (pessoas da Engenharia) e os catálogos. */
export const opcoesDasObrasRespostaSchema = z.object({
  responsaveis: z.array(pessoa),
  tipos: z.array(tipoDeObraSchema),
  categoriasDeDocumento: z.array(categoriaDeDocumentoDeObraSchema),
  marcosPadrao: z.array(z.string()),
});
export type OpcoesDasObrasResposta = z.infer<typeof opcoesDasObrasRespostaSchema>;

export const LIMITE_DA_LISTA_DE_OBRAS = 500;
