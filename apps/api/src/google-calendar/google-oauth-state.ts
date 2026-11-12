import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { cifrar, decifrar } from "../llm/cripto.js";

/** O pedido de conexão vale por este tempo; depois é preciso começar de novo. */
export const VALIDADE_DO_STATE_MS = 10 * 60_000;

const TAMANHO_DO_IV = 12;
const TAMANHO_DA_TAG = 16;

type Carga = {
  v: 1;
  /** Quem pediu a conexão. */
  u: string;
  /** Vínculo com a sessão que pediu (hash do hash da sessão, nunca a própria sessão). */
  s: string;
  /** Verificador do PKCE: precisa ficar escondido até a troca do código. */
  c: string;
  /** Validade, em milissegundos desde a época. */
  e: number;
};

/** Par do PKCE (RFC 7636, método S256). */
export function novoPkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  return { codeVerifier, codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url") };
}

/**
 * O que a sessão deixa na carga do state. Derivado com um rótulo próprio: o hash
 * da sessão é a credencial de banco da pessoa e não pode viajar pela URL do Google,
 * nem cifrado.
 */
export function vinculoDaSessao(sessaoHash: string): string {
  return createHash("sha256").update(`google-calendar:${sessaoHash}`).digest("hex");
}

/**
 * Sela o pedido de conexão num valor opaco para o parâmetro `state`.
 *
 * Cifrado e autenticado (AES-256-GCM, a mesma cifra do cofre): quem vê a URL não
 * lê o verificador do PKCE, e quem tenta fabricar ou alterar um state falha na
 * autenticação. Não há nada guardado no servidor: o state carrega o que precisa
 * e o código de autorização do Google, de uso único, impede a repetição.
 */
export function selarState(entrada: { userId: string; sessaoHash: string; codeVerifier: string }, agora = Date.now()): string {
  const carga: Carga = {
    v: 1,
    u: entrada.userId,
    s: vinculoDaSessao(entrada.sessaoHash),
    c: entrada.codeVerifier,
    e: agora + VALIDADE_DO_STATE_MS,
  };
  const cifrado = cifrar(JSON.stringify(carga));
  return Buffer.concat([
    Buffer.from(cifrado.iv, "base64"),
    Buffer.from(cifrado.tag, "base64"),
    Buffer.from(cifrado.conteudo, "base64"),
  ]).toString("base64url");
}

/**
 * Abre o state e confere dono, sessão e validade. Devolve o verificador do PKCE,
 * ou `null` por QUALQUER motivo (adulterado, expirado, de outra pessoa, de outra
 * sessão): quem chama responde sempre a mesma coisa, sem dizer qual foi.
 */
export function abrirState(
  state: string,
  esperado: { userId: string; sessaoHash: string },
  agora = Date.now(),
): { codeVerifier: string } | null {
  try {
    const bytes = Buffer.from(state, "base64url");
    if (bytes.length <= TAMANHO_DO_IV + TAMANHO_DA_TAG) return null;
    const carga = JSON.parse(
      decifrar({
        iv: bytes.subarray(0, TAMANHO_DO_IV).toString("base64"),
        tag: bytes.subarray(TAMANHO_DO_IV, TAMANHO_DO_IV + TAMANHO_DA_TAG).toString("base64"),
        conteudo: bytes.subarray(TAMANHO_DO_IV + TAMANHO_DA_TAG).toString("base64"),
      }),
    ) as Partial<Carga>;

    if (carga.v !== 1 || typeof carga.u !== "string" || typeof carga.s !== "string" || typeof carga.c !== "string" || typeof carga.e !== "number") {
      return null;
    }
    if (carga.e <= agora) return null;
    if (!iguais(carga.u, esperado.userId) || !iguais(carga.s, vinculoDaSessao(esperado.sessaoHash))) return null;
    return { codeVerifier: carga.c };
  } catch {
    return null;
  }
}

function iguais(a: string, b: string): boolean {
  const esquerda = Buffer.from(a, "utf8");
  const direita = Buffer.from(b, "utf8");
  return esquerda.length === direita.length && timingSafeEqual(esquerda, direita);
}
