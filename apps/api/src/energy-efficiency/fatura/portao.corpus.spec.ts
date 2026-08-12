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
 * Medido em 12/08/2026, com `pnpm --filter @plugga/api portao:medir`:
 *
 * | Situação | Faturas |
 * | --- | --- |
 * | a soma fecha, e a leitura não escala | As doze faturas: seis distribuidoras, incluindo Equatorial, TFF 05/2026 e as quatro Energisa |
 * | nem ficha monta | Nenhuma |
 *
 * As doze agora fecham ficha e soma juntas. O valor de congelar esta medição é
 * impedir que uma melhoria futura faça qualquer uma delas regredir em silêncio.
 *
 * Sem o corpus baixado o arquivo inteiro é pulado, como os outros de corpus.
 */
const FECHAM = [
  "amazonas-tbt-2024-12",
  "amazonas-tff-2026-04",
  "amazonas-tff-2026-05",
  "ambar-alvorada-2026-06",
  "ambar-porteira-2026-06",
  "energisa-acre-rio-branco-2026-06",
  "energisa-ro-brasilia-2026-06",
  "energisa-ro-cantuaria-2026-06",
  "energisa-ro-mirante-da-serra-2026-05",
  "equatorial-pa-rodrigues-2026-06",
  "roraima-jardim-floresta-2026-06",
  "roraima-santa-tereza-2026-06",
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
    // medição abaixo foi feita contra uma lista, e a lista mudou.
    expect(FIXTURES.map((nome) => nome.replace(/\.pagina\.json$/, "")).sort()).toEqual(
      [...FECHAM].sort(),
    );
  });

  it.each(FECHAM)("%s fecha a Trava 1 e não escala", (slug) => {
    // Se uma cair aqui, a mudança piorou a leitura: não ajuste a lista,
    // conserte a extração.
    expect(leituraProvada(leitura(slug))).toBe(true);
  });
});
