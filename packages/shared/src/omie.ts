import { z } from "zod";

import type { CompanyKey } from "./organization.js";

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
