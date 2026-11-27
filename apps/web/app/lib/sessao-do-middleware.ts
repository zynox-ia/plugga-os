import { sessionUserSchema, type SessionUser } from "@plugga/shared";

import { safeRedirect, safeRelativePath } from "./safe-redirect.ts";

/**
 * Leitura da sessão no middleware (PLU-343). Só 401 e 403 de `GET /auth/me`
 * querem dizer "sem sessão" e levam ao login. Rede fora, tempo esgotado, 5xx,
 * qualquer outra recusa ou resposta fora do contrato querem dizer "API
 * indisponível": a sessão pode estar boa, e mandar a pessoa ao login a cada
 * reinício da API (deploy, modo watch) a derrubava sem motivo.
 */

/** Rota interna que mostra o aviso; o middleware reescreve para ela, mantendo o endereço. */
export const ROTA_DE_API_INDISPONIVEL = "/indisponivel";

/** Cabeçalho interno que o middleware passa às páginas com o endereço completo (caminho + query). */
export const CABECALHO_DO_CAMINHO = "x-plugga-caminho";

export type MotivoDaIndisponibilidade = "rede" | "tempo" | "servidor" | "contrato";

export type LeituraDaSessao =
  | { tipo: "autenticado"; usuario: SessionUser }
  | { tipo: "semSessao" }
  | { tipo: "indisponivel"; motivo: MotivoDaIndisponibilidade };

/** Tempo esgotado pelo `AbortSignal.timeout` ou por um abort explícito. */
function ehTempoEsgotado(erro: unknown): boolean {
  return erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");
}

export async function lerSessaoDaApi({ cookie, base, tempoMs, buscar = fetch }: {
  cookie: string | null;
  base: string;
  tempoMs: number;
  buscar?: typeof fetch;
}): Promise<LeituraDaSessao> {
  // Sem cookie não há o que perguntar à API: é sem sessão, e a API nem precisa estar de pé.
  if (!cookie) return { tipo: "semSessao" };

  let resposta: Response;
  try {
    resposta = await buscar(`${base}/auth/me`, {
      headers: { cookie },
      signal: AbortSignal.timeout(tempoMs),
      cache: "no-store",
    });
  } catch (erro) {
    return { tipo: "indisponivel", motivo: ehTempoEsgotado(erro) ? "tempo" : "rede" };
  }
  return lerRespostaDaSessao(resposta);
}

/**
 * O que a resposta de `GET /auth/me` (ou do espelho `/api/auth/me`) diz da
 * sessão: 401/403 sem sessão; outra recusa ou fora do contrato, indisponível.
 */
async function lerRespostaDaSessao(resposta: Response): Promise<LeituraDaSessao> {
  if (resposta.status === 401 || resposta.status === 403) return { tipo: "semSessao" };
  if (!resposta.ok) return { tipo: "indisponivel", motivo: "servidor" };

  try {
    const resultado = sessionUserSchema.safeParse(await resposta.json());
    return resultado.success ? { tipo: "autenticado", usuario: resultado.data } : { tipo: "indisponivel", motivo: "contrato" };
  } catch {
    return { tipo: "indisponivel", motivo: "contrato" };
  }
}

/**
 * O passo do aviso depois de consultar o espelho `/api/auth/me`, pelo mesmo
 * contrato do middleware: voltar à página só com a sessão válida, porque um 2xx
 * fora do contrato faria o middleware mostrar o aviso de novo, em laço.
 */
export async function passoDoTentarDeNovo(resposta: Response): Promise<"voltar" | "login" | "esperar"> {
  const leitura = await lerRespostaDaSessao(resposta);
  return leitura.tipo === "autenticado" ? "voltar" : leitura.tipo === "semSessao" ? "login" : "esperar";
}

/** Prazo de cada tentativa do aviso: a web responde rápido; o trecho até a API já tem o prazo do proxy. */
export const PRAZO_DA_TENTATIVA_MS = 10_000;

/**
 * Uma tentativa do aviso: consulta o espelho da sessão com prazo, então uma
 * conexão com a web que pare (no pedido ou no meio do corpo) vira "esperar" e
 * a próxima tentativa é agendada, em vez de congelar o aviso.
 */
export async function consultarSessaoParaVoltar(buscar: typeof fetch = fetch, prazoMs = PRAZO_DA_TENTATIVA_MS): Promise<"voltar" | "login" | "esperar"> {
  try {
    return await passoDoTentarDeNovo(await buscar("/api/auth/me", { cache: "no-store", signal: AbortSignal.timeout(prazoMs) }));
  } catch {
    // Sem rede até a web, ou o prazo esgotado: tenta de novo na próxima volta.
    return "esperar";
  }
}

/** O que o middleware faz com a página pedida. */
export type DecisaoDoMiddleware =
  | { acao: "seguir" }
  /** Para o login, guardando o destino (exceto a página inicial). */
  | { acao: "login"; redirectTo: string | null }
  /** Para a página inicial (já logado no /login, ou sem acesso à página). */
  | { acao: "inicio" }
  /** Mostra o aviso de API indisponível no mesmo endereço, sem redirecionar. */
  | { acao: "indisponivel" };

export function decidirPagina(pathname: string, leitura: LeituraDaSessao, podeAbrir: (usuario: SessionUser) => boolean, busca = ""): DecisaoDoMiddleware {
  if (pathname === "/login") {
    // Com a API fora, não dá para saber se já está logado: o formulário aparece e o login diz o resto.
    return leitura.tipo === "autenticado" ? { acao: "inicio" } : { acao: "seguir" };
  }
  if (leitura.tipo === "indisponivel") return { acao: "indisponivel" };
  // O destino guarda a query (ex.: a ficha aberta em ?fornecedor=…), não só o caminho.
  if (leitura.tipo === "semSessao") return { acao: "login", redirectTo: pathname === "/" && !busca ? null : `${pathname}${busca}` };
  // O aviso não é uma tela com acesso próprio: logado, abre (a página leva ao destino quando a API responde).
  if (pathname === ROTA_DE_API_INDISPONIVEL) return { acao: "seguir" };
  return podeAbrir(leitura.usuario) ? { acao: "seguir" } : { acao: "inicio" };
}


/**
 * Para onde ir quando a API responder de novo. `destino` (?de=, do
 * exigirPagina) vence; senão é o próprio endereço (o middleware reescreveu sem
 * mudar a URL); se a pessoa abriu /indisponivel direto, a página inicial.
 */
export function destinoAoVoltar(destino: string | null, caminhoAtual: string, busca: string): string {
  if (destino) return destino;
  if (caminhoAtual === ROTA_DE_API_INDISPONIVEL) return "/";
  // O endereço da janela passa pela mesma validação: normalizado, não sai da origem (PLU-357).
  return safeRedirect(`${caminhoAtual}${busca}`);
}

/** O `?de=` do aviso, só se for um caminho da mesma origem (nada de //outro-site, javascript: etc.). */
export function destinoDoParametro(de: string | string[] | undefined | null): string | null {
  // Repetido (`?de=a&de=b`), o parâmetro chega como array: não vale.
  return typeof de === "string" ? safeRelativePath(de) : null;
}

/**
 * Para onde o aviso volta (PLU-357). Reescrito pelo middleware, o aviso vem
 * com a query da PÁGINA pedida, que pode ter um `de` dela: o destino é o
 * cabeçalho interno que o middleware sempre sobrescreve, com o endereço
 * pedido. Só aberto direto (o `exigirPagina` manda para
 * `/indisponivel?de=…`) vale o `?de=`.
 */
export function destinoDoAviso(cabecalho: string | null, de: string | string[] | undefined | null): string | null {
  const pedida = safeRelativePath(cabecalho);
  if (!pedida) return null;
  // O cabeçalho no próprio aviso é a evidência de abertura direta: só então o `?de=` vale.
  return pedida.split(/[?#]/)[0] === ROTA_DE_API_INDISPONIVEL ? destinoDoParametro(de) : pedida;
}

/**
 * Destino completo para o exigirPagina (que só conhece o caminho da rota): o
 * endereço que o middleware mandou no cabeçalho, com a query, se for da mesma
 * origem e da mesma página; senão, só o caminho.
 */
export function caminhoCompleto(caminho: string, cabecalho: string | null): string {
  const completo = safeRelativePath(cabecalho);
  if (!completo) return caminho;
  const soCaminho = completo.split(/[?#]/)[0];
  return soCaminho === caminho || soCaminho?.startsWith(`${caminho}/`) ? completo : caminho;
}
