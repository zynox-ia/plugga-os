import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";
import { linhasImpressas, linhasPorColuna } from "./linhas.js";

/**
 * Energisa Rondônia — Brasília 06/2026, o DANF3E que a leitura não abre.
 *
 * O primeiro dos quatro casos da Energisa neste corpus, e o que carrega a
 * explicação — `energisa-ro-cantuaria-2026-06`,
 * `energisa-ro-mirante-da-serra-2026-05` e `energisa-acre-rio-branco-2026-06`
 * falham do mesmo jeito e apontam para cá.
 *
 * A fatura é um **DANF3E**, o documento auxiliar da nota fiscal eletrônica de
 * energia. Não é uma conta de luz com uma tabela: é uma nota fiscal, e a tabela
 * de itens divide a faixa horizontal com o quadro de tributos. Duas coisas
 * quebram, e as duas estão provadas nos casos abaixo:
 *
 * 1. **na linha impressa, o item vem com oito números.** "TUSD em kWh - Ponta
 *    KWH 12.524,00 3,463060 43.371,44 3.229,54 43.371,44 19,5 8.457,43
 *    2,529900" traz unidade **antes** da quantidade, e depois tarifa com
 *    tributos, valor, base de PIS/COFINS, base de ICMS, alíquota, ICMS e tarifa
 *    sem tributos. `itens.ts` procura a forma "rótulo quantidade unidade a
 *    tarifa … valor"; nada aqui casa;
 * 2. **no corte por coluna, sobra só o rótulo.** O corte que salvou a Roraima e
 *    a Âmbar aqui trabalha contra: ele separa "TUSD em kWh - Ponta" de todos os
 *    seus números, e faz o mesmo com o total — a linha "TOTAL: 74.106,71
 *    6.998,75 93.990,33 18.328,10" vira o segmento `"TOTAL:"`, sozinho.
 *
 * O resultado é `layout_desconhecido` com **zero** itens e `invoice` vazia, numa
 * fatura de 74.106,71 que está impressa na página. Este caso está congelado como
 * registro do buraco, não como regressão aprovada. Quando o leitor aprender o
 * DANF3E, todo este arquivo fica vermelho — é assim que se percebe que melhorou.
 *
 * **Conferido** contra o caso golden `fatura-brasilia-2026-06`, que dá o mesmo
 * total impresso (74.106,71) e detalha o que deveria ser lido: TUSD ponta 12.524
 * kWh = 43.371,44, TUSD fora ponta 118.775 kWh = 25.065,84, demanda 324 kW mais
 * 94 kW de ultrapassagem = 25.511,06, reativo 9,67 e 32,32, débitos APCEI 40,33,
 * créditos APCEI -20.773,62 e COSIP 849,67. Nada disso é lido hoje.
 *
 * **Dois campos que a leitura devolve estão errados, e o caso os congela:**
 *
 * - a **competência sai 05/2026**. A referência impressa é "Julho / 2026", por
 *   extenso — e `identificacao.ts` procura `MM/AAAA`, forma que o mês por
 *   extenso nunca casa. O primeiro `MM/AAAA` da página acaba sendo o da linha
 *   "DÉBITO TUSD KW-APCEI 05/2026", que é o mês de um lançamento retroativo. O
 *   período medido é 31/05 a 30/06, e o golden chama a referência de 06/2026;
 *   05/2026 não é nenhum dos três;
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
  it("não fecha a ficha sozinha, e diz pelo nome o que faltou", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(false);
    expect(leitura().motivo).toBe("layout_desconhecido");
  });

  it("erra a competência: pega o mês do lançamento retroativo", () => {
    expect(leitura().identificacao.distribuidora).toBe("ENERGISA");
    // Ver o cabeçalho: 05/2026 é o mês do débito APCEI. A referência da fatura
    // é "Julho / 2026", escrita por extenso e por isso invisível ao casamento
    // por `MM/AAAA`; o consumo medido é o de junho.
    expect(leitura().identificacao.competencia).toEqual({ mes: 5, ano: 2026 });
    expect(leitura().identificacao.unidadeConsumidora).toBe("0009742959-1");
  });

  it("não reconheceu nenhum item financeiro nesta fatura", () => {
    // É isto que o caso registra. Quando o leitor aprender este layout,
    // este teste fica vermelho — e é assim que se percebe que melhorou.
    expect(leitura().itens).toEqual([]);
  });

  it("o total está impresso na página, e nenhuma das duas visões o entrega", () => {
    const paginas = DOCUMENTO?.paginas ?? [];

    // Na linha impressa o total existe, no meio de outros três números do
    // quadro de tributos.
    expect(linhasImpressas(paginas)).toContain(
      "TOTAL: 74.106,71 6.998,75 93.990,33 18.328,10",
    );
    // No corte por coluna sobra o rótulo sozinho — é esta a razão de
    // `invoice.valorTotal` sair indefinido numa fatura que traz o total escrito.
    expect(linhasPorColuna(paginas)).toContain("TOTAL:");
    expect(leitura().invoice.valorTotal).toBeUndefined();
  });

  it("o item também chega inteiro à linha impressa, com oito números", () => {
    // Unidade antes da quantidade, e a seguir tarifa com tributos, valor, bases
    // de PIS/COFINS e de ICMS, alíquota, ICMS e tarifa sem tributos. `itens.ts`
    // procura "rótulo quantidade unidade a tarifa … valor" e não acha.
    expect(linhasImpressas(DOCUMENTO?.paginas ?? [])).toContain(
      "TUSD em kWh - Ponta KWH 12.524,00 3,463060 43.371,44 3.229,54 43.371,44 19,5 8.457,43 2,529900",
    );
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
