import { describe, expect, it } from "vitest";

import type { SessionCacheEntry } from "./session-cache";
import { abrirEntrada, selarEntrada } from "./session-cache-hmac";

const CHAVE = "chave-hmac-de-teste-com-mais-de-32-caracteres-xyz";
const OUTRA_CHAVE = "outra-chave-hmac-de-teste-com-mais-de-32-caracteres";

const entrada: SessionCacheEntry = {
  user: {
    id: "u-1",
    email: "ana@plugga.local",
    name: "Ana",
    status: "active",
    access: { platformRoles: [], companies: [] },
  },
};

describe("selo HMAC das entradas do cache de sessão (T115)", () => {
  it("com a chave ligada, ida e volta devolve a mesma entrada", () => {
    const selada = selarEntrada("hash-1", entrada, CHAVE);
    expect(selada.startsWith("h1.")).toBe(true);
    expect(abrirEntrada("hash-1", selada, CHAVE)).toEqual(entrada);
  });

  it("entrada adulterada é recusada (promoção de papel no Redis)", () => {
    const selada = selarEntrada("hash-1", entrada, CHAVE);
    const adulterada = selada.replace('"platformRoles":[]', '"platformRoles":["admin"]');
    expect(adulterada).not.toBe(selada);
    expect(abrirEntrada("hash-1", adulterada, CHAVE)).toBeNull();
  });

  it("entrada selada com outra chave é recusada", () => {
    expect(abrirEntrada("hash-1", selarEntrada("hash-1", entrada, OUTRA_CHAVE), CHAVE)).toBeNull();
  });

  it("entrada copiada para a chave de outra sessão é recusada", () => {
    expect(abrirEntrada("hash-2", selarEntrada("hash-1", entrada, CHAVE), CHAVE)).toBeNull();
  });

  it("com a chave ligada, JSON puro sem selo (forjado ou legado) é recusado", () => {
    expect(abrirEntrada("hash-1", JSON.stringify(entrada), CHAVE)).toBeNull();
  });

  it("selo truncado ou lixo viram miss, nunca exceção", () => {
    expect(abrirEntrada("hash-1", "h1.", CHAVE)).toBeNull();
    expect(abrirEntrada("hash-1", "h1.abc", CHAVE)).toBeNull();
    expect(abrirEntrada("hash-1", "h1..{}", CHAVE)).toBeNull();
    expect(abrirEntrada("hash-1", "não é json", undefined)).toBeNull();
  });

  it("entrada bem selada, mas fora do formato esperado, é recusada", () => {
    const selada = selarEntrada("hash-1", { user: { id: 1 } } as unknown as SessionCacheEntry, CHAVE);
    expect(abrirEntrada("hash-1", selada, CHAVE)).toBeNull();
  });

  describe("sem a chave (padrão): comportamento de sempre", () => {
    it("grava JSON puro e lê JSON puro", () => {
      const bruto = selarEntrada("hash-1", entrada, undefined);
      expect(bruto).toBe(JSON.stringify(entrada));
      expect(abrirEntrada("hash-1", bruto, undefined)).toEqual(entrada);
    });

    it("entrada selada (de uma configuração anterior) é tratada como miss", () => {
      expect(abrirEntrada("hash-1", selarEntrada("hash-1", entrada, CHAVE), undefined)).toBeNull();
    });
  });
});
