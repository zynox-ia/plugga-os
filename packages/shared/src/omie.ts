import { z } from "zod";

import { companyKeySchema, type CompanyKey } from "./organization.js";

/**
 * OMIE (financeiro e nota fiscal): uma conta só para a plataforma. A chave e o
 * segredo do app ficam cifrados no cofre; o segredo é escrita-apenas e nunca
 * volta da API.
 */

export const entradaDoOmieSchema = z
  .object({
    appKey: z
      .string({ error: "informe a chave do app (App Key)" })
      .trim()
      .min(6, "a chave do app (App Key) é maior que isso; confira se copiou inteira")
      .max(64, "a chave do app (App Key) é menor que isso; confira o que foi colado")
      .refine((v) => !/\s/.test(v), "a chave do app não pode ter espaços; confira o que foi colado"),
    appSecret: z
      .string({ error: "informe o segredo do app (App Secret)" })
      .trim()
      .min(16, "o segredo do app (App Secret) é maior que isso; confira se copiou inteiro")
      .max(128, "o segredo do app (App Secret) é menor que isso; confira o que foi colado")
      .refine((v) => !/\s/.test(v), "o segredo do app não pode ter espaços; confira o que foi colado"),
  })
  .strict();
export type EntradaDoOmie = z.infer<typeof entradaDoOmieSchema>;

export type EstadoDoOmie = {
  conectado: boolean;
  /** Só os quatro últimos caracteres da chave do app. */
  mascara: string | null;
  /** `cofre_ilegivel`: a chave-mestra mudou sem regravar. */
  origem: "cofre" | "cofre_ilegivel" | "nenhuma";
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/** Resposta de `GET /integracoes/omie`: o estado mais a prontidão do cofre. */
export type EstadoDoOmieComCofre = EstadoDoOmie & { cofreConfigurado: boolean };

/** A empresa dona da conta, como o OMIE a informou no teste de conexão. */
export type EmpresaDoOmie = {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  /** Só os 14 dígitos. */
  cnpj: string | null;
};

// ---------------------------------------------------------------- uma conexão por empresa (PLU-342)

/**
 * Uma conta OMIE com as duas empresas dentro (D1): cada empresa tem o seu par
 * app_key/app_secret, guardado cifrado no cofre (`integracao.omie.<empresa>`).
 * O par só é usado depois de conferido: o teste chama `ListarEmpresas` e compara
 * o CNPJ devolvido com o cadastro da empresa no Plugga OS (`companies.cnpj`) ou,
 * sem cadastro, espera alguém confirmar na tela. Bloqueia se o OMIE devolver
 * mais de uma empresa ou o CNPJ já confirmado da outra empresa.
 *
 * Rotas novas em `/integracoes/omie/empresas`; as antigas (conta única) saem
 * quando o cartão da web passar para estas.
 */
export const situacoesDaConexaoOmie = ["nao_conectada", "a_testar", "a_confirmar", "conectada", "bloqueada", "ilegivel"] as const;
export const situacaoDaConexaoOmieSchema = z.enum(situacoesDaConexaoOmie);
export type SituacaoDaConexaoOmie = z.infer<typeof situacaoDaConexaoOmieSchema>;

export const bloqueiosDaConexaoOmie = ["mais_de_uma_empresa", "cnpj_de_outra_empresa", "cnpj_diferente_do_cadastro", "sem_cnpj"] as const;
export type BloqueioDaConexaoOmie = (typeof bloqueiosDaConexaoOmie)[number];

export type ConexaoOmieDaEmpresa = {
  empresa: CompanyKey;
  /**
   * `a_testar`: par gravado, ainda sem teste; `a_confirmar`: testado, sem CNPJ no
   * cadastro, espera a confirmação; `bloqueada`: o teste não confere (ver `bloqueio`);
   * `ilegivel`: a chave-mestra mudou sem regravar.
   */
  situacao: SituacaoDaConexaoOmie;
  bloqueio: BloqueioDaConexaoOmie | null;
  /** Só os quatro últimos caracteres da chave do app. */
  mascara: string | null;
  /** CNPJ da empresa no cadastro do Plugga OS, só dígitos; nulo até alguém preencher. */
  cnpjDoCadastro: string | null;
  /**
   * O que o último `ListarEmpresas` devolveu: até as duas primeiras empresas e, em
   * `total`, quantas vieram (a API sempre manda; ausente, vale `empresas.length`).
   */
  ultimoTeste: { em: string; por: string | null; empresas: EmpresaDoOmie[]; total?: number } | null;
  /** Quem confirmou e quando; nulo enquanto não está conectada. */
  confirmada: { em: string; por: string | null; cnpj: string; razaoSocial: string | null } | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/** Resposta de `GET /integracoes/omie/empresas`. Uma entrada por empresa, na ordem de `companyKeys`. */
export type EstadoDasConexoesOmie = {
  conexoes: ConexaoOmieDaEmpresa[];
  /** A conta única de antes (`integracao.omie`), se ainda estiver no cofre: reconectar por empresa. */
  contaAntiga: { mascara: string; atualizadoEm: string } | null;
  cofreConfigurado: boolean;
};

const cnpj = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 14, "informe os 14 dígitos do CNPJ");

/** `POST /integracoes/omie/empresas/:empresa/confirmar`: o CNPJ que a pessoa viu no teste. */
export const confirmarConexaoOmieSchema = z.object({ cnpj }).strict();
export type ConfirmarConexaoOmie = z.infer<typeof confirmarConexaoOmieSchema>;

/** `PUT /integracoes/omie/empresas/:empresa/cnpj`: o CNPJ da empresa no cadastro do Plugga OS. */
export const cnpjDaEmpresaSchema = z.object({ cnpj: cnpj.nullable() }).strict();
export type CnpjDaEmpresa = z.infer<typeof cnpjDaEmpresaSchema>;

// ---------------------------------------------------------------- importar e conferir (S4)
// O plano de contas e as contas correntes são do Plugga OS (decisão de 24/11/2026). O OMIE
// é um conector: "Conferir com o OMIE" só mostra as diferenças, e "Importar do OMIE" cria
// o que falta e grava o vínculo, sem nunca sobrescrever o cadastro do Plugga OS. Por
// empresa, como ação explícita da gerência do Financeiro.

/**
 * - `nova_no_omie`: existe só no OMIE; a importação cria.
 * - `vinculavel`: existe nos dois sem vínculo (a categoria pelo código, a conta por banco,
 *   agência e número); a importação só grava o vínculo.
 * - `diferente`: já vinculada, com campos diferentes; ou o mesmo código com outro tipo
 *   (receita × despesa), que não se vincula. Só mostra; nunca sobrescreve.
 * - `so_no_plugga`: sem par no OMIE. Só informa.
 * Os iguais só entram na contagem.
 */
export const situacoesDaConferenciaDoOmie = ["nova_no_omie", "vinculavel", "diferente", "so_no_plugga"] as const;
export const situacaoDaConferenciaDoOmieSchema = z.enum(situacoesDaConferenciaDoOmie);

export const resumoDaConferenciaDoOmieSchema = z.object({
  iguais: z.number().int().nonnegative(),
  novasNoOmie: z.number().int().nonnegative(),
  vinculaveis: z.number().int().nonnegative(),
  diferentes: z.number().int().nonnegative(),
  soNoPlugga: z.number().int().nonnegative(),
});
export type ResumoDaConferenciaDoOmie = z.infer<typeof resumoDaConferenciaDoOmieSchema>;

const tipoDaCategoriaNoOmie = z.enum(["receita", "despesa"]);
export const camposDaCategoriaNaConferencia = ["nome", "ativa", "grupoNome", "tipo"] as const;
export const itemDeCategoriaNaConferenciaSchema = z.object({
  situacao: situacaoDaConferenciaDoOmieSchema,
  omie: z.object({ codigo: z.string(), nome: z.string(), tipo: tipoDaCategoriaNoOmie, ativa: z.boolean(), grupoNome: z.string().nullable() }).nullable(),
  plugga: z.object({ id: z.string().uuid(), codigo: z.string(), nome: z.string(), tipo: tipoDaCategoriaNoOmie, ativa: z.boolean(), grupoNome: z.string() }).nullable(),
  diferencas: z.array(z.enum(camposDaCategoriaNaConferencia)),
});
export type ItemDeCategoriaNaConferencia = z.infer<typeof itemDeCategoriaNaConferenciaSchema>;

export const camposDaContaNaConferencia = ["nome", "banco", "agencia", "conta"] as const;
export const itemDeContaCorrenteNaConferenciaSchema = z.object({
  situacao: situacaoDaConferenciaDoOmieSchema,
  omie: z.object({ codigo: z.string(), nome: z.string(), banco: z.string().nullable(), agencia: z.string().nullable(), conta: z.string().nullable() }).nullable(),
  plugga: z.object({ id: z.string().uuid(), nome: z.string(), banco: z.string().nullable(), agencia: z.string().nullable(), conta: z.string().nullable() }).nullable(),
  diferencas: z.array(z.enum(camposDaContaNaConferencia)),
});
export type ItemDeContaCorrenteNaConferencia = z.infer<typeof itemDeContaCorrenteNaConferenciaSchema>;

/** `GET /integracoes/omie/empresas/:empresa/conferencia`. */
export const conferenciaDoOmieSchema = z.object({
  empresa: companyKeySchema,
  lidoEm: z.string().datetime(),
  categorias: z.object({ itens: z.array(itemDeCategoriaNaConferenciaSchema), resumo: resumoDaConferenciaDoOmieSchema }),
  contasCorrentes: z.object({ itens: z.array(itemDeContaCorrenteNaConferenciaSchema), resumo: resumoDaConferenciaDoOmieSchema }),
});
export type ConferenciaDoOmie = z.infer<typeof conferenciaDoOmieSchema>;

/**
 * `POST /integracoes/omie/empresas/:empresa/importacao`, sem corpo. A conta importada
 * nasce sem saldo inicial (a gerência informa); a categoria importada, com a natureza
 * padrão (`paraClassificar`: quantas, para a gerência ajustar no cadastro).
 */
export const resultadoDaImportacaoDoOmieSchema = z.object({
  categorias: z.object({ criadas: z.number().int().nonnegative(), vinculadas: z.number().int().nonnegative(), paraClassificar: z.number().int().nonnegative() }),
  contasCorrentes: z.object({ criadas: z.number().int().nonnegative(), vinculadas: z.number().int().nonnegative() }),
  conferencia: conferenciaDoOmieSchema,
});
export type ResultadoDaImportacaoDoOmie = z.infer<typeof resultadoDaImportacaoDoOmieSchema>;
