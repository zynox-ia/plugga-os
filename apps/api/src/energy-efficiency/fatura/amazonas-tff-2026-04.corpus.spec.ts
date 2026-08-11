import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";

/**
 * Âmbar Energia AM — aeroporto de Tefé (TFF) 04/2026, com camada de texto.
 *
 * É o par da `amazonas-tff-2026-05.corpus.spec.ts`: **mesma unidade
 * consumidora, mesmo layout, um mês de diferença** — só que aquela é
 * digitalizada e esta veio com camada de texto. Ter as duas no corpus é o que
 * permite medir o custo do reconhecimento óptico sem trocar de fatura junto:
 * aqui a ficha fecha com seis itens, lá sobra um item inventado e nenhuma
 * grandeza.
 *
 * O que este layout tem de difícil já está dito em `ambar-alvorada`: tabela na
 * coluna da direita, colada a blocos de cadastro na linha impressa. E ele repete
 * aqui o **mesmo defeito**, na mesma posição: a linha "Desligamento E Religacao
 * Programados (2X)  562,50" cai na altura do bloco "Datas da Leitura", e o corte
 * por coluna separa o rótulo do valor — o item some. Dois documentos diferentes,
 * a mesma causa: não é acidente daquela fatura, é uma propriedade do layout.
 *
 * **Conferido** contra o caso golden `fatura-tff-2026-04`: consumo de ponta
 * 2.464 kWh a 1,73009, fora ponta 26.888 kWh a 0,49592, demanda 4.592,00 nas
 * duas linhas (193 kW + 7 kW, ambas a 22,96), reativo excedente 50,63 e 399,81 e
 * total impresso 23.202,17 batem. O golden lista também o desligamento e
 * religação de 562,50 — exatamente o que falta para a soma dos itens lidos
 * (22.639,67) alcançar o total.
 *
 * Duas notas de conferência:
 *
 * - o golden chama a distribuidora de "Amazonas Energia"; a fatura, de
 *   propósito e por extenso, diz "AMBAR ENERGIA - AM", CNPJ 02.341.467/0001-20.
 *   A leitura acompanha o documento, e está certa: o nome mudou com a troca de
 *   controle, e o golden guarda o antigo;
 * - o golden dá `demanda_complemento_valor` = 160,72, a linha de 7 kW. A leitura
 *   devolve `null`, porque este layout não rotula nenhuma das duas linhas como
 *   "sem ICMS" — o que a Roraima faz e é de onde esse campo sai. Congelado como
 *   `null`, que é o observado.
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
const NOME = "amazonas-tff-2026-04.pagina.json";
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

describe.skipIf(!DOCUMENTO)("Âmbar Energia AM — Tefé (TFF) 04/2026, com camada de texto", () => {
  it("chega em ficha aproveitável sozinha, sem plano B", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
  });

  it("identifica distribuidora, unidade consumidora e competência", () => {
    expect(leitura().identificacao.distribuidora).toBe("AMBAR ENERGIA");
    expect(leitura().identificacao.unidadeConsumidora).toBe("1060454-5");
    expect(leitura().identificacao.competencia).toEqual({ mes: 4, ano: 2026 });
  });

  it("lê consumo, tarifa e valor em ponta e fora ponta", () => {
    expect(leitura().invoice.consumoPontaKwh).toBe(2_464);
    expect(leitura().invoice.tarifaPonta).toBe(1.73009);
    expect(leitura().invoice.valorPonta).toBe(4_262.94);
    expect(leitura().invoice.consumoForaPontaKwh).toBe(26_888);
    expect(leitura().invoice.tarifaForaPonta).toBe(0.49592);
    expect(leitura().invoice.valorForaPonta).toBe(13_334.29);
  });

  it("lê a demanda contratada e a registrada", () => {
    expect(leitura().invoice.demandaContratadaKw).toBe(200);
    expect(leitura().invoice.demandaMedidaForaPontaKw).toBe(193);
    expect(leitura().invoice.tarifaDemanda).toBe(22.96);
    expect(leitura().invoice.valorDemanda).toBe(4_592);
  });

  it("lê a tabela de itens com quantidade, unidade, tarifa e valor", () => {
    const esperados = [
      { rotulo: "Consumo Ponta", quantidade: 2_464, unidade: "kWh", tarifa: 1.73009, valor: 4_262.94 },
      { rotulo: "Demanda", quantidade: 193, unidade: "kW", tarifa: 22.96, valor: 4_431.28 },
      { rotulo: "Demanda", quantidade: 7, unidade: "kW", tarifa: 22.96, valor: 160.72 },
      { rotulo: "En R Exc Ponta", quantidade: 145, unidade: "kWh", tarifa: 0.34918, valor: 50.63 },
      { rotulo: "Consumo F/Ponta", quantidade: 26_888, unidade: "kWh", tarifa: 0.49592, valor: 13_334.29 },
      { rotulo: "En R Exc F/Ponta", quantidade: 1_145, unidade: "kWh", tarifa: 0.34918, valor: 399.81 },
    ];

    // Casado por rótulo **e** quantidade: as duas linhas de demanda têm o mesmo
    // nome, e o `find` só por rótulo que o gerador escreve acharia a primeira
    // duas vezes, deixando a segunda sem verificação.
    expect(leitura().itens).toHaveLength(6);
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

  it("a soma dos itens lidos não alcança o total — falta o desligamento", () => {
    // Faltam os 562,50 de "Desligamento E Religacao Programados (2X)", cujo
    // valor o corte por coluna separou do rótulo. O número abaixo é o
    // **observado**, congelado como evidência do buraco. Não o ajuste para
    // fechar — quem fecha é a leitura, quando aprender a linha.
    expect(leitura().invoice.valorTotal).toBe(23_202.17);

    const soma = leitura().itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(22_639.67);
  });

  it("declara exatamente o que ainda depende de conferência humana", () => {
    // Antes do portão da Trava 1 esta lista era vazia: a fatura perdia uma
    // linha de R$ 562,50 e não dizia nada a quem confere, porque cada item que
    // sobrou fecha na multiplicação. A soma contra o total é o que revela.
    expect(leitura().camposParaConfirmar).toEqual([
      "a soma dos itens (R$ 22639.67) não fecha com o total impresso (R$ 23202.17): diferença de R$ -562.50. Costuma ser item que a leitura perdeu — corrija a extração, nunca ajuste o total.",
    ]);
  });
});
