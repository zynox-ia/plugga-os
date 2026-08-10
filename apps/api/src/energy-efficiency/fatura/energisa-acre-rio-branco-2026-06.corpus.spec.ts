import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";
import { linhasImpressas, linhasPorColuna } from "./linhas.js";

/**
 * Energisa Acre — Rio Branco 06/2026, a sexta distribuidora do corpus.
 *
 * Mesmo DANF3E da Energisa Rondônia — a explicação do layout está em
 * `energisa-ro-brasilia-2026-06` — e falha igual: zero itens, `invoice` vazia,
 * `layout_desconhecido`. Está aqui por cobertura: a Energisa Acre é a sexta e
 * última distribuidora, e sem este arquivo ela não teria caso de leitura nenhum.
 *
 * Que o layout do Acre seja idêntico ao de Rondônia é, em si, informação: são
 * duas concessionárias diferentes do mesmo grupo, e uma correção no DANF3E deve
 * fechar as duas de uma vez. Se um dia fechar só uma, é sinal de que a correção
 * foi ajustada a um documento e não ao formato.
 *
 * **Conferido** contra o caso golden `fatura-ml-riobranco`, com um cuidado que
 * vale registrar: o golden vale **17.940,66**, e esta fatura, 11.337,62. Não é
 * divergência — o golden concilia a unidade inteira, somando os 6.603,04 de
 * energia da NF do comercializador (Comerc) ao que a distribuidora cobra:
 * 11.337,62 + 6.603,04 = 17.940,66. O PDF congelado aqui é só a parte da
 * distribuidora, e o total impresso nele, na linha "TOTAL:", é 11.337,62.
 *
 * Os itens do golden que caberiam a este documento — TUSD ponta 858,9 kWh =
 * 3.061,16, TUSD fora ponta 15.519 kWh = 2.884,98, demanda 7.577,11, demanda não
 * consumida 2.174,64, reativo 4,23 e 53,27, adicional Covid 357,82, créditos
 * APCEI -2.927,11, -840,09 e -1.120,88, COSIP 112,49 — conferem com o que está
 * impresso na página. Nenhum deles é lido hoje.
 *
 * A **competência sai 07/2026**, do crédito "APCEI 07/2026", que aqui coincide
 * com a referência impressa "Julho / 2026". O golden chama esta fatura de
 * 06/2026, que é o mês do consumo (31/05 a 30/06) — as duas convenções são
 * defensáveis, e a leitura não segue nenhuma das duas de propósito: segue o
 * primeiro `MM/AAAA` que encontra. A **UC 0000150529-6** é o código do débito
 * automático; o golden não registra UC para esta unidade.
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
const NOME = "energisa-acre-rio-branco-2026-06.pagina.json";
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

describe.skipIf(!DOCUMENTO)("Energisa Acre — Rio Branco 06/2026 (DANF3E)", () => {
  it("não fecha a ficha sozinha, e diz pelo nome o que faltou", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(false);
    expect(leitura().motivo).toBe("layout_desconhecido");
  });

  it("não distingue Energisa Acre de Energisa Rondônia, e sai só 'ENERGISA'", () => {
    // O cabeçalho diz "ENERGISA ACRE - DISTRIBUIDORA DE ENERGIA S.A.", com CNPJ
    // 04.065.033/0001-70, diferente do de Rondônia. A ficha guarda o nome do
    // grupo; separar as duas concessionárias é decisão em aberto, não defeito
    // deste caso — mas é aqui que a diferença aparece.
    expect(leitura().identificacao.distribuidora).toBe("ENERGISA");
    // 07/2026 vem do crédito APCEI; coincide com a referência impressa "Julho /
    // 2026", enquanto o golden chama esta fatura de 06/2026, o mês do consumo.
    expect(leitura().identificacao.competencia).toEqual({ mes: 7, ano: 2026 });
    expect(leitura().identificacao.unidadeConsumidora).toBe("0000150529-6");
  });

  it("não reconheceu nenhum item financeiro nesta fatura", () => {
    // É isto que o caso registra. Quando o leitor aprender este layout,
    // este teste fica vermelho — e é assim que se percebe que melhorou.
    expect(leitura().itens).toEqual([]);
  });

  it("o total impresso não chega à ficha: o corte por coluna o decepa", () => {
    const paginas = DOCUMENTO?.paginas ?? [];

    // 11.337,62 é o que esta fatura cobra; o golden da unidade vale 17.940,66
    // porque soma a energia da NF do comercializador, que não está neste PDF.
    expect(linhasImpressas(paginas)).toContain(
      "TOTAL: 11.337,62 602,31 16.113,21 3.061,49",
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
