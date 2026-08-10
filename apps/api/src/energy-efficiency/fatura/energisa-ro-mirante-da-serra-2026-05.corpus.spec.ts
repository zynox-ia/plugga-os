import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";
import { linhasImpressas, linhasPorColuna } from "./linhas.js";

/**
 * Energisa Rondônia — Mirante da Serra 05/2026, DANF3E de mercado livre.
 *
 * Falha como a Brasília, e a explicação do layout DANF3E está lá. O que este
 * caso acrescenta é o **mercado livre visto do lado da distribuidora**: a
 * fatura cobra só o fio, e o que se paga de energia vem em nota fiscal separada
 * do comercializador. Por isso a página tem linhas negativas grandes de crédito
 * APCEI (-3.485,66, -609,34, -4.788,88) ao lado das linhas de TUSD. Uma leitura
 * que um dia aprenda o DANF3E e some tudo como se fosse cobrança vai errar
 * feio, e este é o caso que pega isso.
 *
 * **Não há caso golden para esta fatura.** O `fatura-ml-mirante` é a mesma
 * unidade em **07/2026** (total 47.689,40, dos quais 20.653,86 são energia de NF
 * Comerc); esta é a de referência "Junho / 2026", medida de 01/05 a 31/05, e a
 * parte da distribuidora soma 26.841,36. A conferência possível foi contra o
 * documento: o total impresso na linha "TOTAL:" é 26.841,36. **O detalhamento
 * item a item desta referência não tem contraparte conciliada e não foi
 * conferido por gente** — o que está congelado abaixo é a ausência de leitura,
 * que é verdadeira independentemente disso.
 *
 * A **competência sai 06/2026** e por acaso coincide com a referência impressa:
 * o valor vem do crédito "APCEI 06/2026", o primeiro `MM/AAAA` da página, e não
 * da referência, que está escrita por extenso. O mês do consumo é maio. A
 * coincidência aqui é o que torna o caso útil ao lado da Brasília: mesma regra,
 * um acerta e o outro erra, e nenhum dos dois por saber o que está fazendo.
 *
 * A **UC 0000265426-7** é o código do débito automático. O golden desta unidade
 * não registra UC ("conferir"), então não há com o que cruzar.
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
const NOME = "energisa-ro-mirante-da-serra-2026-05.pagina.json";
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

describe.skipIf(!DOCUMENTO)("Energisa Rondônia — Mirante da Serra 05/2026 (DANF3E)", () => {
  it("não fecha a ficha sozinha, e diz pelo nome o que faltou", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(false);
    expect(leitura().motivo).toBe("layout_desconhecido");
  });

  it("acerta a competência por acaso: o crédito APCEI é do mês da referência", () => {
    expect(leitura().identificacao.distribuidora).toBe("ENERGISA");
    // 06/2026 sai da linha "CREDITO TUSD KW-APCEI 06/2026", não da referência
    // impressa ("Junho / 2026", por extenso). Aqui os dois coincidem; na
    // Brasília e na Cantuária, não. É a mesma regra, e ela não sabe a diferença.
    expect(leitura().identificacao.competencia).toEqual({ mes: 6, ano: 2026 });
    expect(leitura().identificacao.unidadeConsumidora).toBe("0000265426-7");
  });

  it("não reconheceu nenhum item financeiro nesta fatura", () => {
    // É isto que o caso registra. Quando o leitor aprender este layout,
    // este teste fica vermelho — e é assim que se percebe que melhorou.
    expect(leitura().itens).toEqual([]);
  });

  it("o total impresso não chega à ficha: o corte por coluna o decepa", () => {
    const paginas = DOCUMENTO?.paginas ?? [];

    expect(linhasImpressas(paginas)).toContain(
      "TOTAL: 26.841,36 2.672,27 34.219,40 6.672,77",
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
