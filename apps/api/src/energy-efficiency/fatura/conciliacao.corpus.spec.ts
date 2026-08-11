import {
  avaliarConciliacaoLocal,
  camposDaFicha,
  type CamposDaConciliacao,
  itensParaConciliar,
} from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus, fixturesLocais } from "./corpus.js";
import { lerPorRegras, leituraProvada, type LeituraDaFatura } from "./leitura.js";

/**
 * O caminho inteiro, da folha até o botão — a fatura de verdade atravessando a
 * fronteira servidor→tela.
 *
 * **Por que este arquivo existe.** Em 11/08/2026 uma fatura da Roraima subiu em
 * produção e o botão de abrir o estudo nasceu desabilitado, sem dizer por quê. O
 * corpus não pegou, e não pegaria nem com cem faturas: ele exercitava
 * `lerPorRegras` e parava ali. O defeito estava depois, no navegador, onde a
 * tela reclassificava cada linha com um vocabulário próprio. A frase "seis
 * distribuidoras cobertas" era verdadeira e enganosa — cobertas **no leitor**. O
 * caminho que o usuário percorre nunca tinha sido exercitado ponta a ponta com
 * nenhuma das doze.
 *
 * Então este teste lê a fatura e monta a conciliação **como a tela monta**,
 * chamando as mesmas funções que `nova-fatura-view.tsx` chama —
 * `itensParaConciliar`, `camposDaFicha`, `avaliarConciliacaoLocal` — e não uma
 * imitação delas. Imitar era o problema.
 *
 * **O que ele afirma é o estado real, não o desejado.** Oito das doze não ficam
 * prontas, e isso é defeito de leitura a consertar nos degraus da escada. O
 * valor de congelar a partição é o de sempre: enquanto ela não melhorar, também
 * não pode piorar sem alguém notar.
 */

/** Os campos da ficha que a tela oferece para conferência, na mesma ordem. */
const CAMPOS: readonly (keyof CamposDaConciliacao)[] = [
  "valorTotal",
  "consumoPontaKwh",
  "consumoForaPontaKwh",
  "tarifaPonta",
  "tarifaForaPonta",
  "valorPonta",
  "valorForaPonta",
  "valorDemanda",
  "demandaContratadaKw",
  "demandaMedidaPontaKw",
  "demandaMedidaForaPontaKw",
  "tarifaDemanda",
  "valorReativo",
  "valorBeneficioFiscal",
  "valorMultasJurosEncargos",
];

/**
 * A conciliação como a tela a monta no primeiro instante: sem ninguém ter
 * tocado em nada.
 *
 * É esse instante que importa. "Fica pronta" aqui quer dizer *sem intervenção
 * humana* — a pessoa confere e clica, não conserta.
 */
function comoATelaMonta(leitura: LeituraDaFatura) {
  // A tela guarda a ficha como texto, porque é o que um `<input>` devolve, e a
  // reconverte na hora de avaliar. O caminho é reproduzido inteiro: arredondar
  // aqui esconderia justamente o tipo de perda que se quer flagrar.
  const ficha: Record<string, string> = {};
  for (const campo of CAMPOS) ficha[campo] = String(leitura.invoice[campo] ?? 0);

  return avaliarConciliacaoLocal(itensParaConciliar(leitura.itens), camposDaFicha(ficha));
}

function leitura(slug: string): LeituraDaFatura {
  const documento = fixtureDoCorpus(`${slug}.pagina.json`);
  if (!documento) throw new Error(`${slug} não está no corpus local`);
  return lerPorRegras(documento);
}

/**
 * A tela libera o estudo sozinha. São as mesmas quatro que fecham a Trava 1 no
 * portão — e é essa igualdade que o defeito quebrava.
 */
const PRONTAS = [
  "amazonas-tbt-2024-12",
  "ambar-porteira-2026-06",
  "roraima-jardim-floresta-2026-06",
  "roraima-santa-tereza-2026-06",
];

/**
 * O leitor monta a ficha, mas a soma dos itens não bate com o total impresso.
 * A tela tem de dizer isso pela diferença, não por campo divergente: os campos
 * conferem entre si, o que falta é uma linha.
 */
const SOMA_NAO_FECHA: readonly { slug: string; diferenca: number }[] = [
  { slug: "amazonas-tff-2026-04", diferenca: -562.5 },
  { slug: "ambar-alvorada-2026-06", diferenca: 604.12 },
];

/**
 * Nem ficha monta: zero ou quase zero itens reconhecidos. A tela cai no
 * preenchimento manual, e o que ela reclama é dos campos críticos vazios.
 */
const SEM_FICHA = [
  "amazonas-tff-2026-05",
  "energisa-acre-rio-branco-2026-06",
  "energisa-ro-brasilia-2026-06",
  "energisa-ro-cantuaria-2026-06",
  "energisa-ro-mirante-da-serra-2026-05",
  "equatorial-pa-rodrigues-2026-06",
];

const FIXTURES = fixturesLocais();

if (FIXTURES.length === 0) console.warn(avisoDeCorpusAusente("o corpus de faturas"));

describe.skipIf(FIXTURES.length === 0)("da fatura até o botão de abrir o estudo", () => {
  it("o corpus é o que foi medido: doze faturas, seis distribuidoras", () => {
    // Fixture nova entra por aqui primeiro, e o veredicto dela tem de ser
    // escrito à mão numa das três listas — de propósito, por quem a acrescenta.
    expect(FIXTURES.map((nome) => nome.replace(/\.pagina\.json$/, "")).sort()).toEqual(
      [...PRONTAS, ...SOMA_NAO_FECHA.map(({ slug }) => slug), ...SEM_FICHA].sort(),
    );
  });

  it.each(PRONTAS)("%s fica pronta sem ninguém tocar em nada", (slug) => {
    const avaliacao = comoATelaMonta(leitura(slug));

    // Nenhum campo crítico em desacordo com as linhas que o alimentam. É o que
    // travava a Roraima: `Consumo F/Ponta` classificado como consumo em ponta
    // fazia `ponta` e `fora ponta` divergirem ao mesmo tempo.
    expect(avaliacao.camposInvalidos).toEqual([]);
    expect(avaliacao.multiplicacoesInvalidas).toBe(0);
    expect(Math.abs(avaliacao.diferenca)).toBeLessThanOrEqual(0.005);
    expect(avaliacao.pronta).toBe(true);
  });

  it.each(SOMA_NAO_FECHA)("$slug fica pendente pela soma, não por categoria", ({
    slug,
    diferenca,
  }) => {
    const lida = leitura(slug);
    const avaliacao = comoATelaMonta(lida);

    // O leitor chegou até a ficha: os campos essenciais estão lá.
    expect(lida.aproveitavel).toBe(true);
    // E o motivo de a tela travar é exatamente o que falta — uma linha —, não um
    // campo que a classificação estragou. A diferença é congelada porque é ela
    // que diz de quanto é o buraco, e é por ela que se saberá que melhorou.
    expect(avaliacao.camposInvalidos).toEqual([]);
    expect(avaliacao.diferenca).toBeCloseTo(diferenca, 2);
    expect(avaliacao.pronta).toBe(false);
  });

  it.each(SEM_FICHA)("%s cai no preenchimento manual, dizendo o que falta", (slug) => {
    const lida = leitura(slug);
    const avaliacao = comoATelaMonta(lida);

    expect(lida.aproveitavel).toBe(false);
    expect(avaliacao.pronta).toBe(false);
    // Sem itens de consumo não há o que provar, e a tela nomeia os dois campos
    // críticos em vez de deixar o botão apagado em silêncio.
    expect(avaliacao.camposInvalidos).toEqual(["ponta", "fora ponta"]);
  });

  /**
   * A propriedade que o defeito quebrava, dita como propriedade.
   *
   * O servidor decide se a leitura está provada pela Trava 1; a tela decide se o
   * botão acende. Eram dois julgamentos com dois vocabulários, e nada garantia
   * que concordassem — a Roraima fechava a Trava 1 no servidor e travava na
   * tela. Concordar não é coincidência das doze: é o contrato.
   */
  it.each(FIXTURES.map((nome) => nome.replace(/\.pagina\.json$/, "")))(
    "%s: a tela e a Trava 1 do servidor dão o mesmo veredicto",
    (slug) => {
      const lida = leitura(slug);

      expect(comoATelaMonta(lida).pronta).toBe(leituraProvada(lida));
    },
  );

  /**
   * A Santa Tereza, nomeada, porque é a fatura que originou o ticket e o
   * critério de aceite fala dela: fica pronta sem intervenção humana.
   *
   * Ela cobre os três defeitos de uma vez — `Consumo F/Ponta` classificado como
   * ponta, `En R Exc Ponta` classificado como consumo, e a bandeira informativa
   * somada de volta ao total pela tela.
   */
  it("a Santa Tereza: F/Ponta, reativo e bandeira informativa, cada um no seu lugar", () => {
    const lida = leitura("roraima-santa-tereza-2026-06");
    const itens = itensParaConciliar(lida.itens);

    const categoriaDe = (rotulo: string) =>
      itens.find((item) => item.nome === rotulo)?.categoria;

    expect(categoriaDe("Consumo Ponta")).toBe("consumo_ponta");
    expect(categoriaDe("Consumo F/Ponta")).toBe("consumo_fora_ponta");
    expect(categoriaDe("Demanda Ponta sem ICMS")).toBe("demanda_faturada");
    expect(categoriaDe("Demanda Ponta com ICMS")).toBe("demanda_faturada");

    // A bandeira que a aritmética provou informativa chega à tela fora do total
    // — e continua fora dele quando a tela soma.
    const bandeira = itens.find((item) => /bandeira/i.test(item.nome));
    expect(bandeira?.compoeTotal).toBe(false);

    expect(comoATelaMonta(lida).pronta).toBe(true);
  });
});
