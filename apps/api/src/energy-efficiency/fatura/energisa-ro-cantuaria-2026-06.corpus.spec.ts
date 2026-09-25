import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import {
  lerPorRegras,
  leituraProvada,
  somaDoQueCompoeOTotal,
  type LeituraDaFatura,
} from "./leitura.js";
import { linhasImpressas } from "./linhas.js";

/**
 * Energisa Rondônia — Cantuária 06/2026, o DANF3E com demanda nos dois postos.
 *
 * Compartilha com a Brasília a forma DANF3E: tabela de itens dividindo a faixa
 * com o quadro de tributos e vários números por linha impressa. A leitura usa a
 * forma da linha e a aritmética, não o nome da distribuidora.
 *
 * Entrou junto porque a cobrança é mais pesada que a da Brasília e cobre uma
 * combinação que a outra não tem: **demanda faturada em ponta e em fora ponta,
 * com linha de "não consumida" em cada uma** — 272 kW a 134,051980 mais 88 kW
 * NC a 107,911840 na ponta, 280 kW a 49,826320 mais 80 kW NC a 40,110190 fora
 * ponta, 63.118,55 no conjunto. Este caso prova que as quatro linhas são somadas.
 *
 * **Conferido** contra o caso golden `fatura-cantuaria-2026-06`: total
 * 68.542,76, o mesmo impresso na linha "TOTAL:" da página; TUSD ponta 13.876
 * kWh = 2.928,34, TUSD fora ponta 118.925 kWh = 25.097,50, encargo Covid 679,87,
 * débitos APCEI 45,03, créditos APCEI -24.179,40, COSIP 849,67.
 *
 * A **competência sai 06/2026**, ancorada na leitura atual de 30/06. A
 * **UC 0002185835-2** é o
 * código do débito automático; o golden registra a conta contrato 9/18697841, e
 * qual dos dois é a unidade consumidora não foi confirmado.
 *
 * Fixture gerada por `pnpm --filter @plugga/api fatura:congelar`. O caso vive
 * aqui como a geometria da página, não como PDF: os fragmentos com posição são
 * o que a leitura consome, e congelá-los torna o teste determinístico sem
 * depender do arquivo original.
 *
 * **A fixture não está no git.** Ela é fatura de cliente, com o dado inteiro,
 * e git é container permanente, replicado em todo clone e sem revogação — o
 * JSON mora no balde do corpus no armazenamento e chega por `corpus:baixar`. Sem a
 * chave, este arquivo inteiro é pulado com a mensagem que explica o porquê.
 *
 * **Sem anonimização.** O texto desta fixture é o impresso na fatura,
 * incluindo titular, documento e endereço. Congelada sem `--anonimizar`.
 */
const NOME = "energisa-ro-cantuaria-2026-06.pagina.json";
const DOCUMENTO = fixtureDoCorpus(NOME);

if (!DOCUMENTO) console.warn(avisoDeCorpusAusente(NOME));

/**
 * A leitura, feita no primeiro caso que a pedir — nunca na coleta.
 *
 * O vitest executa o corpo de um `describe.skipIf` mesmo quando vai pular os
 * casos. Derivar qualquer coisa da fixture ali dentro quebraria o arquivo
 * inteiro em quem não baixou o corpus, que é exatamente o que o pulo existe
 * para evitar.
 */
let lida: LeituraDaFatura | null = null;
function leitura(): LeituraDaFatura {
  if (!DOCUMENTO) throw new Error(`${NOME} não está no corpus local`);
  return (lida ??= lerPorRegras(DOCUMENTO));
}

describe.skipIf(!DOCUMENTO)("Energisa Rondônia — Cantuária 06/2026 (DANF3E)", () => {
  it("monta uma ficha provada pela Trava 1", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
    expect(leituraProvada(leitura())).toBe(true);
    expect(leitura().camposParaConfirmar).toEqual([]);
  });

  it("usa o mês da leitura atual, não o lançamento retroativo", () => {
    expect(leitura().identificacao.distribuidora).toBe("ENERGISA");
    expect(leitura().identificacao.competencia).toEqual({ mes: 6, ano: 2026 });
    expect(leitura().identificacao.unidadeConsumidora).toBe("0002185835-2");
  });

  it("lê os números conferidos contra o caso golden", () => {
    expect(leitura().itens).toHaveLength(14);
    expect(leitura().invoice).toMatchObject({
      consumoPontaKwh: 13_876,
      consumoForaPontaKwh: 118_925,
      valorPonta: 2_928.34,
      valorForaPonta: 25_097.5,
      demandaMedidaPontaKw: 272,
      demandaMedidaForaPontaKw: 280,
      demandaContratadaKw: 360,
    });
    expect(leitura().invoice.valorDemanda).toBeCloseTo(63_118.55, 2);
    expect(leitura().invoice.valorReativo).toBeCloseTo(3.2, 2);
  });

  it("o primeiro valor de TOTAL: fecha exatamente com os itens", () => {
    const paginas = DOCUMENTO?.paginas ?? [];

    expect(linhasImpressas(paginas)).toContain(
      "TOTAL: 68.542,76 7.066,83 79.122,40 15.428,85",
    );
    expect(leitura().invoice.valorTotal).toBe(68_542.76);
    expect(somaDoQueCompoeOTotal(leitura().itens)).toBeCloseTo(68_542.76, 2);
  });

  it("julga todas as linhas que têm quantidade e tarifa pela regra normativa", () => {
    expect(leitura().conferencia.confirmados).toBe(7);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.semConferencia).toBe(7);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });
});
