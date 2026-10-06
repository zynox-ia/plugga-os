import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  mensagemDeErroInterno,
  statusPorCodigo,
  type CodigoDeErro,
  type DetalheDeErro,
  type ErroApi,
} from "@plugga/shared";
import type { Response } from "express";
import { ZodError } from "zod";

import { gerarRequestId, type RequisicaoComId } from "../request-id.middleware";
import { ErroDeDominio, LimiteExcedido, ServicoIndisponivel } from "./dominio";

const MENSAGEM_PADRAO: Readonly<Record<CodigoDeErro, string>> = {
  REQUISICAO_INVALIDA: "A requisição está incompleta ou malformada.",
  NAO_AUTENTICADO: "Entre novamente para continuar.",
  ACESSO_NEGADO: "Você não tem permissão para esta ação.",
  NAO_ENCONTRADO: "Não encontramos o que você procura.",
  CONFLITO_ESTADO: "Outra pessoa já alterou este registro. Atualize a página e confira.",
  CONFLITO_UNICIDADE: "Já existe um registro com estes dados.",
  ARQUIVO_GRANDE_DEMAIS: "O arquivo é maior do que o limite permitido.",
  TIPO_NAO_PERMITIDO: "O tipo do arquivo não é permitido.",
  ARQUIVO_RECUSADO: "Não foi possível processar o arquivo enviado.",
  MUITAS_TENTATIVAS: "Muitas tentativas. Aguarde um pouco e tente de novo.",
  SERVICO_INDISPONIVEL: "O serviço está indisponível no momento. Tente de novo em instantes.",
  ERRO_INTERNO: "Algo deu errado.",
};

/** Textos padrão do Nest: ficam em inglês, então o envelope usa a mensagem em português do catálogo. */
const TEXTOS_PADRAO_DO_NEST = new Set([
  "bad request",
  "unauthorized",
  "forbidden",
  "not found",
  "conflict",
  "payload too large",
  "unsupported media type",
  "unprocessable entity",
  "too many requests",
  "service unavailable",
  "internal server error",
  "bad gateway",
  "gateway timeout",
]);

/** Chaves que o corpo do Nest ou o próprio envelope já definem; o resto é de quem lançou a exceção. */
const CHAVES_DO_NEST_OU_DO_ENVELOPE = new Set([
  "message",
  "issues",
  "statusCode",
  "error",
  "codigo",
  "mensagem",
  "requestId",
  "detalhes",
]);

/** Marcadores de detalhe interno que nunca devem chegar ao usuário. */
const DETALHE_INTERNO = /prisma|postgres|econn|enotfound|etimedout|\bsql\b|\/(?:home|usr|opt|app|node_modules)\//i;

export function codigoPorStatus(status: number): CodigoDeErro {
  switch (status) {
    case 400:
      return "REQUISICAO_INVALIDA";
    case 401:
      return "NAO_AUTENTICADO";
    case 403:
      return "ACESSO_NEGADO";
    case 404:
      return "NAO_ENCONTRADO";
    case 409:
      return "CONFLITO_ESTADO";
    case 413:
      return "ARQUIVO_GRANDE_DEMAIS";
    case 415:
      return "TIPO_NAO_PERMITIDO";
    case 422:
      return "ARQUIVO_RECUSADO";
    case 429:
      return "MUITAS_TENTATIVAS";
    case 502:
    case 503:
    case 504:
      return "SERVICO_INDISPONIVEL";
    default:
      return status >= 500 ? "ERRO_INTERNO" : "REQUISICAO_INVALIDA";
  }
}

interface Traducao {
  codigo: CodigoDeErro;
  mensagem?: string;
  detalhes?: DetalheDeErro[];
  /** Campos do corpo antigo mantidos por compatibilidade até o web adotar o envelope (US12). */
  legado?: { message?: unknown; issues?: unknown; extras?: Record<string, unknown> };
  retryAfterSegundos?: number;
}

function mensagemUtil(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const texto = valor.trim();
  if (!texto || TEXTOS_PADRAO_DO_NEST.has(texto.toLowerCase()) || DETALHE_INTERNO.test(texto)) {
    return undefined;
  }
  return texto;
}

function detalhesDoZod(issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>): DetalheDeErro[] {
  return issues.map((issue) => ({ campo: issue.path.join("."), problema: issue.message }));
}

function traduzirHttp(excecao: HttpException): Traducao {
  const status = excecao.getStatus();
  const corpo = excecao.getResponse();
  const codigo = codigoPorStatus(status);

  if (typeof corpo === "string") {
    return { codigo, mensagem: mensagemUtil(corpo), legado: { message: corpo } };
  }

  const objeto = corpo as { message?: unknown; issues?: unknown; [chave: string]: unknown };
  // Chaves próprias de quem lançou (ex.: `code` do login com Google) que o web já lê.
  const extras: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    if (!CHAVES_DO_NEST_OU_DO_ENVELOPE.has(chave)) extras[chave] = valor;
  }
  let detalhes: DetalheDeErro[] | undefined;
  if (Array.isArray(objeto.issues)) {
    detalhes = (objeto.issues as { path?: unknown; message?: unknown }[])
      .filter((i) => typeof i.message === "string")
      .map((i) => ({ campo: String(i.path ?? ""), problema: String(i.message) }));
  } else if (Array.isArray(objeto.message)) {
    detalhes = (objeto.message as unknown[])
      .filter((m): m is string => typeof m === "string")
      .map((m) => ({ campo: "", problema: m }));
  }
  const textoUnico = typeof objeto.message === "string" ? objeto.message : undefined;
  // A mensagem "request validation failed" vem do ZodValidationPipe, em inglês.
  const mensagem =
    textoUnico === "request validation failed" ? undefined : mensagemUtil(textoUnico);
  return {
    codigo,
    mensagem,
    detalhes: detalhes && detalhes.length > 0 ? detalhes : undefined,
    legado: { message: objeto.message, issues: objeto.issues, extras },
  };
}

function traduzirPrisma(excecao: Prisma.PrismaClientKnownRequestError): Traducao {
  switch (excecao.code) {
    case "P2002":
      return { codigo: "CONFLITO_UNICIDADE" };
    case "P2025":
      return { codigo: "NAO_ENCONTRADO" };
    case "P2034":
      // A repetição única da transação é feita por quem a abriu; se chegou aqui, persistiu.
      return { codigo: "CONFLITO_ESTADO" };
    case "P1001":
    case "P1002":
    case "P1008":
    case "P1017":
    case "P2024":
      return { codigo: "SERVICO_INDISPONIVEL" };
    default:
      return { codigo: "ERRO_INTERNO" };
  }
}

export function traduzir(excecao: unknown): Traducao {
  if (excecao instanceof ErroDeDominio) {
    return {
      codigo: excecao.codigo,
      mensagem: excecao.mensagemParaUsuario,
      detalhes: excecao.detalhes,
      retryAfterSegundos: excecao instanceof LimiteExcedido ? excecao.retryAfterSegundos : undefined,
    };
  }
  if (excecao instanceof HttpException) {
    return traduzirHttp(excecao);
  }
  if (excecao instanceof Prisma.PrismaClientKnownRequestError) {
    return traduzirPrisma(excecao);
  }
  if (excecao instanceof Prisma.PrismaClientInitializationError) {
    return { codigo: "SERVICO_INDISPONIVEL" };
  }
  if (excecao instanceof ZodError) {
    return { codigo: "REQUISICAO_INVALIDA", detalhes: detalhesDoZod(excecao.issues) };
  }
  return { codigo: "ERRO_INTERNO" };
}

/** Monta o corpo do envelope; exportado para os testes. */
export function montarEnvelope(traducao: Traducao, requestId: string): ErroApi & Record<string, unknown> {
  const mensagem =
    traducao.codigo === "ERRO_INTERNO"
      ? mensagemDeErroInterno(requestId)
      : traducao.mensagem ?? MENSAGEM_PADRAO[traducao.codigo];
  const envelope: ErroApi & Record<string, unknown> = {
    codigo: traducao.codigo,
    mensagem,
    requestId,
  };
  if (traducao.detalhes) {
    envelope.detalhes = traducao.detalhes;
  }
  // Compatibilidade: o web e os testes antigos leem `message` e `issues`. Saem na US12.
  // O texto original só passa se for de erro do cliente e sem detalhe interno.
  const original = traducao.legado?.message;
  const originalSeguro =
    original !== undefined &&
    statusPorCodigo[traducao.codigo] < 500 &&
    !DETALHE_INTERNO.test(JSON.stringify(original));
  envelope.message = originalSeguro ? original : mensagem;
  if (traducao.legado?.extras) {
    for (const [chave, valor] of Object.entries(traducao.legado.extras)) {
      if (!(chave in envelope)) envelope[chave] = valor;
    }
  }
  if (traducao.legado?.issues !== undefined) {
    envelope.issues = traducao.legado.issues;
  }
  return envelope;
}

@Catch()
export class FiltroGlobalDeExcecoes implements ExceptionFilter {
  private readonly logger = new Logger(FiltroGlobalDeExcecoes.name);

  catch(excecao: unknown, host: ArgumentsHost): void {
    if (host.getType() !== "http") {
      throw excecao;
    }
    const contexto = host.switchToHttp();
    const resposta = contexto.getResponse<Response>();
    const requisicao = contexto.getRequest<RequisicaoComId>();
    const requestId = requisicao.requestId ?? gerarRequestId();

    const traducao = traduzir(excecao);
    const status = statusPorCodigo[traducao.codigo];

    if (traducao.codigo === "ERRO_INTERNO") {
      // O detalhe fica no log (com o requestId); o usuário só recebe o código.
      this.logger.error(
        `${requestId} ${requisicao.method} ${requisicao.url}`,
        excecao instanceof Error ? excecao.stack : String(excecao),
      );
    }
    if (excecao instanceof ServicoIndisponivel && excecao.causa !== undefined) {
      // Detalhe interno (SDK, endpoint) só no log do servidor, com o requestId.
      const causa = excecao.causa;
      this.logger.error(
        `${requestId} ${requisicao.method} ${requisicao.url} serviço indisponível: ${
          causa instanceof Error ? causa.message : String(causa)
        }`,
        causa instanceof Error ? causa.stack : undefined,
      );
    }
    if (resposta.headersSent) {
      return;
    }
    if (traducao.codigo === "MUITAS_TENTATIVAS" && traducao.retryAfterSegundos !== undefined) {
      resposta.setHeader("Retry-After", String(traducao.retryAfterSegundos));
    }
    resposta.status(status).json(montarEnvelope(traducao, requestId));
  }
}
