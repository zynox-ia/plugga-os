import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { MOTIVO_INFORMATIVO } from "./informativos.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";

/**
 * Roraima Energia — Jardim Floresta 06/2026, o segundo caso do mesmo layout.
 *
 * Mesma fatura de duas colunas de `roraima.corpus.spec.ts`, e é por isso que
 * ela está aqui: um layout provado por um único documento é um layout provado
 * por acaso. Esta unidade traz o que a Santa Tereza não tem — energia reativa
 * excedente nas duas postos horários, e uma **demanda contratada declarada só
 * em fora ponta** (0 kW em ponta, 500 kW fora ponta). A ficha usa a de ponta e
 * diz que usou, em `camposParaConfirmar`; é o comportamento que este caso
 * congela, não um acerto.
 *
 * A dificuldade do layout continua sendo a mesma: a leitura por linha impressa
 * de largura inteira cola as duas colunas, e a tarifa vem impressa com **ponto**
 * decimal na descrição (`2.689175`) e com vírgula na coluna ao lado. O corte por
 * coluna é o que separa os dois blocos — a explicação longa está no spec da
 * Santa Tereza e não se repete aqui.
 *
 * **Conferido** contra o caso golden `fatura-jardim-floresta-2026-06`, que já
 * foi conciliado por gente: total 76.295,48, consumo de ponta 6.901 kWh a
 * 2,689175, fora ponta 72.330 kWh a 0,625962, demanda 12.315,42 (167 kW com
 * ICMS a 27,70 mais 347 kW sem ICMS a 22,16), reativo excedente 3,44 e 86,17,
 * COSIP 56,63 e bandeira amarela 1.491,05 fora do total — tudo bate item a
 * item, e a soma fecha com o total impresso.
 *
 * **Uma divergência contra o golden, e ela é do leitor:**
 * `demandaMedidaPontaKw` sai 347 kW, que é a **quantidade faturada** da linha
 * "Demanda Ponta sem ICMS". A demanda de fato registrada é 151 kW em ponta e
 * 167 kW fora ponta (golden). Ou seja: o campo tem o nome de medição e o
 * conteúdo de faturamento. Não foi consertado aqui de propósito — o ticket
 * separa congelar caso de mudar comportamento —, e o valor observado está
 * congelado abaixo para que o conserto apareça como teste vermelho.
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
const NOME = "roraima-jardim-floresta-2026-06.pagina.json";
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

describe.skipIf(!DOCUMENTO)("Roraima Energia — Jardim Floresta 06/2026", () => {
  it("chega em ficha aproveitável sozinha, sem plano B", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
  });

  it("identifica distribuidora, unidade consumidora e competência", () => {
    expect(leitura().identificacao.distribuidora).toBe("RORAIMA ENERGIA");
    expect(leitura().identificacao.unidadeConsumidora).toBe("01374052");
    expect(leitura().identificacao.competencia).toEqual({ mes: 6, ano: 2026 });
  });

  it("lê consumo, tarifa e valor em ponta e fora ponta", () => {
    expect(leitura().invoice.consumoPontaKwh).toBe(6_901);
    expect(leitura().invoice.tarifaPonta).toBe(2.689175);
    expect(leitura().invoice.valorPonta).toBe(18_557.99);
    expect(leitura().invoice.consumoForaPontaKwh).toBe(72_330);
    expect(leitura().invoice.tarifaForaPonta).toBe(0.625962);
    expect(leitura().invoice.valorForaPonta).toBe(45_275.83);
  });

  it("lê a demanda faturada, e a chama de medida — o golden diz 151 kW", () => {
    // 347 kW é a quantidade da linha "Demanda Ponta sem ICMS", não a demanda
    // registrada no medidor, que o caso golden conciliado dá como 151 kW em
    // ponta e 167 kW fora ponta. O valor abaixo é o observado, congelado como
    // registro do descompasso entre o nome do campo e o que ele carrega.
    expect(leitura().invoice.demandaMedidaPontaKw).toBe(347);
    expect(leitura().invoice.tarifaDemanda).toBe(22.16);
    expect(leitura().invoice.valorDemanda).toBe(12_315.42);
  });

  it("lê da própria fatura a parcela de demanda sem ICMS", () => {
    // A linha explícita manda: quem calcula economia de readequação usa este
    // número quando ele existe, e só cai no rateio quando não existe.
    expect(leitura().demandaComplementoValor).toBe(7_689.52);
  });

  it("lê a tabela de itens com quantidade, unidade, tarifa e valor", () => {
    const esperados = [
      { rotulo: "Consumo Ponta", quantidade: 6_901, unidade: "kWh", tarifa: 2.689175, valor: 18_557.99 },
      { rotulo: "Contribuição de Iluminação Pública (COSIP)", quantidade: null, unidade: null, tarifa: null, valor: 56.63 },
      { rotulo: "Demanda Ponta com ICMS", quantidade: 167, unidade: "kW", tarifa: 27.7, valor: 4_625.9 },
      { rotulo: "Demanda Ponta sem ICMS", quantidade: 347, unidade: "kW", tarifa: 22.16, valor: 7_689.52 },
      { rotulo: "En R Exc Ponta", quantidade: 8, unidade: "kWh", tarifa: 0.430862, valor: 3.44 },
      { rotulo: "Consumo F/Ponta", quantidade: 72_330, unidade: "kWh", tarifa: 0.625962, valor: 45_275.83 },
      { rotulo: "En R Exc F/Ponta", quantidade: 200, unidade: "kWh", tarifa: 0.430862, valor: 86.17 },
      { rotulo: "Adicional Bandeira Amarela", quantidade: null, unidade: null, tarifa: null, valor: 1_491.05 },
    ];

    expect(leitura().itens).toHaveLength(8);
    for (const esperado of esperados) {
      const achado = leitura().itens.find((item) => item.rotulo === esperado.rotulo);
      expect(achado, `item ausente: ${esperado.rotulo}`).toMatchObject(esperado);
    }
  });

  it("a aritmética de cada item fecha", () => {
    expect(leitura().conferencia.confirmados).toBe(6);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });

  it("a soma dos itens que compõem o total fecha com o total impresso", () => {
    expect(leitura().invoice.valorTotal).toBe(76_295.48);

    const soma = leitura().itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(76_295.48);
  });

  it("marca como informativo, sem remover da lista, o que estouraria o total", () => {
    const informativos = leitura().itens.filter((item) => !item.compoeTotal);

    expect(informativos.map((item) => item.rotulo)).toEqual([
      "Adicional Bandeira Amarela",
    ]);
    for (const item of informativos) {
      expect(item.motivoForaDoTotal).toBe(MOTIVO_INFORMATIVO);
    }
    // O item continua na lista com o valor impresso — nunca é apagado.
    expect(informativos.find((item) => item.rotulo === "Adicional Bandeira Amarela")?.valor).toBe(1_491.05);
  });

  it("declara exatamente o que ainda depende de conferência humana", () => {
    expect(leitura().camposParaConfirmar).toEqual([
      "demanda contratada em kW",
      "a fatura tem demanda contratada diferente em ponta (0 kW) e fora ponta (500 kW); a ficha usou a de ponta",
    ]);
  });
});
