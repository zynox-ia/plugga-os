import { describe, expect, it } from "vitest";

import { categoriaDoRotulo } from "./leitura.js";

/**
 * O vocabulário de rótulos, agora com um dono só.
 *
 * Estas asserções vinham do teste da tela (`conciliacao-model.test.ts`), onde
 * provavam um segundo mapa de rótulo para categoria. O mapa da tela deixou de
 * existir — a categoria viaja no item, decidida aqui —, e as asserções vieram
 * junto: continuam sendo a regressão do defeito de 11/08/2026, medindo o mapa
 * que sobrou.
 *
 * Os rótulos não são inventados. Cada um sai impresso numa das doze faturas do
 * corpus, levantados rodando o leitor sobre elas.
 */
describe("a categoria que o leitor marca no item", () => {
  it("separa consumo em ponta de consumo fora ponta como a fatura escreve", () => {
    // O que motivou o conserto: a Roraima escreve F/Ponta, não "fora ponta".
    // Classificado como ponta, o consumo fora ponta somava no campo errado, a
    // conciliação nunca fechava e o botão de abrir o estudo nascia desabilitado.
    expect(categoriaDoRotulo("Consumo F/Ponta")).toBe("consumo_fora_ponta");
    expect(categoriaDoRotulo("Consumo Ponta")).toBe("consumo_ponta");
  });

  /**
   * O vocabulário que sobrou é o do leitor, e ele é **mais estreito** que o da
   * tela em três pontos. Registrado aqui porque some de vista de outro jeito.
   *
   * A tela conhecia `fora ponta` por extenso, `benefício`/`subvenção` e
   * `multa`/`juros`/`encargo`; o leitor não conhece nenhum dos três. Isso não é
   * perda de comportamento: nenhum deles alimenta campo da ficha no servidor,
   * então a linha classificada assim era comparada contra um campo que ficava
   * zerado e **reprovava a conciliação de uma fatura correta**. Caindo em
   * `outros` ela continua somando no total, que é a prova que importa.
   *
   * Nenhuma das doze faturas do corpus escreve assim — por isso nada muda de
   * veredicto. Ensinar estes rótulos ao leitor é mexer no leitor, e tem de vir
   * com o campo da ficha que eles alimentam.
   */
  it("é o vocabulário do leitor que vale, e ele é mais estreito que o da tela", () => {
    expect(categoriaDoRotulo("CONSUMO FORA DE PONTA")).toBe("outros");
    expect(categoriaDoRotulo("Benefício Tarifário Bruto")).toBe("outros");
    expect(categoriaDoRotulo("Juros e encargos")).toBe("outros");
  });

  it("reconhece energia reativa antes de reconhecer ponta", () => {
    // `En R Exc Ponta` não contém "reativ" e termina em "Ponta". Testado depois
    // de ponta, energia reativa excedente virava consumo e inflava a ficha.
    expect(categoriaDoRotulo("En R Exc Ponta")).toBe("reativo");
    expect(categoriaDoRotulo("En R Exc F/Ponta")).toBe("reativo");
    expect(categoriaDoRotulo("Energia Reativa Excedente")).toBe("reativo");
  });

  it("não chuta para consumo o rótulo que não reconhece", () => {
    expect(categoriaDoRotulo("Contribuição de Iluminação Pública (COSIP)")).toBe("outros");
    expect(categoriaDoRotulo("Adicional Bandeira Amarela")).toBe("outros");
    expect(categoriaDoRotulo("")).toBe("outros");
  });

  it("reconhece demanda antes de reconhecer ponta", () => {
    // As duas linhas de demanda da Santa Tereza dizem "Ponta". `Demanda Ponta
    // sem ICMS` é demanda antes de ser ponta.
    expect(categoriaDoRotulo("Demanda Ponta sem ICMS")).toBe("demanda_faturada");
    expect(categoriaDoRotulo("Demanda Ponta com ICMS")).toBe("demanda_faturada");
    expect(categoriaDoRotulo("Demanda F/Ponta")).toBe("demanda_faturada");
    expect(categoriaDoRotulo("Demanda")).toBe("demanda_faturada");
  });

  it("manda ultrapassagem de demanda para encargos", () => {
    expect(categoriaDoRotulo("Dem Ultrapassagem")).toBe("multas_juros_encargos");
  });

});
