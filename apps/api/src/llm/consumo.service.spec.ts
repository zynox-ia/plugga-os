import { describe, expect, it } from "vitest";

import {
  ConsumoRepository,
  type ConsumoPorDia,
  type ConsumoPorModelo,
  type ConsumoPorProcesso,
} from "./consumo.repository.js";
import { ConsumoService } from "./consumo.service.js";

/**
 * O relatório de consumo.
 *
 * O que se prova aqui é a conta que decide: não "quantos tokens gastamos", que é
 * um número sem uso, mas **quanto custou cada fatura lida**. É a divisão que
 * transforma "três milhões de tokens" numa decisão de custo-benefício.
 */

class RepositorioFalso extends ConsumoRepository {
  constructor(private readonly linhas: ConsumoPorProcesso[]) {
    super();
  }
  async registrar(): Promise<string> {
    return "id";
  }
  async porProcesso(): Promise<ConsumoPorProcesso[]> {
    return this.linhas;
  }
  async porModelo(): Promise<ConsumoPorModelo[]> {
    return [];
  }
  async porDia(): Promise<ConsumoPorDia[]> {
    return [];
  }
}

const linha = (dados: Partial<ConsumoPorProcesso> = {}): ConsumoPorProcesso => ({
  processo: "fatura.visao",
  chamadas: 100,
  falhas: 0,
  tokensEntrada: 2_000_000,
  tokensSaida: 1_000_000,
  tokensTotais: 3_000_000,
  custoCreditos: 12,
  referencias: 80,
  ...dados,
});

describe("relatório de consumo", () => {
  it("divide o gasto pelas faturas atendidas, não pelas chamadas", async () => {
    // 100 chamadas para 80 faturas: houve reenvio e tentativa. O custo que
    // interessa é por fatura — é ele que se compara com o valor de ler à mão.
    const servico = new ConsumoService(new RepositorioFalso([linha()]));

    const { porProcesso } = await servico.resumo();

    expect(porProcesso[0]?.custoPorReferencia).toBeCloseTo(12 / 80, 6);
    expect(porProcesso[0]?.tokensPorReferencia).toBeCloseTo(3_000_000 / 80, 6);
  });

  it("deixa nulo em vez de dividir por chamadas quando não há referência", async () => {
    // Um processo que não etiqueta objeto de negócio não tem custo por unidade.
    // Dividir por chamadas daria um número parecido e errado, e alguém decidiria
    // em cima dele.
    const servico = new ConsumoService(new RepositorioFalso([linha({ referencias: 0 })]));

    const { porProcesso } = await servico.resumo();

    expect(porProcesso[0]?.custoPorReferencia).toBeNull();
    expect(porProcesso[0]?.tokensPorReferencia).toBeNull();
  });

  it("soma o total a partir das linhas, incluindo as falhas", async () => {
    const servico = new ConsumoService(
      new RepositorioFalso([
        linha({ processo: "fatura.visao", custoCreditos: 12, falhas: 3 }),
        linha({ processo: "outro", tokensTotais: 500, custoCreditos: 1, chamadas: 10, falhas: 2 }),
      ]),
    );

    const { total } = await servico.resumo();

    expect(total.chamadas).toBe(110);
    // Tentativa que falhou também consome: uma tempestade de retentativas é
    // história de custo e some do relatório se só o sucesso for somado.
    expect(total.falhas).toBe(5);
    expect(total.custoCreditos).toBeCloseTo(13, 6);
  });

  it("mostra processo fora da lista com a própria chave, em vez de esconder", async () => {
    // Se alguém gravou consumo com um processo que o código não conhece, o
    // relatório tem de mostrar — é sinal de gasto sem dono declarado.
    const servico = new ConsumoService(new RepositorioFalso([linha({ processo: "desconhecido" })]));

    const { porProcesso } = await servico.resumo();

    expect(porProcesso[0]?.nome).toBe("desconhecido");
  });

  it("traduz o processo conhecido para nome legível", async () => {
    const servico = new ConsumoService(new RepositorioFalso([linha()]));

    const { porProcesso } = await servico.resumo();

    expect(porProcesso[0]?.nome).toBe("Leitura de fatura por visão");
  });
});
