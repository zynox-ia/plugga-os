import { ehIdentificador, erroApiSchema } from "@plugga/shared";

/**
 * Núcleo do cliente de API do servidor (US12, T120), sem dependência de Next.
 *
 * Fica separado de `api-client.ts` (que importa `server-only` e `next/headers`)
 * para poder ser testado com `node --test` e um `fetch` injetado. Toda regra de
 * montagem de caminho, validação, tempo máximo e classificação de erro mora
 * aqui; o wrapper só liga o contexto da requisição.
 */

/** Tempo máximo único. A travessia até a API passa pelo túnel SSH em desenvolvimento. */
export const TEMPO_MAXIMO_MS = 15_000;

/**
 * Erros que a interface sabe distinguir. `rejeitado` cobre os demais 4xx
 * (validação, conflito, excesso de tentativas): a API recusou, e a `mensagem`
 * do envelope é a explicação; não é falha de infraestrutura.
 */
export type TipoDeErroApi = "naoAutenticado" | "proibido" | "naoEncontrado" | "indisponivel" | "rejeitado";

export type ErroDeApi = {
  tipo: TipoDeErroApi;
  /** Mensagem em português, segura para mostrar ao usuário. */
  mensagem: string;
  status: number | null;
  /** Código do envelope da T013 quando a API o enviou. */
  codigo?: string;
  requestId?: string;
};

export type ResultadoApi<T> = { ok: true; dados: T } | { ok: false; erro: ErroDeApi };

/** Contrato mínimo de um schema zod; evita depender de `zod` direto no web. */
export type EsquemaDeResposta<T> = {
  safeParse(valor: unknown): { success: true; data: T } | { success: false };
};

export type ContextoDaApi = {
  baseUrl: string;
  /** Cabeçalhos repassados do navegador: cookie, x-forwarded-for, origin. */
  cabecalhos?: Record<string, string>;
  fetchImpl?: typeof fetch;
  tempoMaximoMs?: number;
};

export type OpcoesDeLeitura = {
  /** Parâmetros de query; valores `undefined`/vazios são omitidos. */
  consulta?: Record<string, string | undefined>;
  tempoMaximoMs?: number;
};

const MENSAGENS: Record<TipoDeErroApi, string> = {
  naoAutenticado: "Sua sessão expirou ou você não entrou. Faça login para continuar.",
  proibido: "Você não tem permissão para acessar este conteúdo.",
  naoEncontrado: "Não encontramos este registro.",
  indisponivel: "O serviço está indisponível no momento. Tente novamente em instantes.",
  rejeitado: "A API recusou a requisição.",
};

export function erroDe(tipo: TipoDeErroApi, extra: Partial<ErroDeApi> = {}): ErroDeApi {
  return { tipo, mensagem: MENSAGENS[tipo], status: null, ...extra };
}

/**
 * Monta `/a/:id/b` codificando cada segmento. Identificador que não é UUID
 * devolve `null`: quem chama recusa sem tocar a rede.
 */
export function montarCaminho(modelo: string, ids: Record<string, string> = {}): string | null {
  let invalido = false;
  const caminho = modelo.replace(/:([a-zA-Z]+)/g, (_, nome: string) => {
    const valor = ids[nome];
    if (valor === undefined || !ehIdentificador(valor)) {
      invalido = true;
      return "";
    }
    return encodeURIComponent(valor);
  });
  return invalido ? null : caminho;
}

export function montarConsulta(consulta: Record<string, string | undefined> | undefined): string {
  if (!consulta) return "";
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(consulta)) {
    if (valor !== undefined && valor !== "") params.set(chave, valor);
  }
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

/** Classifica uma resposta não-2xx, preferindo o `codigo` do envelope ao status. */
export async function classificarFalha(resposta: Response): Promise<ErroDeApi> {
  const corpo: unknown = await resposta.json().catch(() => null);
  const envelope = erroApiSchema.safeParse(corpo);
  const extra: Partial<ErroDeApi> = { status: resposta.status };
  let codigo: string | undefined;
  if (envelope.success) {
    codigo = envelope.data.codigo;
    extra.codigo = codigo;
    extra.requestId = envelope.data.requestId;
  }

  const tipo = (codigo ? tipoPorCodigo(codigo) : null) ?? tipoPorStatus(resposta.status);
  const mensagem = tipo === "rejeitado" && envelope.success ? envelope.data.mensagem : MENSAGENS[tipo];
  return erroDe(tipo, { ...extra, mensagem });
}

function tipoPorCodigo(codigo: string): TipoDeErroApi | null {
  switch (codigo) {
    case "NAO_AUTENTICADO":
      return "naoAutenticado";
    case "ACESSO_NEGADO":
      return "proibido";
    case "NAO_ENCONTRADO":
      return "naoEncontrado";
    case "SERVICO_INDISPONIVEL":
    case "ERRO_INTERNO":
      return "indisponivel";
    default:
      return null;
  }
}

function tipoPorStatus(status: number): TipoDeErroApi {
  if (status === 401) return "naoAutenticado";
  if (status === 403) return "proibido";
  if (status === 404) return "naoEncontrado";
  if (status >= 500) return "indisponivel";
  return "rejeitado";
}

/**
 * GET validado. `modelo` usa `:nome` para identificadores (sempre UUID);
 * `ids` os preenche. Resposta que foge do schema vira `indisponivel`: dado
 * fora do contrato nunca chega à tela como se fosse bom.
 */
export async function lerApi<T>(
  contexto: ContextoDaApi,
  modelo: string,
  schema: EsquemaDeResposta<T>,
  ids: Record<string, string> = {},
  opcoes: OpcoesDeLeitura = {},
): Promise<ResultadoApi<T>> {
  const caminho = montarCaminho(modelo, ids);
  if (caminho === null) {
    return { ok: false, erro: erroDe("naoEncontrado", { mensagem: "Identificador inválido." }) };
  }

  const fetchImpl = contexto.fetchImpl ?? fetch;
  let resposta: Response;
  try {
    resposta = await fetchImpl(`${contexto.baseUrl}${caminho}${montarConsulta(opcoes.consulta)}`, {
      method: "GET",
      headers: contexto.cabecalhos ?? {},
      cache: "no-store",
      signal: AbortSignal.timeout(opcoes.tempoMaximoMs ?? contexto.tempoMaximoMs ?? TEMPO_MAXIMO_MS),
    });
  } catch {
    return { ok: false, erro: erroDe("indisponivel") };
  }

  if (!resposta.ok) return { ok: false, erro: await classificarFalha(resposta) };

  const corpo: unknown = await resposta.json().catch(() => null);
  const validado = schema.safeParse(corpo);
  if (!validado.success) {
    return {
      ok: false,
      erro: erroDe("indisponivel", { status: resposta.status, mensagem: "A API respondeu fora do contrato esperado." }),
    };
  }
  return { ok: true, dados: validado.data };
}

/** Mapeia o tipo do erro para o status HTTP que um proxy devolve ao navegador. */
export function statusDoErro(erro: ErroDeApi): number {
  switch (erro.tipo) {
    case "naoAutenticado":
      return 401;
    case "proibido":
      return 403;
    case "naoEncontrado":
      return 404;
    case "indisponivel":
      return 503;
    default:
      return erro.status ?? 400;
  }
}
