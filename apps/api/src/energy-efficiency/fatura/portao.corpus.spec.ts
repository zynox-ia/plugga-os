import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus, fixturesLocais } from "./corpus.js";
import { lerPorRegras, leituraProvada } from "./leitura.js";

/**
 * A medição do portão, congelada como regressão.
 *
 * O critério de aceite do ticket é um número — **nenhuma fatura que fechava**
 * **deixa de fechar** — e um número medido uma vez, escrito num relatório,
 * envelhece no dia seguinte. Aqui ele vira teste: a partição das doze faturas
 * entre "a Trava 1 fecha" e "não fecha" está escrita abaixo, e qualquer mudança
 * que mexa nela precisa mexer neste arquivo, de propósito e por escrito.
 *
 * Medido em 11/08/2026, com `pnpm --filter @plugga/api portao:medir`:
 *
 * | Situação | Faturas |
 * | --- | --- |
 * | a soma fecha, e a leitura não escala | Santa Tereza, Jardim Floresta, Porteira, TBT |
 * | lê a ficha, a soma não fecha — **passou a escalar** | Alvorada (sobram R$ 604,12), TFF 04/2026 (faltam R$ 562,50) |
 * | nem ficha monta — **já escalava antes** | as quatro Energisa e a Equatorial (zero itens), TFF 05/2026 (OCR, um item) |
 *
 * As seis da última linha são o ponto que o ticket tinha invertido: ficha não
 * montada é `aproveitavel: false`, e o portão **antigo** já não retornava cedo
 * nesse caso. Elas escalavam antes e escalam agora; esta mudança não as toca.
 *
 * O que este arquivo **não** faz é dizer que a partição é boa. Oito das doze não
 * fecham a Trava 1, e isso é defeito de leitura a consertar nos degraus da
 * escada — não aqui. O valor de congelá-la é outro: enquanto ela não melhorar,
 * ela também não pode piorar sem alguém notar.
 *
 * Sem o corpus baixado o arquivo inteiro é pulado, como os outros de corpus.
 */
const FECHAM = [
  "amazonas-tbt-2024-12",
  "ambar-porteira-2026-06",
  "roraima-jardim-floresta-2026-06",
  "roraima-santa-tereza-2026-06",
];

/** Monta a ficha, mas a soma não bate: é o que passou a escalar. */
const PASSARAM_A_ESCALAR = ["amazonas-tff-2026-04", "ambar-alvorada-2026-06"];

/** Nem ficha monta, então já escalava com o portão antigo. */
const JA_ESCALAVAM = [
  "amazonas-tff-2026-05",
  "energisa-acre-rio-branco-2026-06",
  "energisa-ro-brasilia-2026-06",
  "energisa-ro-cantuaria-2026-06",
  "energisa-ro-mirante-da-serra-2026-05",
  "equatorial-pa-rodrigues-2026-06",
];

const FIXTURES = fixturesLocais();

if (FIXTURES.length === 0) console.warn(avisoDeCorpusAusente("o corpus de faturas"));

function leitura(slug: string) {
  const documento = fixtureDoCorpus(`${slug}.pagina.json`);
  if (!documento) throw new Error(`${slug} não está no corpus local`);
  return lerPorRegras(documento);
}

describe.skipIf(FIXTURES.length === 0)("o portão da Trava 1 contra o corpus", () => {
  it("o corpus é o que foi medido: doze faturas, seis distribuidoras", () => {
    // Uma fixture nova entra por este teste primeiro. É o lembrete de que a
    // partição abaixo foi medida contra uma lista, e a lista mudou.
    expect(FIXTURES.map((nome) => nome.replace(/\.pagina\.json$/, "")).sort()).toEqual(
      [...FECHAM, ...PASSARAM_A_ESCALAR, ...JA_ESCALAVAM].sort(),
    );
  });

  it.each(FECHAM)("%s fecha a Trava 1 e não escala", (slug) => {
    // O número que decide se a mudança entra: estas quatro fechavam antes e
    // continuam fechando. Se uma cair aqui, a mudança de portão piorou a
    // leitura e não deve entrar — não ajuste a lista, conserte a leitura.
    expect(leituraProvada(leitura(slug))).toBe(true);
  });

  it.each(PASSARAM_A_ESCALAR)("%s monta a ficha, a soma não fecha, e agora escala", (slug) => {
    const lida = leitura(slug);

    // O portão antigo aprovava: cada item fecha na multiplicação.
    expect(lida.aproveitavel).toBe(true);
    // O novo não: a soma não bate com o total impresso.
    expect(leituraProvada(lida)).toBe(false);
    // E a ficha diz isso, para o caso de não haver visão configurada.
    expect(
      lida.camposParaConfirmar.some((campo) => /não fecha com o total impresso/.test(campo)),
    ).toBe(true);
  });

  it.each(JA_ESCALAVAM)("%s já escalava com o portão antigo, e nada muda", (slug) => {
    // `aproveitavel: false` é o que o portão antigo **não** aprovava. Estas seis
    // não são efeito desta mudança, e contá-las como tal inflaria o resultado.
    expect(leitura(slug).aproveitavel).toBe(false);
  });
});
