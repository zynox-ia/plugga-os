import { z } from "zod";

import { diaDoCalendario } from "./compras.js";
import { companyKeySchema } from "./organization.js";
import { isoDate, uuid } from "./primitivas.js";
import { protocoloDaUcSchema } from "./protocolos.js";

/**
 * Usinas e monitoramento do dia (PLU-347), no lugar das 9 tarefas diárias
 * "olhei a plataforma" do Bitrix.
 *
 * - **Plataforma de inversor**: Livoltek, Solarman, Solis, Solax, GoodWe,
 *   FusionSolar, Growatt, Solplanet, Hypon Cloud (cadastro nas Configurações).
 *   A observação de acesso diz ONDE está o acesso (ex.: "login da Waze no cofre");
 *   nunca a senha: a API recusa texto com cara de credencial.
 * - **Usina**: empresa, cliente e UC, potência em kWp, plataforma e inversor.
 * - **Conferência do dia**: uma por plataforma e empresa por dia, com o print
 *   obrigatório e cada usina como normal, anomalia ou sem comunicação. A anomalia
 *   (ou a falta de comunicação) pode abrir a O.S. já preenchida, com a origem
 *   "monitoramento". A conferência fechada não muda (P1). Quando todas as
 *   plataformas do dia estão conferidas, a tarefa automática de monitoramento
 *   se conclui sozinha.
 *
 * Rotas (atrás do portão da Engenharia):
 *
 * ```
 * GET   /engenharia/usinas                       lista (ListarUsinasQuery → ListarUsinasResposta)
 * POST  /engenharia/usinas                       nova usina (CriarUsina → Usina)
 * GET   /engenharia/usinas/:id                   ficha (Usina)
 * PATCH /engenharia/usinas/:id                   (EditarUsina → Usina)
 * GET   /engenharia/monitoramento?empresa=       o dia (MonitoramentoDoDia)
 * POST  /engenharia/monitoramento/:plataformaId/conferir   multipart: empresa, resultados (JSON), arquivo `print` → MonitoramentoDoDia
 * GET   /engenharia/monitoramento/conferencias/:id/print   o print (inline)
 * POST  /engenharia/usinas/importacao            multipart: arquivo (CSV), mapeamento (JSON), empresaPadrao, gravar → ImportacaoDeUsinas
 * GET   /engenharia/plataformas                  (ListarPlataformasResposta)
 * POST  /engenharia/plataformas                  (CriarPlataforma → ListarPlataformasResposta), gerente
 * PATCH /engenharia/plataformas/:id              (EditarPlataforma → ListarPlataformasResposta), gerente
 * ```
 */

// ---------------------------------------------------------------- enums

export const situacoesDoMonitoramento = ["normal", "anomalia", "sem_comunicacao"] as const;
export const situacaoDoMonitoramentoSchema = z.enum(situacoesDoMonitoramento);
export type SituacaoDoMonitoramento = z.infer<typeof situacaoDoMonitoramentoSchema>;

export const origensDaUsina = ["manual", "importacao", "comissionamento"] as const;
export const origemDaUsinaSchema = z.enum(origensDaUsina);
export type OrigemDaUsina = z.infer<typeof origemDaUsinaSchema>;

export const PRINT_DA_CONFERENCIA_MAX_BYTES = 25 * 1024 * 1024;
/** O print da plataforma: imagem ou PDF, conferidos pelo conteúdo. */
export const tiposDePrintDaConferencia = ["image/jpeg", "image/png", "application/pdf"] as const;

/** Rótulo e dica do campo de acesso da plataforma: onde está o acesso, nunca a senha. */
export const ROTULO_DO_ACESSO_DA_PLATAFORMA = "Onde está o acesso";
export const DICA_DO_ACESSO_DA_PLATAFORMA = "Ex.: login da Waze no cofre. Nunca escreva a senha aqui.";

// ---------------------------------------------------------------- entradas

const texto = (min: number, max: number, problema: string) => z.string().trim().min(min, problema).max(max);
const textoOpcional = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable()).optional();

/** Potência em kWp, com vírgula ou ponto ("12,75"), até 3 casas, maior que zero. Sai com ponto. */
export const potenciaKwpSchema = z
  .string()
  .trim()
  .regex(/^\d{1,6}([.,]\d{1,3})?$/, "use um número como 12,75")
  .transform((v) => v.replace(",", "."))
  .refine((v) => Number(v) > 0, "a potência precisa ser maior que zero");

/** Id da plataforma: minúsculas, números e hífen (ex.: "fusion-solar"). */
export const idDePlataformaSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id inválido").max(40);

export const criarPlataformaSchema = z
  .object({ nome: texto(1, 60, "informe o nome da plataforma"), observacaoDeAcesso: textoOpcional(200) })
  .strict();
export type CriarPlataforma = z.infer<typeof criarPlataformaSchema>;

export const editarPlataformaSchema = z
  .object({ nome: texto(1, 60, "informe o nome da plataforma").optional(), observacaoDeAcesso: textoOpcional(200), ativa: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "informe ao menos um campo");
export type EditarPlataforma = z.infer<typeof editarPlataformaSchema>;

const dadosDaUsina = {
  nome: texto(1, 120, "dê um nome à usina"),
  plataformaId: idDePlataformaSchema,
  potenciaKwp: potenciaKwpSchema,
  fabricante: textoOpcional(120),
  modelo: textoOpcional(120),
  numeroSerie: textoOpcional(120),
  /** Dia do comissionamento (ou da conexão), não no futuro. */
  comissionadaEm: diaDoCalendario,
  garantiaAte: diaDoCalendario.nullable().optional(),
};

export const criarUsinaSchema = z
  .object({
    empresa: companyKeySchema,
    clienteId: uuid,
    ucId: uuid,
    ...dadosDaUsina,
    /** A O.S. de comissionamento concluída de onde a usina nasce (origem comissionamento). */
    ordemDeComissionamentoId: uuid.nullable().optional(),
  })
  .strict();
export type CriarUsina = z.infer<typeof criarUsinaSchema>;

export const editarUsinaSchema = z
  .object({
    nome: dadosDaUsina.nome.optional(),
    plataformaId: dadosDaUsina.plataformaId.optional(),
    potenciaKwp: potenciaKwpSchema.optional(),
    fabricante: dadosDaUsina.fabricante,
    modelo: dadosDaUsina.modelo,
    numeroSerie: dadosDaUsina.numeroSerie,
    comissionadaEm: diaDoCalendario.optional(),
    garantiaAte: dadosDaUsina.garantiaAte,
    ativa: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "informe ao menos um campo");
export type EditarUsina = z.infer<typeof editarUsinaSchema>;

export const listarUsinasQuerySchema = z
  .object({
    /** Nome da usina, cliente ou código da UC. */
    busca: z.string().trim().min(1).max(150).optional(),
    empresa: companyKeySchema.optional(),
    plataformaId: idDePlataformaSchema.optional(),
    /** Só as com anomalia ou sem comunicação na última conferência. */
    atencao: z.enum(["sim"]).optional(),
    /** Por padrão, só as ativas. */
    inativas: z.enum(["incluir"]).optional(),
  })
  .strict();
export type ListarUsinasQuery = z.infer<typeof listarUsinasQuerySchema>;

export const resultadoDaConferenciaEntradaSchema = z
  .object({
    usinaId: uuid,
    situacao: situacaoDoMonitoramentoSchema,
    nota: textoOpcional(1000),
    /** Só vale para anomalia e sem comunicação: abre a O.S. já preenchida. */
    abrirOs: z.boolean().optional(),
  })
  .strict()
  .refine((r) => r.situacao === "normal" || (r.nota ?? "").length > 0, { message: "descreva o que foi visto", path: ["nota"] })
  .refine((r) => r.situacao !== "normal" || !r.abrirOs, { message: "só anomalia ou sem comunicação abrem O.S.", path: ["abrirOs"] });

/**
 * Conferir uma plataforma (multipart): `empresa`, `resultados` (JSON com as
 * usinas que fugiram do normal; as que faltarem contam como normais) e o arquivo
 * `print`, obrigatório.
 */
export const conferirPlataformaSchema = z
  .object({
    empresa: companyKeySchema,
    resultados: z
      .preprocess((v) => {
        if (typeof v !== "string") return v;
        try {
          return JSON.parse(v === "" ? "[]" : v);
        } catch {
          return v;
        }
      }, z.array(resultadoDaConferenciaEntradaSchema).max(500))
      .default([]),
  })
  .strict()
  .refine((v) => new Set(v.resultados.map((r) => r.usinaId)).size === v.resultados.length, { message: "usina repetida", path: ["resultados"] });
export type ConferirPlataforma = z.infer<typeof conferirPlataformaSchema>;

export const monitoramentoQuerySchema = z.object({ empresa: companyKeySchema.optional() }).strict();
export type MonitoramentoQuery = z.infer<typeof monitoramentoQuerySchema>;

// ---------------------------------------------------------------- importação (E3)

/** A planilha de levantamento, em CSV (vírgula ou ponto e vírgula), até este tamanho. Lida só em memória: nunca é guardada nem logada. */
export const PLANILHA_DE_USINAS_MAX_BYTES = 2 * 1024 * 1024;
export const LINHAS_DA_PLANILHA_MAX = 2000;

/** Campos da usina que a planilha pode trazer e o cabeçalho de cada um. */
export const camposDaImportacao = ["cliente", "uc", "nome", "plataforma", "potenciaKwp", "fabricante", "modelo", "numeroSerie", "comissionadaEm", "empresa"] as const;
export type CampoDaImportacao = (typeof camposDaImportacao)[number];

/** Cabeçalhos padrão; o mapeamento enviado substitui os que vierem. */
export const MAPEAMENTO_PADRAO_DA_IMPORTACAO: Record<CampoDaImportacao, string> = {
  cliente: "Cliente", uc: "UC", nome: "Usina", plataforma: "Plataforma", potenciaKwp: "kWp",
  fabricante: "Fabricante", modelo: "Modelo", numeroSerie: "Número de série", comissionadaEm: "Comissionamento", empresa: "Empresa",
};

export const importarUsinasSchema = z
  .object({
    /** JSON { campo: "Cabeçalho na planilha" }; os que faltarem usam o padrão. */
    mapeamento: z
      .preprocess((v) => {
        if (typeof v !== "string" || v.trim() === "") return v === "" ? {} : v;
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }, z.partialRecord(z.enum(camposDaImportacao), z.string().trim().min(1).max(80)))
      .default({}),
    /** Empresa das linhas sem a coluna de empresa. */
    empresaPadrao: companyKeySchema,
    /** "sim" grava as linhas prontas numa transação só; sem isso, só confere (dry-run). */
    gravar: z.enum(["sim", "nao"]).default("nao"),
  })
  .strict();
export type ImportarUsinas = z.infer<typeof importarUsinasSchema>;

export const situacoesDaLinhaImportada = ["pronta", "ja_existe", "erro", "gravada"] as const;

export const importacaoDeUsinasSchema = z.object({
  gravou: z.boolean(),
  resumo: z.object({
    linhas: z.number().int().nonnegative(),
    prontas: z.number().int().nonnegative(),
    jaExistem: z.number().int().nonnegative(),
    erros: z.number().int().nonnegative(),
    gravadas: z.number().int().nonnegative(),
  }),
  /** Uma por linha de dado (a 1ª linha da planilha é o cabeçalho, então a primeira é a linha 2). */
  linhas: z.array(
    z.object({
      linha: z.number().int().positive(),
      situacao: z.enum(situacoesDaLinhaImportada),
      problemas: z.array(z.string()),
      usina: z.object({ nome: z.string(), cliente: z.string(), uc: z.string(), plataforma: z.string(), potenciaKwp: z.string(), empresa: companyKeySchema }).nullable(),
    }),
  ),
});
export type ImportacaoDeUsinas = z.infer<typeof importacaoDeUsinasSchema>;

// ---------------------------------------------------------------- saídas

const pessoa = z.object({ id: uuid, nome: z.string() });
const registro = z.object({ por: pessoa.nullable(), em: isoDate });
const referenciaDeOrdem = z.object({ id: uuid, codigo: z.string() });

export const plataformaDeInversorSchema = z.object({
  id: idDePlataformaSchema,
  nome: z.string(),
  observacaoDeAcesso: z.string().nullable(),
  ativa: z.boolean(),
  /** Usinas ativas na plataforma e a potência somada (kWp, com ponto). */
  usinas: z.number().int().nonnegative(),
  potenciaKwp: z.string(),
});
export type PlataformaDeInversor = z.infer<typeof plataformaDeInversorSchema>;

export const listarPlataformasRespostaSchema = z.object({
  itens: z.array(plataformaDeInversorSchema),
  /** Gerente da Engenharia com tela de Usinas, ou plataforma. */
  podeEditar: z.boolean(),
});
export type ListarPlataformasResposta = z.infer<typeof listarPlataformasRespostaSchema>;

export const monitoramentoDaUsinaSchema = z.object({
  dia: diaDoCalendario,
  situacao: situacaoDoMonitoramentoSchema,
  nota: z.string().nullable(),
  conferido: registro,
  ordem: referenciaDeOrdem.nullable(),
});
export type MonitoramentoDaUsina = z.infer<typeof monitoramentoDaUsinaSchema>;

export const usinaResumoSchema = z.object({
  id: uuid,
  nome: z.string(),
  empresa: companyKeySchema,
  cliente: pessoa,
  uc: z.object({ id: uuid, codigo: z.string(), distribuidora: z.string() }),
  plataforma: z.object({ id: idDePlataformaSchema, nome: z.string() }),
  potenciaKwp: z.string(),
  fabricante: z.string().nullable(),
  modelo: z.string().nullable(),
  numeroSerie: z.string().nullable(),
  ativa: z.boolean(),
  /** A última conferência que incluiu a usina; nulo se nunca foi conferida. */
  ultimoMonitoramento: monitoramentoDaUsinaSchema.nullable(),
  osAbertas: z.number().int().nonnegative(),
});
export type UsinaResumo = z.infer<typeof usinaResumoSchema>;

export const listarUsinasRespostaSchema = z.object({ itens: z.array(usinaResumoSchema), total: z.number().int().nonnegative() });
export type ListarUsinasResposta = z.infer<typeof listarUsinasRespostaSchema>;

export const usinaSchema = usinaResumoSchema.extend({
  comissionadaEm: diaDoCalendario,
  garantiaAte: diaDoCalendario.nullable(),
  origem: origemDaUsinaSchema,
  /** Monitoramento por dia, do mais recente ao mais antigo (até 90 dias). */
  monitoramento: z.array(monitoramentoDaUsinaSchema),
  /** As O.S. da usina, das mais recentes (até 50). */
  ordens: z.array(z.object({ id: uuid, codigo: z.string(), tipo: z.string(), situacao: z.string(), descricao: z.string(), createdAt: isoDate })),
  /** Protocolos da UC em andamento (PLU-348); nulo para quem não tem a tela de protocolos. */
  protocolos: z.array(protocoloDaUcSchema).nullable(),
  criada: registro,
  acoesPermitidas: z.array(z.enum(["editar", "abrir_os"])),
});
export type Usina = z.infer<typeof usinaSchema>;

export const arquivoDoPrintSchema = z.object({ id: uuid, nome: z.string(), tamanhoBytes: z.number().int().positive(), mime: z.string(), url: z.string() });

export const cardDePlataformaSchema = z.object({
  plataforma: z.object({ id: idDePlataformaSchema, nome: z.string() }),
  empresa: companyKeySchema,
  usinas: z.array(z.object({ id: uuid, nome: z.string(), cliente: z.string(), potenciaKwp: z.string(), fabricante: z.string().nullable() })),
  /** Nula enquanto a plataforma não foi conferida hoje para a empresa. */
  conferencia: z
    .object({
      id: uuid,
      conferida: registro,
      print: arquivoDoPrintSchema,
      normais: z.number().int().nonnegative(),
      excecoes: z.array(z.object({ usinaId: uuid, usina: z.string(), situacao: situacaoDoMonitoramentoSchema.exclude(["normal"]), nota: z.string().nullable(), ordem: referenciaDeOrdem.nullable() })),
      /** As usinas que entraram nesta conferência; uma usina fora dela ainda não foi conferida hoje. */
      usinasConferidas: z.array(uuid).optional(),
    })
    .nullable(),
});
export type CardDePlataforma = z.infer<typeof cardDePlataformaSchema>;

export const monitoramentoDoDiaSchema = z.object({
  hoje: diaDoCalendario,
  /** "5 de 9 plataformas": cada plataforma com usina ativa, por empresa. */
  resumo: z.object({
    conferidas: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    usinas: z.number().int().nonnegative(),
    normais: z.number().int().nonnegative(),
    anomalias: z.number().int().nonnegative(),
    semComunicacao: z.number().int().nonnegative(),
  }),
  /** As pendentes primeiro; depois as com mais exceções. */
  cards: z.array(cardDePlataformaSchema),
  /** Quem confere: tela de Usinas. Abrir O.S. pede também uma tela de O.S. */
  podeConferir: z.boolean(),
  podeAbrirOs: z.boolean(),
});
export type MonitoramentoDoDia = z.infer<typeof monitoramentoDoDiaSchema>;

/** Resumo para a Visão geral da Engenharia. */
export const monitoramentoDaVisaoGeralSchema = z.object({
  conferidas: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  pendentes: z.array(z.object({ plataforma: z.string(), empresa: companyKeySchema })),
});
export type MonitoramentoDaVisaoGeral = z.infer<typeof monitoramentoDaVisaoGeralSchema>;

/** Texto com cara de credencial ("senha:", "password", usuário:senha@, token longo): a observação de acesso recusa. */
export function pareceCredencial(texto: string): boolean {
  const t = texto.normalize("NFKC");
  if (/\b(senha|password|passwd|pwd|pass|token|secret|segredo|api[\s_-]?key|chave)\b\s*[:=]/i.test(t)) return true;
  if (/\bpass(word|wd)\b/i.test(t)) return true;
  if (/\S+:\S+@\S+/.test(t)) return true;
  // Sequência longa sem espaço, com letras e dígitos misturados: cara de senha ou token.
  return t.split(/\s+/).some((palavra) => palavra.length >= 16 && /[A-Za-z]/.test(palavra) && /\d/.test(palavra) && !/^https?:\/\//i.test(palavra));
}
