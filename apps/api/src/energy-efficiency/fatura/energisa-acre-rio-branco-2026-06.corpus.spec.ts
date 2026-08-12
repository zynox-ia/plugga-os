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
 * Energisa Acre — Rio Branco 06/2026, a sexta distribuidora do corpus.
 *
 * Mesmo DANF3E da Energisa Rondônia — a explicação do layout está em
 * `energisa-ro-brasilia-2026-06`. A forma genérica que lê unidade, quantidade,
 * tarifa e valor fecha Acre e Rondônia sem distinguir concessionária.
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
 * impresso na página. Todos entram na soma que fecha o total do documento.
 *
 * A **competência sai 06/2026**, ancorada em `Leitura Atual: 30/06/2026`, e não
 * no mês do crédito APCEI. A **UC 0000150529-6** é o código do débito automático;
 * o golden não registra UC para esta unidade.
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
  it("monta uma ficha provada pela Trava 1", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
    expect(leituraProvada(leitura())).toBe(true);
    expect(leitura().camposParaConfirmar).toEqual([]);
  });

  it("não distingue Energisa Acre de Energisa Rondônia, e sai só 'ENERGISA'", () => {
    // O cabeçalho diz "ENERGISA ACRE - DISTRIBUIDORA DE ENERGIA S.A.", com CNPJ
    // 04.065.033/0001-70, diferente do de Rondônia. A ficha guarda o nome do
    // grupo; separar as duas concessionárias é decisão em aberto, não defeito
    // deste caso — mas é aqui que a diferença aparece.
    expect(leitura().identificacao.distribuidora).toBe("ENERGISA");
    // A data de leitura atual encerra o ciclo e tem precedência sobre APCEI.
    expect(leitura().identificacao.competencia).toEqual({ mes: 6, ano: 2026 });
    expect(leitura().identificacao.unidadeConsumidora).toBe("0000150529-6");
  });

  it("lê consumo, demanda, reativo, adicional, créditos e contribuição", () => {
    expect(leitura().itens).toHaveLength(11);
    expect(leitura().invoice).toMatchObject({
      consumoPontaKwh: 858.9,
      consumoForaPontaKwh: 15_519,
      valorPonta: 3_061.16,
      valorForaPonta: 2_884.98,
      demandaMedidaForaPontaKw: 124.32,
      valorDemanda: 9_751.75,
      valorReativo: 57.5,
      demandaContratadaKw: 160,
    });
  });

  it("o primeiro valor de TOTAL: fecha exatamente com os itens", () => {
    const paginas = DOCUMENTO?.paginas ?? [];

    // 11.337,62 é o que esta fatura cobra; o golden da unidade vale 17.940,66
    // porque soma a energia da NF do comercializador, que não está neste PDF.
    expect(linhasImpressas(paginas)).toContain(
      "TOTAL: 11.337,62 602,31 16.113,21 3.061,49",
    );
    expect(leitura().invoice.valorTotal).toBe(11_337.62);
    expect(somaDoQueCompoeOTotal(leitura().itens)).toBeCloseTo(11_337.62, 2);
  });

  it("a aritmética confirma as linhas representáveis e preserva as de valor único", () => {
    expect(leitura().conferencia.confirmados).toBe(5);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.semConferencia).toBe(6);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });
});
