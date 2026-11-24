import { z } from "zod";

import { diaDoCalendario } from "./compras.js";
import { companyKeySchema } from "./organization.js";
import { isoDate, uuid } from "./primitivas.js";

/**
 * Protocolos na distribuidora (PLU-348), no lugar das 56 tarefas recorrentes
 * "acompanhar o protocolo" do Bitrix. Uma tela só para a Engenharia e o
 * Operacional (energia-opm), com o departamento como campo e filtro (E7). Na
 * Energia não há item de menu: os protocolos aparecem nas fichas da migração e
 * da UC (decisão do André).
 *
 * ```
 * aberto ─┬─► em_analise ─┬─► respondido | liberado | indeferido (encerrado)
 *         └─► com_pendencia ◄┘   (cada verificação muda a situação e marca a próxima)
 * ```
 *
 * - A verificação registra o resultado (a nova situação), a nota e a próxima
 *   verificação, que vira o lembrete; tudo fica no histórico. "Com pendência"
 *   pede a ação a fazer. Encerrado não tem próxima verificação.
 * - Data-limite e próxima verificação nunca no passado (Manaus).
 * - A Agência Virtual é só um atalho: o cofre da UC fica para uma issue de
 *   segurança própria.
 *
 * Rotas (atrás do portão da Engenharia):
 *
 * ```
 * GET   /protocolos?departamento=&situacao=&grupo=&distribuidoraId=&empresa=&busca=&verificarHoje=sim
 * POST  /protocolos                       (CriarProtocolo → Protocolo)
 * GET   /protocolos/opcoes                distribuidoras, tipos, situações
 * GET   /protocolos/clientes?busca=       clientes com as UCs, para abrir o protocolo
 * GET   /protocolos/:id                   ficha com o histórico (Protocolo)
 * PATCH /protocolos/:id                   (EditarProtocolo → Protocolo)
 * POST  /protocolos/:id/verificacoes      (VerificarProtocolo → Protocolo)
 * GET   /protocolos/distribuidoras        catálogo (ListarDistribuidorasResposta)
 * POST  /protocolos/distribuidoras        (CriarDistribuidora), gerente
 * PATCH /protocolos/distribuidoras/:id    (EditarDistribuidora), gerente
 * ```
 */

// ---------------------------------------------------------------- enums

export const departamentosDosProtocolos = ["engenharia-obras", "energia-opm"] as const;
export const departamentoDoProtocoloSchema = z.enum(departamentosDosProtocolos);
export type DepartamentoDoProtocolo = z.infer<typeof departamentoDoProtocoloSchema>;

export const tiposDeProtocolo = ["orcamento_de_conexao", "liberacao", "cusd", "carta_denuncia", "permanencia_no_cativo", "retorno_ao_cativo", "outros"] as const;
export const tipoDeProtocoloSchema = z.enum(tiposDeProtocolo);
export type TipoDeProtocolo = z.infer<typeof tipoDeProtocoloSchema>;

export const situacoesDoProtocolo = ["aberto", "em_analise", "com_pendencia", "respondido", "liberado", "indeferido"] as const;
export const situacaoDoProtocoloSchema = z.enum(situacoesDoProtocolo);
export type SituacaoDoProtocolo = z.infer<typeof situacaoDoProtocoloSchema>;

/** Situações que encerram o protocolo: sem próxima verificação. */
export const SITUACOES_ENCERRADAS_DO_PROTOCOLO: readonly SituacaoDoProtocolo[] = ["respondido", "liberado", "indeferido"];
export const protocoloEncerrado = (situacao: SituacaoDoProtocolo): boolean => SITUACOES_ENCERRADAS_DO_PROTOCOLO.includes(situacao);

export const gruposDoProtocolo = ["em_andamento", "encerrados"] as const;

// ---------------------------------------------------------------- entradas

const texto = (min: number, max: number, problema: string) => z.string().trim().min(min, problema).max(max);
const textoOpcional = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable()).optional();

export const idDeDistribuidoraSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id inválido").max(60);

export const criarProtocoloSchema = z
  .object({
    empresa: companyKeySchema,
    departamento: departamentoDoProtocoloSchema,
    clienteId: uuid,
    ucId: uuid,
    distribuidoraId: idDeDistribuidoraSchema,
    tipo: tipoDeProtocoloSchema,
    numero: texto(1, 60, "informe o número do protocolo"),
    /** Dia em que o protocolo foi aberto na distribuidora (não no futuro). */
    abertoEm: diaDoCalendario,
    /** Prazo da distribuidora (não no passado). */
    dataLimite: diaDoCalendario,
    /** Primeira verificação (não no passado); sem ela, vale a data-limite. */
    proximaVerificacao: diaDoCalendario.nullable().optional(),
    observacao: textoOpcional(2000),
  })
  .strict()
  .refine((p) => p.abertoEm <= p.dataLimite, { message: "a data-limite vem depois da abertura", path: ["dataLimite"] });
export type CriarProtocolo = z.infer<typeof criarProtocoloSchema>;

export const editarProtocoloSchema = z
  .object({
    tipo: tipoDeProtocoloSchema.optional(),
    numero: texto(1, 60, "informe o número do protocolo").optional(),
    distribuidoraId: idDeDistribuidoraSchema.optional(),
    dataLimite: diaDoCalendario.optional(),
    observacao: textoOpcional(2000),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "informe ao menos um campo");
export type EditarProtocolo = z.infer<typeof editarProtocoloSchema>;

/** Uma verificação: o resultado é a nova situação. */
export const verificarProtocoloSchema = z
  .object({
    situacao: situacaoDoProtocoloSchema,
    nota: textoOpcional(2000),
    /** Obrigatória em "com pendência": o que precisa ser feito (ex.: enviar o documento X). */
    acaoPendente: textoOpcional(500),
    /** Obrigatória enquanto não encerra; proibida ao encerrar. Não no passado. */
    proximaVerificacao: diaDoCalendario.nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.situacao === "com_pendencia" && !v.acaoPendente) ctx.addIssue({ code: "custom", path: ["acaoPendente"], message: "diga o que precisa ser feito" });
    if (v.situacao !== "com_pendencia" && v.acaoPendente) ctx.addIssue({ code: "custom", path: ["acaoPendente"], message: "a ação só vale para com pendência" });
    if (protocoloEncerrado(v.situacao) && v.proximaVerificacao) ctx.addIssue({ code: "custom", path: ["proximaVerificacao"], message: "protocolo encerrado não tem próxima verificação" });
    if (!protocoloEncerrado(v.situacao) && !v.proximaVerificacao) ctx.addIssue({ code: "custom", path: ["proximaVerificacao"], message: "marque a próxima verificação" });
  });
export type VerificarProtocolo = z.infer<typeof verificarProtocoloSchema>;

export const listarProtocolosQuerySchema = z
  .object({
    departamento: departamentoDoProtocoloSchema.optional(),
    situacao: situacaoDoProtocoloSchema.optional(),
    grupo: z.enum(gruposDoProtocolo).optional(),
    distribuidoraId: idDeDistribuidoraSchema.optional(),
    empresa: companyKeySchema.optional(),
    /** Número do protocolo, cliente ou código da UC. */
    busca: z.string().trim().min(1).max(150).optional(),
    /** Só os com verificação para hoje ou atrasada. */
    verificarHoje: z.enum(["sim"]).optional(),
    /** Os da UC (para a ficha da usina e, depois, a da migração). */
    ucId: uuid.optional(),
  })
  .strict();
export type ListarProtocolosQuery = z.infer<typeof listarProtocolosQuerySchema>;

/**
 * Endereço da Agência Virtual da distribuidora: só https, sem usuário/senha na
 * URL nem parâmetro de login. O login e a senha ficam no cofre (issue própria).
 */
export const agenciaVirtualUrlSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/\S*)?$/, "use o endereço com https://, sem usuário nem senha")
  .refine((v) => !/[?&#](senha|password|pass|pwd|token|login|user|usuario|cpf|cnpj)=/i.test(v), "o endereço não leva login, senha nem documento");

export const criarDistribuidoraSchema = z
  .object({ nome: texto(1, 80, "informe o nome"), sigla: textoOpcional(20), uf: z.string().trim().regex(/^[A-Z]{2}$/, "use a sigla do estado").nullable().optional(), agenciaVirtualUrl: agenciaVirtualUrlSchema.nullable().optional() })
  .strict();
export type CriarDistribuidora = z.infer<typeof criarDistribuidoraSchema>;

export const editarDistribuidoraSchema = z
  .object({ nome: texto(1, 80, "informe o nome").optional(), sigla: textoOpcional(20), uf: z.string().trim().regex(/^[A-Z]{2}$/).nullable().optional(), ativa: z.boolean().optional(), agenciaVirtualUrl: agenciaVirtualUrlSchema.nullable().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "informe ao menos um campo");
export type EditarDistribuidora = z.infer<typeof editarDistribuidoraSchema>;

// ---------------------------------------------------------------- saídas

const pessoa = z.object({ id: uuid, nome: z.string() });
const registro = z.object({ por: pessoa.nullable(), em: isoDate });

export const distribuidoraSchema = z.object({
  id: idDeDistribuidoraSchema, nome: z.string(), sigla: z.string().nullable(), uf: z.string().nullable(), ativa: z.boolean(),
  /** O atalho "Agência Virtual" (abre numa nova aba); nulo enquanto o gerente não preenche. */
  agenciaVirtualUrl: z.string().nullable().optional(),
});
export type Distribuidora = z.infer<typeof distribuidoraSchema>;

export const listarDistribuidorasRespostaSchema = z.object({ itens: z.array(distribuidoraSchema), podeEditar: z.boolean() });
export type ListarDistribuidorasResposta = z.infer<typeof listarDistribuidorasRespostaSchema>;

export const protocoloResumoSchema = z.object({
  id: uuid,
  empresa: companyKeySchema,
  departamento: departamentoDoProtocoloSchema,
  tipo: tipoDeProtocoloSchema,
  numero: z.string(),
  situacao: situacaoDoProtocoloSchema,
  cliente: pessoa,
  uc: z.object({ id: uuid, codigo: z.string() }),
  distribuidora: z.object({ id: idDeDistribuidoraSchema, nome: z.string(), agenciaVirtualUrl: z.string().nullable().optional() }),
  abertoEm: diaDoCalendario,
  dataLimite: diaDoCalendario,
  /** Dias até a data-limite (negativo = vencida); nulo se encerrado. */
  diasParaOLimite: z.number().int().nullable(),
  proximaVerificacao: diaDoCalendario.nullable(),
  /** Aberto e com a verificação para hoje ou atrasada. */
  verificarHoje: z.boolean(),
  /** A ação pedida, quando com pendência. */
  acaoPendente: z.string().nullable(),
  ultimaVerificacao: registro.nullable(),
});
export type ProtocoloResumo = z.infer<typeof protocoloResumoSchema>;

/** O protocolo na ficha da usina (e, depois, na da UC e da migração). */
export const protocoloDaUcSchema = protocoloResumoSchema.pick({ id: true, departamento: true, tipo: true, numero: true, situacao: true, dataLimite: true, diasParaOLimite: true, proximaVerificacao: true, verificarHoje: true });
export type ProtocoloDaUc = z.infer<typeof protocoloDaUcSchema>;

/** Busca de cliente para abrir o protocolo, com as UCs dele. */
export const clientesParaProtocoloQuerySchema = z.object({ busca: z.string().trim().min(2, "digite ao menos 2 letras").max(150) }).strict();
export type ClientesParaProtocoloQuery = z.infer<typeof clientesParaProtocoloQuerySchema>;
export const clientesParaProtocoloRespostaSchema = z.object({
  itens: z.array(z.object({ id: uuid, nome: z.string(), ucs: z.array(z.object({ id: uuid, codigo: z.string(), distribuidora: z.string() })) })),
});
export type ClientesParaProtocoloResposta = z.infer<typeof clientesParaProtocoloRespostaSchema>;

export const verificacaoDoProtocoloSchema = z.object({
  id: uuid,
  verificado: registro,
  situacaoAnterior: situacaoDoProtocoloSchema,
  situacao: situacaoDoProtocoloSchema,
  nota: z.string().nullable(),
  acaoPendente: z.string().nullable(),
  proximaVerificacao: diaDoCalendario.nullable(),
});

export const protocoloSchema = protocoloResumoSchema.extend({
  observacao: z.string().nullable(),
  /** Da mais recente à mais antiga; a web agrupa por dia. */
  historico: z.array(verificacaoDoProtocoloSchema),
  criado: registro,
  acoesPermitidas: z.array(z.enum(["editar", "verificar"])),
});
export type Protocolo = z.infer<typeof protocoloSchema>;

export const listarProtocolosRespostaSchema = z.object({
  hoje: diaDoCalendario,
  itens: z.array(protocoloResumoSchema),
  total: z.number().int().nonnegative(),
  /** Com os filtros, sem o de situação: abertos, para verificar hoje, vencendo em 7 dias e vencidos. */
  contagens: z.object({
    emAndamento: z.number().int().nonnegative(),
    verificarHoje: z.number().int().nonnegative(),
    vencemEm7Dias: z.number().int().nonnegative(),
    vencidos: z.number().int().nonnegative(),
  }),
});
export type ListarProtocolosResposta = z.infer<typeof listarProtocolosRespostaSchema>;

export const opcoesDosProtocolosRespostaSchema = z.object({
  distribuidoras: z.array(distribuidoraSchema),
  tipos: z.array(tipoDeProtocoloSchema),
  situacoes: z.array(situacaoDoProtocoloSchema),
  /** Departamentos que a pessoa alcança nos protocolos. */
  departamentos: z.array(departamentoDoProtocoloSchema),
});
export type OpcoesDosProtocolosResposta = z.infer<typeof opcoesDosProtocolosRespostaSchema>;

export const LIMITE_DA_LISTA_DE_PROTOCOLOS = 500;
