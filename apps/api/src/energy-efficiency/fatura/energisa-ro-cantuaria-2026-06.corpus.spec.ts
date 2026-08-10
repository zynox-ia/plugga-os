import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";
import { linhasImpressas, linhasPorColuna } from "./linhas.js";

/**
 * Energisa Rondônia — Cantuária 06/2026, o DANF3E com demanda nos dois postos.
 *
 * Falha pelo mesmo motivo da Brasília, e a explicação do layout DANF3E está
 * lá — tabela de itens dividindo a faixa com o quadro de tributos, oito números
 * por linha impressa, e rótulo sozinho no corte por coluna. Aqui: zero itens,
 * `invoice` vazia, `layout_desconhecido`.
 *
 * Entrou junto porque a cobrança é mais pesada que a da Brasília e cobre uma
 * combinação que a outra não tem: **demanda faturada em ponta e em fora ponta,
 * com linha de "não consumida" em cada uma** — 272 kW a 134,051980 mais 88 kW
 * NC a 107,911840 na ponta, 280 kW a 49,826320 mais 80 kW NC a 40,110190 fora
 * ponta, 63.118,55 no conjunto. Quando o DANF3E for aprendido, é este caso que
 * diz se as quatro linhas foram somadas certo.
 *
 * **Conferido** contra o caso golden `fatura-cantuaria-2026-06`: total
 * 68.542,76, o mesmo impresso na linha "TOTAL:" da página; TUSD ponta 13.876
 * kWh = 2.928,34, TUSD fora ponta 118.925 kWh = 25.097,50, encargo Covid 679,87,
 * débitos APCEI 45,03, créditos APCEI -24.179,40, COSIP 849,67. Nada é lido hoje.
 *
 * A **competência sai 05/2026** pela mesma causa da Brasília: é o mês do débito
 * APCEI, o primeiro `MM/AAAA` da página. A referência impressa é "Julho / 2026",
 * por extenso; o consumo medido é 31/05 a 30/06. A **UC 0002185835-2** é o
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
 * JSON mora no balde do corpus no MinIO e chega por `corpus:baixar`. Sem a
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
  it("não fecha a ficha sozinha, e diz pelo nome o que faltou", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(false);
    expect(leitura().motivo).toBe("layout_desconhecido");
  });

  it("erra a competência: pega o mês do lançamento retroativo", () => {
    expect(leitura().identificacao.distribuidora).toBe("ENERGISA");
    // 05/2026 é o mês do débito APCEI, não a referência ("Julho / 2026", por
    // extenso) nem o mês medido (junho).
    expect(leitura().identificacao.competencia).toEqual({ mes: 5, ano: 2026 });
    expect(leitura().identificacao.unidadeConsumidora).toBe("0002185835-2");
  });

  it("não reconheceu nenhum item financeiro nesta fatura", () => {
    // É isto que o caso registra. Quando o leitor aprender este layout,
    // este teste fica vermelho — e é assim que se percebe que melhorou.
    expect(leitura().itens).toEqual([]);
  });

  it("o total impresso não chega à ficha: o corte por coluna o decepa", () => {
    const paginas = DOCUMENTO?.paginas ?? [];

    expect(linhasImpressas(paginas)).toContain(
      "TOTAL: 68.542,76 7.066,83 79.122,40 15.428,85",
    );
    expect(linhasPorColuna(paginas)).toContain("TOTAL:");
    expect(leitura().invoice.valorTotal).toBeUndefined();
  });

  it("sem item, não há aritmética a conferir", () => {
    expect(leitura().conferencia.confirmados).toBe(0);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });

  it("declara exatamente o que ainda depende de conferência humana", () => {
    expect(leitura().camposParaConfirmar).toEqual([
      "layout não reconhecido: nenhum item financeiro identificado",
    ]);
  });
});
