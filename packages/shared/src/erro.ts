import { z } from "zod";

/**
 * Envelope único de erro da API (contrato: specs/002-fundacao-solida/contracts/erro-envelope.md).
 * O web decide comportamento pelo `codigo`, nunca pela `mensagem`.
 */
export const codigosDeErro = [
  "REQUISICAO_INVALIDA",
  "NAO_AUTENTICADO",
  "ACESSO_NEGADO",
  "NAO_ENCONTRADO",
  "CONFLITO_ESTADO",
  "CONFLITO_UNICIDADE",
  "ARQUIVO_GRANDE_DEMAIS",
  "TIPO_NAO_PERMITIDO",
  "ARQUIVO_RECUSADO",
  "MUITAS_TENTATIVAS",
  "SERVICO_INDISPONIVEL",
  "ERRO_INTERNO",
] as const;

export type CodigoDeErro = (typeof codigosDeErro)[number];

export const codigoDeErroSchema = z.enum(codigosDeErro);

/** Status HTTP de cada código do catálogo. */
export const statusPorCodigo: Readonly<Record<CodigoDeErro, number>> = {
  REQUISICAO_INVALIDA: 400,
  NAO_AUTENTICADO: 401,
  ACESSO_NEGADO: 403,
  NAO_ENCONTRADO: 404,
  CONFLITO_ESTADO: 409,
  CONFLITO_UNICIDADE: 409,
  ARQUIVO_GRANDE_DEMAIS: 413,
  TIPO_NAO_PERMITIDO: 415,
  ARQUIVO_RECUSADO: 422,
  MUITAS_TENTATIVAS: 429,
  SERVICO_INDISPONIVEL: 503,
  ERRO_INTERNO: 500,
};

/** Detalhe de validação de campo. Nunca carrega valor pessoal. */
export const detalheDeErroSchema = z.object({
  campo: z.string(),
  problema: z.string(),
});

export const erroApiSchema = z.object({
  codigo: codigoDeErroSchema,
  mensagem: z.string().min(1),
  requestId: z.string().min(1),
  detalhes: z.array(detalheDeErroSchema).optional(),
});

export type DetalheDeErro = z.infer<typeof detalheDeErroSchema>;
export type ErroApi = z.infer<typeof erroApiSchema>;

/** Mensagem fixa do erro interno: o único dado útil ao usuário é o requestId. */
export function mensagemDeErroInterno(requestId: string): string {
  return `Algo deu errado. Informe o código ${requestId}.`;
}
