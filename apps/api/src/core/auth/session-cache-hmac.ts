import { createHmac, timingSafeEqual } from "node:crypto";

import type { SessionCacheEntry } from "./session-cache";

/**
 * Autenticação das entradas do cache de sessão (US11, T115, FR-049).
 *
 * O cache guarda o usuário e TODO o acesso dele (papéis por empresa e
 * departamento), e a API confia nele para autorizar sem ir ao Postgres. Quem
 * consegue gravar no Redis, mas não conhece a chave, não pode fabricar nem
 * promover uma entrada: sem o HMAC válido a entrada é tratada como cache miss e
 * a sessão é relida do Postgres, que é a fonte da verdade.
 *
 * Desligado por padrão (sem `SESSION_CACHE_HMAC_KEY` o formato e o
 * comportamento são os de sempre). A entrada selada é `h1.<mac>.<json>`; o MAC
 * cobre também o `tokenHash` da chave, então uma entrada copiada para a chave
 * de outra sessão também é recusada.
 */

const MARCA = "h1.";

function calcularMac(chave: string, tokenHash: string, json: string): string {
  return createHmac("sha256", chave).update(tokenHash).update("\n").update(json).digest("base64url");
}

/** Serializa a entrada para o Redis: selada quando há chave, JSON puro como sempre quando não há. */
export function selarEntrada(tokenHash: string, entry: SessionCacheEntry, chave: string | undefined): string {
  const json = JSON.stringify(entry);
  return chave ? `${MARCA}${calcularMac(chave, tokenHash, json)}.${json}` : json;
}

/** Formato mínimo que o resto do app assume; o que não bate é descartado como miss. */
function entradaBemFormada(valor: unknown): valor is SessionCacheEntry {
  if (typeof valor !== "object" || valor === null) return false;
  const user = (valor as { user?: unknown }).user;
  if (typeof user !== "object" || user === null) return false;
  const u = user as Record<string, unknown>;
  return (
    typeof u.id === "string" &&
    typeof u.email === "string" &&
    typeof u.name === "string" &&
    typeof u.status === "string" &&
    typeof u.access === "object" &&
    u.access !== null
  );
}

/**
 * Lê o que veio do Redis. Devolve `null` (miss) para entrada adulterada,
 * selada com outra chave, fora do formato, sem selo quando a chave está ligada,
 * ou selada quando a chave está desligada (reversão da configuração: não dá
 * para verificar, então se relê do banco).
 */
export function abrirEntrada(
  tokenHash: string,
  bruto: string,
  chave: string | undefined,
): SessionCacheEntry | null {
  let json: string;

  if (bruto.startsWith(MARCA)) {
    if (!chave) return null;
    const corpo = bruto.slice(MARCA.length);
    const separador = corpo.indexOf(".");
    if (separador <= 0) return null;
    const recebido = Buffer.from(corpo.slice(0, separador));
    json = corpo.slice(separador + 1);
    const esperado = Buffer.from(calcularMac(chave, tokenHash, json));
    if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null;
  } else {
    // Sem selo: só vale com a chave desligada (comportamento de sempre).
    if (chave) return null;
    json = bruto;
  }

  try {
    const valor: unknown = JSON.parse(json);
    return entradaBemFormada(valor) ? valor : null;
  } catch {
    return null;
  }
}
