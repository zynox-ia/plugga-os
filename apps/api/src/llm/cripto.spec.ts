import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ChaveMestraAusenteError,
  chaveMestraConfigurada,
  cifrar,
  decifrar,
  mascarar,
  SegredoCorrompidoError,
} from "./cripto.js";

/**
 * A cifra dos segredos.
 *
 * O que se prova aqui é a propriedade que justifica guardar credencial no banco,
 * contra a norma do projeto: **o banco sozinho não basta**. Sem a chave-mestra do
 * ambiente, o dump — que vai para o MinIO todo dia — não entrega nada.
 */

const anterior = process.env.SECRETS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  if (anterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = anterior;
});

describe("cifra dos segredos", () => {
  it("devolve o mesmo texto depois de ida e volta", () => {
    const chave = "sk-or-v1-exemplo-de-credencial";

    expect(decifrar(cifrar(chave))).toBe(chave);
  });

  it("nunca produz o mesmo criptograma duas vezes para o mesmo texto", () => {
    // IV novo a cada gravação. Reusar IV com a mesma chave quebra o GCM por
    // completo, e é o erro clássico de quem guarda um IV fixo em constante.
    const a = cifrar("mesma-chave");
    const b = cifrar("mesma-chave");

    expect(a.conteudo).not.toBe(b.conteudo);
    expect(a.iv).not.toBe(b.iv);
  });

  it("recusa decifrar com outra chave-mestra, em vez de devolver lixo", () => {
    const guardado = cifrar("sk-or-v1-exemplo");
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    expect(() => decifrar(guardado)).toThrow(SegredoCorrompidoError);
  });

  it("denuncia adulteração do valor guardado", () => {
    // É o que o GCM compra além do sigilo: quem editar a linha no banco não
    // consegue trocar a chave por outra sem que a leitura falhe.
    const guardado = cifrar("sk-or-v1-exemplo");
    const adulterado = { ...guardado, conteudo: Buffer.from("outro valor").toString("base64") };

    expect(() => decifrar(adulterado)).toThrow(SegredoCorrompidoError);
  });

  it("exige chave-mestra e diz como gerar", () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;

    expect(chaveMestraConfigurada()).toBe(false);
    expect(() => cifrar("x")).toThrow(ChaveMestraAusenteError);
    expect(() => cifrar("x")).toThrow(/openssl rand -base64 32/);
  });

  it("recusa chave-mestra do tamanho errado em vez de cifrar mais fraco", () => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.from("curta demais").toString("base64");

    expect(() => cifrar("x")).toThrow(/exatamente 32/);
  });

  it("mascara mostrando só os quatro últimos", () => {
    expect(mascarar("sk-or-v1-abcdefgh1234")).toBe("••••1234");
    // Segredo curto não vira dica: sem quatro caracteres, não mostra nenhum.
    expect(mascarar("abc")).toBe("••••");
  });
});
