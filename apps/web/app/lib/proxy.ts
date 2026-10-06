// Os imports relativos levam a extensão `.ts` de propósito: este módulo é
// exercitado por `node --test` (test/proxy.test.ts), que resolve como ESM do Node.
import { montarCaminho, montarConsulta, TEMPO_MAXIMO_MS } from "./api-core.ts";
import { apiBaseUrl } from "./env-runtime.ts";
import { clientForwardedFor } from "./forwarded-for.ts";
import { encaminharOrigem, isOriginAllowed } from "./origin-check.ts";

/**
 * Proxy genérico das rotas `app/api/**` para apps/api (US12, T124).
 *
 * Substitui as cinco cópias (`api-proxy`, `auth-proxy`, `energy-proxy`,
 * `commercial-proxy`, `compras-proxy`) que divergiam só no prefixo, no tempo
 * máximo e na mensagem de erro. A API só escuta na rede interna, então toda
 * escrita de uma tela "use client" passa por uma rota same-origin como esta,
 * levando o cookie de sessão; o `Set-Cookie` da API volta sob a origem do web.
 *
 * Identificadores do caminho (`:id`) são sempre validados como UUID ANTES de
 * qualquer chamada (T123): `../..`, `%2F` e afins viram 400 aqui.
 */

export type OpcoesDoProxy = {
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Prefixo na API, ex.: `/auth`, `/energy`; vazio para a raiz. */
  prefixo?: string;
  /** Caminho com `:nome` para identificadores, ex.: `users/:id/access`. */
  modelo: string;
  ids?: Record<string, string>;
  /** Query: texto bruto (`?a=1`) ou pares; valores vazios são omitidos. */
  consulta?: string | Record<string, string | undefined>;
  corpo?: "json" | "multipart" | "nenhum";
  tempoMaximoMs?: number;
  mensagemIndisponivel?: string;
};

/** Upload de orçamentos é mais lento que uma mutação comum. */
export const TEMPO_MAXIMO_UPLOAD_MS = 30_000;

function erroLocal(status: number, codigo: string, message: string): Response {
  return Response.json({ codigo, message }, { status });
}

function consultaDe(consulta: OpcoesDoProxy["consulta"]): string {
  if (typeof consulta === "string") return consulta === "" || consulta.startsWith("?") ? consulta : `?${consulta}`;
  return montarConsulta(consulta);
}

export async function proxyar(request: Request, opcoes: OpcoesDoProxy): Promise<Response> {
  const mutacao = opcoes.metodo !== "GET";
  if (mutacao && !isOriginAllowed(request)) {
    return erroLocal(403, "ACESSO_NEGADO", "origin not allowed");
  }

  const caminho = montarCaminho(opcoes.modelo.replace(/^\//, ""), opcoes.ids);
  if (caminho === null) {
    return erroLocal(400, "REQUISICAO_INVALIDA", "identificador inválido");
  }

  const tipoDeCorpo = opcoes.corpo ?? (mutacao && opcoes.metodo !== "DELETE" ? "json" : "nenhum");
  const cabecalhos: Record<string, string> = {};
  let corpo: string | FormData | undefined;

  if (tipoDeCorpo === "json") {
    const bruto = await request.text();
    if (bruto.length > 0) {
      try {
        JSON.parse(bruto);
      } catch {
        return erroLocal(400, "REQUISICAO_INVALIDA", "request body must be valid JSON");
      }
    }
    cabecalhos["content-type"] = "application/json";
    // Algumas rotas (logout) não têm corpo; a API espera um objeto.
    corpo = bruto.length > 0 ? bruto : "{}";
  } else if (tipoDeCorpo === "multipart") {
    let entrada: FormData;
    try {
      entrada = await request.formData();
    } catch {
      return erroLocal(400, "REQUISICAO_INVALIDA", "corpo precisa ser multipart/form-data");
    }
    // Remonta em vez de repassar cru: o `content-type` precisa carregar o
    // boundary que o `fetch` gera para este novo corpo.
    const saida = new FormData();
    for (const [chave, valor] of entrada.entries()) saida.append(chave, valor);
    corpo = saida;
  }

  const cookie = request.headers.get("cookie");
  const encaminhado = clientForwardedFor(request);
  Object.assign(cabecalhos, cookie ? { cookie } : {}, encaminhado ? { "x-forwarded-for": encaminhado } : {}, encaminharOrigem(request));

  const prefixo = opcoes.prefixo ?? "";
  const url = `${apiBaseUrl()}${prefixo}/${caminho.replace(/^\//, "")}${consultaDe(opcoes.consulta)}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: opcoes.metodo,
      headers: cabecalhos,
      body: corpo,
      signal: AbortSignal.timeout(opcoes.tempoMaximoMs ?? TEMPO_MAXIMO_MS),
      cache: "no-store",
    });
  } catch {
    return erroLocal(503, "SERVICO_INDISPONIVEL", opcoes.mensagemIndisponivel ?? "API indisponível");
  }

  return repassar(upstream);
}

async function repassar(upstream: Response): Promise<Response> {
  const texto = await upstream.text();
  const resposta = new Response(texto, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
  for (const setCookie of upstream.headers.getSetCookie()) {
    resposta.headers.append("set-cookie", setCookie);
  }
  return resposta;
}

type Ids = Record<string, string>;
type Consulta = OpcoesDoProxy["consulta"];

/** `/clientes/**` e demais rotas na raiz da API. */
export const proxyApiMutation = (request: Request, metodo: "POST" | "PATCH", modelo: string, ids?: Ids) =>
  proxyar(request, { metodo, modelo, ids });

export const proxyAuthPost = (request: Request, modelo: string, ids?: Ids) =>
  proxyar(request, { metodo: "POST", prefixo: "/auth", modelo, ids, mensagemIndisponivel: "auth service unavailable" });

export const proxyAuthPut = (request: Request, modelo: string, ids?: Ids) =>
  proxyar(request, { metodo: "PUT", prefixo: "/auth", modelo, ids, mensagemIndisponivel: "auth service unavailable" });

export const proxyAuthGet = (request: Request, modelo: string, ids?: Ids, consulta?: Consulta) =>
  proxyar(request, { metodo: "GET", prefixo: "/auth", modelo, ids, consulta, mensagemIndisponivel: "auth service unavailable" });

export const proxyEnergyPost = (request: Request, modelo: string, ids?: Ids) =>
  proxyar(request, { metodo: "POST", prefixo: "/energy", modelo, ids, mensagemIndisponivel: "energy service unavailable" });

export const proxyCommercialPost = (request: Request, modelo: string, ids?: Ids) =>
  proxyar(request, {
    metodo: "POST",
    prefixo: "/commercial",
    modelo,
    ids,
    mensagemIndisponivel: "commercial service unavailable",
  });

export const proxyComprasPost = (request: Request, modelo: string, ids?: Ids, consulta?: Consulta) =>
  proxyar(request, {
    metodo: "POST",
    prefixo: "/compras",
    modelo,
    ids,
    consulta,
    mensagemIndisponivel: "serviço de compras indisponível",
  });

/** Criação do pedido de compra: `multipart`, orçamento anexado na geração. */
export const proxyComprasUpload = (request: Request, modelo: string) =>
  proxyar(request, {
    metodo: "POST",
    prefixo: "/compras",
    modelo,
    corpo: "multipart",
    tempoMaximoMs: TEMPO_MAXIMO_UPLOAD_MS,
    mensagemIndisponivel: "serviço de compras indisponível",
  });
