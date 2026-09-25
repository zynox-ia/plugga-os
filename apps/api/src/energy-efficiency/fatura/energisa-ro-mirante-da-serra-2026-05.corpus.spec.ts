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
 * Energisa Rondônia — Mirante da Serra 05/2026, DANF3E de mercado livre.
 *
 * Compartilha com a Brasília o layout DANF3E. O que este
 * caso acrescenta é o **mercado livre visto do lado da distribuidora**: a
 * fatura cobra só o fio, e o que se paga de energia vem em nota fiscal separada
 * do comercializador. Por isso a página tem linhas negativas grandes de crédito
 * APCEI (-3.485,66, -609,34, -4.788,88) ao lado das linhas de TUSD. Uma leitura
 * que some tudo como débito vai errar feio; este caso prova que os créditos
 * preservam o sinal e a soma fecha.
 *
 * **Não há caso golden para esta fatura.** O `fatura-ml-mirante` é a mesma
 * unidade em **07/2026** (total 47.689,40, dos quais 20.653,86 são energia de NF
 * Comerc); esta é a de referência "Junho / 2026", medida de 01/05 a 31/05, e a
 * parte da distribuidora soma 26.841,36. A conferência possível foi contra o
 * documento: o total impresso na linha "TOTAL:" é 26.841,36. **O detalhamento
 * item a item desta referência não tem contraparte conciliada e não foi
 * conferido por gente**; a prova disponível é a soma contra o total impresso.
 *
 * A **competência sai 05/2026**, ancorada em `Leitura Atual: 31/05/2026`, e não
 * no crédito APCEI de junho.
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
 * JSON mora no balde do corpus no armazenamento e chega por `corpus:baixar`. Sem a
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
  it("monta uma ficha provada pela Trava 1", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
    expect(leituraProvada(leitura())).toBe(true);
    expect(leitura().camposParaConfirmar).toEqual([]);
  });

  it("usa o mês da leitura atual, não o crédito APCEI", () => {
    expect(leitura().identificacao.distribuidora).toBe("ENERGISA");
    expect(leitura().identificacao.competencia).toEqual({ mes: 5, ano: 2026 });
    expect(leitura().identificacao.unidadeConsumidora).toBe("0000265426-7");
  });

  it("lê todos os itens publicados pela parte da distribuidora", () => {
    expect(leitura().itens).toHaveLength(11);
    expect(leitura().invoice).toMatchObject({
      consumoPontaKwh: 4_031.5,
      consumoForaPontaKwh: 48_710.34,
      valorPonta: 13_961.35,
      valorForaPonta: 10_279.65,
      demandaMedidaForaPontaKw: 191.52,
      valorDemanda: 10_885.61,
      valorReativo: 165.66,
      demandaContratadaKw: 225,
    });
  });

  it("o primeiro valor de TOTAL: fecha exatamente com os itens", () => {
    const paginas = DOCUMENTO?.paginas ?? [];

    expect(linhasImpressas(paginas)).toContain(
      "TOTAL: 26.841,36 2.672,27 34.219,40 6.672,77",
    );
    expect(leitura().invoice.valorTotal).toBe(26_841.36);
    expect(somaDoQueCompoeOTotal(leitura().itens)).toBeCloseTo(26_841.36, 2);
  });

  it("julga todas as linhas que têm quantidade e tarifa pela regra normativa", () => {
    expect(leitura().conferencia.confirmados).toBe(5);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.semConferencia).toBe(6);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });
});
