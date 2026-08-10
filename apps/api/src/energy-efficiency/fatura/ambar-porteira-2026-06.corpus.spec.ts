import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";

/**
 * Âmbar Energia AM — Porteira 06/2026, a demanda cobrada em duas linhas.
 *
 * Mesmo layout de coluna da Alvorada, e entrou junto por causa da diferença que
 * não é de layout e sim de **composição**: aqui a demanda é cobrada em duas
 * linhas com tarifas diferentes — 118 kW a 14,131250 e 32 kW a 11,305000 —, e
 * há energia reativa excedente nos dois postos. É o caso que mostra que
 * `invoice.tarifaDemanda` é um campo singular sobre uma cobrança que a fatura
 * pode partir: ele fica com 11,305, a tarifa da **última** linha lida, enquanto
 * `valorDemanda` soma as duas (2.029,24). Quem usar a tarifa isolada para
 * recalcular a demanda vai errar; quem usar o valor, não. Está congelado assim
 * de propósito, como registro.
 *
 * **Conferido contra a fatura impressa, não contra golden.** O caso golden
 * `fatura-ml-ptf` é da mesma unidade mas de **agosto/2026** e já em mercado
 * livre (total 48.771,59, com energia de NF Thopen); esta fatura é de junho e
 * cobra 19.503,10. Não há caso conciliado para ela, então a conferência foi
 * contra o documento: cada uma das sete linhas confere na multiplicação
 * `quantidade × tarifa = valor`, e a soma das sete bate exatamente com o "Total
 * a pagar R$ 19.503,10" impresso. É a prova mais forte que a própria fatura
 * oferece — mas ela **não substitui** um olho humano sobre a folha, e este
 * parágrafo existe para que ninguém confunda as duas coisas.
 *
 * O ticket descrevia Alvorada e Porteira como "dois layouts diferentes entre
 * si". Não são: é o mesmo layout da Âmbar, com composição de itens diferente.
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
const NOME = "ambar-porteira-2026-06.pagina.json";
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

describe.skipIf(!DOCUMENTO)("Âmbar Energia AM — Porteira 06/2026", () => {
  it("chega em ficha aproveitável sozinha, sem plano B", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
  });

  it("identifica distribuidora, unidade consumidora e competência", () => {
    expect(leitura().identificacao.distribuidora).toBe("AMBAR ENERGIA");
    expect(leitura().identificacao.unidadeConsumidora).toBe("0001417045002-60");
    expect(leitura().identificacao.competencia).toEqual({ mes: 6, ano: 2026 });
  });

  it("lê consumo, tarifa e valor em ponta e fora ponta", () => {
    expect(leitura().invoice.consumoPontaKwh).toBe(4_527);
    expect(leitura().invoice.tarifaPonta).toBe(0.9291);
    expect(leitura().invoice.valorPonta).toBe(4_206.03);
    expect(leitura().invoice.consumoForaPontaKwh).toBe(34_851);
    expect(leitura().invoice.tarifaForaPonta).toBe(0.291075);
    expect(leitura().invoice.valorForaPonta).toBe(10_144.25);
  });

  it("soma as duas linhas de demanda, mas guarda só a última tarifa", () => {
    expect(leitura().invoice.demandaContratadaKw).toBe(150);
    expect(leitura().invoice.demandaMedidaForaPontaKw).toBe(118);
    // 11,305 é a tarifa da segunda linha (32 kW); a primeira, de 118 kW, é
    // cobrada a 14,131250. O campo é um só e fica com a última. `valorDemanda`,
    // esse sim, soma as duas: 1.667,48 + 361,76.
    expect(leitura().invoice.tarifaDemanda).toBe(11.305);
    expect(leitura().invoice.valorDemanda).toBe(2_029.24);
  });

  it("lê a tabela de itens com quantidade, unidade, tarifa e valor", () => {
    const esperados = [
      { rotulo: "Consumo Ponta", quantidade: 4_527, unidade: "kWh", tarifa: 0.9291, valor: 4_206.03 },
      { rotulo: "Demanda", quantidade: 118, unidade: "kW", tarifa: 14.13125, valor: 1_667.48 },
      { rotulo: "Demanda", quantidade: 32, unidade: "kW", tarifa: 11.305, valor: 361.76 },
      { rotulo: "En R Exc Ponta", quantidade: 157, unidade: "kWh", tarifa: 0.351387, valor: 55.16 },
      { rotulo: "Consumo F/Ponta", quantidade: 34_851, unidade: "kWh", tarifa: 0.291075, valor: 10_144.25 },
      { rotulo: "En R Exc F/Ponta", quantidade: 1_144, unidade: "kWh", tarifa: 0.351387, valor: 401.98 },
      { rotulo: "Contribuição de Iluminação Pública (COSIP)", quantidade: null, unidade: null, tarifa: null, valor: 2_666.44 },
    ];

    // Casado por rótulo **e** quantidade, não só por rótulo: as duas linhas de
    // demanda têm o mesmo nome, e o `find` por rótulo que o gerador escreve
    // acharia a primeira duas vezes — o segundo item passaria sem ser
    // verificado, ou reprovaria por comparar com o vizinho.
    expect(leitura().itens).toHaveLength(7);
    for (const esperado of esperados) {
      const achado = leitura().itens.find(
        (item) => item.rotulo === esperado.rotulo && item.quantidade === esperado.quantidade,
      );
      expect(
        achado,
        `item ausente: ${esperado.rotulo} (${esperado.quantidade ?? "sem quantidade"})`,
      ).toMatchObject(esperado);
    }
  });

  it("a aritmética de cada item fecha", () => {
    expect(leitura().conferencia.confirmados).toBe(6);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });

  it("a soma dos itens que compõem o total fecha com o total impresso", () => {
    expect(leitura().invoice.valorTotal).toBe(19_503.1);

    const soma = leitura().itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(19_503.1);
  });

  it("declara exatamente o que ainda depende de conferência humana", () => {
    expect(leitura().camposParaConfirmar).toEqual([]);
  });
});
