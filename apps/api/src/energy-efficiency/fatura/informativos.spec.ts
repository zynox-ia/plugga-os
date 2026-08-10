import { describe, expect, it } from "vitest";

import type { ItemConferido } from "./conferencia.js";
import { marcarInformativos, MOTIVO_INFORMATIVO } from "./informativos.js";

/**
 * A regra fecha o buraco que a Santa Tereza revelou, mas não é sobre a Santa
 * Tereza: ela exige duas provas — rótulo de bandeira/adicional e a aritmética
 * da própria fatura mostrando que aquele item estoura o total. Sem as duas,
 * nada é marcado.
 */

function item(rotulo: string, valor: number, extra: Partial<ItemConferido> = {}): ItemConferido {
  return {
    rotulo,
    quantidade: null,
    unidade: null,
    tarifa: null,
    valor,
    origem: rotulo,
    veredicto: "sem_conferencia",
    esperado: null,
    diferenca: null,
    ...extra,
  };
}

describe("marcarInformativos", () => {
  it("bandeira que estoura o total nasce informativa, com o motivo registrado", () => {
    const itens = [
      item("Consumo Ponta", 46_842.73),
      item("Consumo Fora Ponta", 114_646.81),
      item("Demanda", 13_113.18),
      item("COSIP", 33.98),
      item("Adicional Bandeira Amarela", 3_774.59),
    ];

    const resultado = marcarInformativos(itens, 174_636.7);

    const bandeira = resultado.find((i) => i.rotulo === "Adicional Bandeira Amarela")!;
    expect(bandeira.compoeTotal).toBe(false);
    expect(bandeira.motivoForaDoTotal).toBe(MOTIVO_INFORMATIVO);

    // O item continua na lista, visível — nunca é removido.
    expect(resultado).toHaveLength(5);

    const soma = resultado
      .filter((i) => i.compoeTotal)
      .reduce((total, i) => total + i.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(174_636.7);
  });

  it("os demais itens permanecem compondo o total", () => {
    const itens = [item("Consumo Ponta", 100), item("Adicional Bandeira Amarela", 50)];

    const resultado = marcarInformativos(itens, 100);

    expect(resultado.find((i) => i.rotulo === "Consumo Ponta")?.compoeTotal).toBe(true);
  });

  it("quando a soma já fecha, nada é marcado — mesmo com rótulo de bandeira", () => {
    const itens = [item("Consumo Ponta", 100), item("Bandeira Vermelha", 20)];

    const resultado = marcarInformativos(itens, 120);

    expect(resultado.every((i) => i.compoeTotal)).toBe(true);
    expect(resultado.every((i) => i.motivoForaDoTotal === null)).toBe(true);
  });

  it("se a bandeira realmente compõe o total noutra distribuidora, a regra não a remove", () => {
    // Aqui a soma só fecha COM a bandeira dentro: é a segunda prova que falta,
    // e por isso ela continua no total.
    const itens = [item("Consumo Ponta", 80), item("Bandeira Vermelha", 20)];

    const resultado = marcarInformativos(itens, 100);

    const bandeira = resultado.find((i) => i.rotulo === "Bandeira Vermelha")!;
    expect(bandeira.compoeTotal).toBe(true);
    expect(bandeira.motivoForaDoTotal).toBeNull();
  });

  it("item que estoura o total mas não tem rótulo de bandeira não é tocado", () => {
    const itens = [item("Consumo Ponta", 100), item("Encargo qualquer", 20)];

    const resultado = marcarInformativos(itens, 100);

    // Nenhuma prova de rótulo: a regra não age, e a Trava 1 é quem reprova.
    expect(resultado.every((i) => i.compoeTotal)).toBe(true);
  });

  it("sem total conhecido, nada pode ser provado — tudo compõe", () => {
    const itens = [item("Consumo Ponta", 100), item("Adicional Bandeira Amarela", 20)];

    const resultado = marcarInformativos(itens, undefined);

    expect(resultado.every((i) => i.compoeTotal)).toBe(true);
  });

  it("duas bandeiras: marca só a combinação que fecha a conta", () => {
    const itens = [
      item("Consumo Ponta", 100),
      item("Bandeira Amarela", 10),
      item("Bandeira Vermelha", 15),
    ];

    // Soma total 125; sem as duas bandeiras, 100 — fecha exato só tirando as
    // duas juntas.
    const resultado = marcarInformativos(itens, 100);

    expect(resultado.filter((i) => !i.compoeTotal)).toHaveLength(2);
    const soma = resultado
      .filter((i) => i.compoeTotal)
      .reduce((total, i) => total + i.valor, 0);
    expect(soma).toBe(100);
  });

  it("diferença dentro da folga de meio centavo não aciona a regra", () => {
    // Diferença de exatamente 0,005 — a mesma folga da conciliação — não é
    // "bandeira sobrando", é arredondamento.
    const itens = [item("Consumo Ponta", 100), item("Bandeira Amarela", 0.005)];

    const resultado = marcarInformativos(itens, 100);

    expect(resultado.every((i) => i.compoeTotal)).toBe(true);
  });
});
