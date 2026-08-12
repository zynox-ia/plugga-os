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
 * Energisa Rondônia — Brasília 06/2026, o caso-base da forma DANF3E.
 *
 * O primeiro dos quatro casos da Energisa neste corpus, e o que carrega a
 * explicação — `energisa-ro-cantuaria-2026-06`,
 * `energisa-ro-mirante-da-serra-2026-05` e `energisa-acre-rio-branco-2026-06`
 * compartilham a mesma forma e apontam para cá.
 *
 * A fatura é um **DANF3E**, o documento auxiliar da nota fiscal eletrônica de
 * energia. Não é uma conta de luz com uma tabela: é uma nota fiscal, e a tabela
 * de itens divide a faixa horizontal com o quadro de tributos. A falha
 * histórica tinha duas causas, ambas cobertas pelos casos abaixo:
 *
 * 1. **na linha impressa, o item vem com oito números.** "TUSD em kWh - Ponta
 *    KWH 12.524,00 3,463060 43.371,44 3.229,54 43.371,44 19,5 8.457,43
 *    2,529900" traz unidade **antes** da quantidade, e depois tarifa com
 *    tributos, valor, base de PIS/COFINS, base de ICMS, alíquota, ICMS e tarifa
 *    sem tributos. O leitor agora reconhece a forma pela posição dos campos;
 * 2. **no corte por coluna, sobra só o rótulo.** O corte que salvou a Roraima e
 *    a Âmbar aqui trabalha contra: ele separa "TUSD em kWh - Ponta" de todos os
 *    seus números, e faz o mesmo com o total. A leitura pela linha inteira
 *    preserva tanto os itens quanto o primeiro valor de `TOTAL:`.
 *
 * O resultado atual é uma ficha completa cuja soma fecha R$ 74.106,71.
 *
 * **Conferido** contra o caso golden `fatura-brasilia-2026-06`, que dá o mesmo
 * total impresso (74.106,71) e detalha o que deveria ser lido: TUSD ponta 12.524
 * kWh = 43.371,44, TUSD fora ponta 118.775 kWh = 25.065,84, demanda 324 kW mais
 * 94 kW de ultrapassagem = 25.511,06, reativo 9,67 e 32,32, débitos APCEI 40,33,
 * créditos APCEI -20.773,62 e COSIP 849,67.
 *
 * A **competência sai 06/2026**, ancorada em `Leitura Atual: 30/06/2026`, e
 * não no débito APCEI retroativo. Uma dúvida documental permanece:
 *
 * - a **unidade consumidora sai 0009742959-1**, que é o código impresso em
 *   "CADASTRE SUA FATURA EM DÉBITO AUTOMÁTICO UTILIZANDO O CÓDIGO". O golden
 *   registra a conta contrato 9/18697898. São números diferentes com papéis
 *   diferentes, e qual deles é a UC desta unidade **não foi possível confirmar
 *   pelo documento** — a fatura ainda avisa que o número de identificação mudou
 *   por determinação da ANEEL em 01/04/2026. Fica congelado o observado, e a
 *   dúvida fica escrita aqui.
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
const NOME = "energisa-ro-brasilia-2026-06.pagina.json";
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

describe.skipIf(!DOCUMENTO)("Energisa Rondônia — Brasília 06/2026 (DANF3E)", () => {
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
    expect(leitura().identificacao.unidadeConsumidora).toBe("0009742959-1");
  });

  it("lê os números conferidos contra o caso golden", () => {
    expect(leitura().itens).toHaveLength(11);
    expect(leitura().invoice).toMatchObject({
      consumoPontaKwh: 12_524,
      consumoForaPontaKwh: 118_775,
      valorPonta: 43_371.44,
      valorForaPonta: 25_065.84,
      demandaMedidaForaPontaKw: 324,
      valorDemanda: 16_143.72,
      valorMultasJurosEncargos: 9_367.34,
      valorReativo: 41.99,
      demandaContratadaKw: 230,
    });
  });

  it("o primeiro valor de TOTAL: fecha exatamente com os itens", () => {
    const paginas = DOCUMENTO?.paginas ?? [];

    // Na linha impressa o total existe, no meio de outros três números do
    // quadro de tributos.
    expect(linhasImpressas(paginas)).toContain(
      "TOTAL: 74.106,71 6.998,75 93.990,33 18.328,10",
    );
    expect(leitura().invoice.valorTotal).toBe(74_106.71);
    expect(somaDoQueCompoeOTotal(leitura().itens)).toBeCloseTo(74_106.71, 2);
  });

  it("o item também chega inteiro à linha impressa, com oito números", () => {
    // Unidade antes da quantidade, e a seguir tarifa com tributos, valor, bases
    // de PIS/COFINS e de ICMS, alíquota, ICMS e tarifa sem tributos. `itens.ts`
    // procura "rótulo quantidade unidade a tarifa … valor" e não acha.
    expect(linhasImpressas(DOCUMENTO?.paginas ?? [])).toContain(
      "TUSD em kWh - Ponta KWH 12.524,00 3,463060 43.371,44 3.229,54 43.371,44 19,5 8.457,43 2,529900",
    );
  });

  it("julga todas as linhas que têm quantidade e tarifa pela regra normativa", () => {
    expect(leitura().conferencia.confirmados).toBe(4);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.semConferencia).toBe(7);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });
});
