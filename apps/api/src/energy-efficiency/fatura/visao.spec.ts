import { describe, expect, it, vi } from "vitest";

import type { OpenRouterGateway, PedidoAoModelo } from "../../llm/openrouter.gateway.js";
import { PROCESSOS } from "../../llm/processo.js";
import { conferir } from "./conferencia.js";
import type { ItemDaFatura } from "./itens.js";
import { criarLeitorPorVisao } from "./visao.js";

/**
 * O contrato da leitura por modelo.
 *
 * A pergunta que este arquivo responde não é "o modelo lê bem?" — isso se mede
 * contra o corpus, não num teste unitário. São as duas perguntas anteriores, e
 * mais importantes: **o que acontece quando o modelo erra?** e **o gasto tem
 * dono?**
 *
 * A primeira sustenta o uso de modelo numa auditoria; a segunda sustenta a
 * contabilidade da chave. Se qualquer uma cair, o desenho deixa de se justificar.
 */

const item = (dados: Partial<ItemDaFatura> & { rotulo: string; valor: number }): ItemDaFatura => ({
  quantidade: null,
  unidade: null,
  tarifa: null,
  origem: "visao",
  ...dados,
});

/** Gateway de mentira que guarda o pedido em vez de sair na rede. */
function gatewayFalso(texto: string | null) {
  const pedidos: PedidoAoModelo[] = [];
  const gateway = {
    configurado: () => true,
    completar: vi.fn(async (pedido: PedidoAoModelo) => {
      pedidos.push(pedido);
      return texto === null
        ? null
        : { texto, tokensEntrada: 10, tokensSaida: 5, custoCreditos: 0.001, modeloServido: "x" };
    }),
  } as unknown as OpenRouterGateway;
  return { gateway, pedidos };
}

const PAGINA = [{ conteudo: Buffer.from("imagem"), mime: "image/png" }];

describe("leitura por visão", () => {
  describe("a aritmética julga o modelo do mesmo jeito que julga o resto", () => {
    it("confirma o item cuja multiplicação fecha", () => {
      const conferencia = conferir([
        item({ rotulo: "Consumo Ponta", quantidade: 17419, unidade: "kWh", tarifa: 2.689175, valor: 46842.73 }),
      ]);

      expect(conferencia.itens[0]?.veredicto).toBe("confirmado");
    });

    it("recusa o número que o modelo inventou", () => {
      // O mesmo item com o valor trocado por um plausível. É exatamente a falha
      // que se teme de um modelo — e ela não passa: 17419 × 2,689175 não dá
      // 51.000,00, então o item não entra na ficha.
      const conferencia = conferir([
        item({ rotulo: "Consumo Ponta", quantidade: 17419, unidade: "kWh", tarifa: 2.689175, valor: 51000 }),
      ]);

      expect(conferencia.itens[0]?.veredicto).toBe("divergente");
    });

    it("recusa o dígito trocado, que é como o erro de leitura costuma aparecer", () => {
      // 1,730090 lido como 1,7830090 — o caso real medido nesta base.
      const conferencia = conferir([
        item({ rotulo: "Consumo F/Ponta", quantidade: 183153, unidade: "kWh", tarifa: 1.783009, valor: 316_882.34 }),
      ]);

      expect(conferencia.itens[0]?.veredicto).toBe("divergente");
    });

    it("não inventa veredicto para item sem quantidade e tarifa", () => {
      const conferencia = conferir([item({ rotulo: "Bandeira Amarela", valor: 3774.59 })]);

      expect(conferencia.itens[0]?.veredicto).toBe("sem_conferencia");
    });
  });

  describe("todo gasto tem dono", () => {
    it("etiqueta a chamada com o processo e com a fatura que a motivou", async () => {
      const { gateway, pedidos } = gatewayFalso(
        JSON.stringify({
          distribuidora: "RORAIMA ENERGIA",
          unidadeConsumidora: "01939890",
          competenciaMes: 6,
          competenciaAno: 2026,
          itens: [],
        }),
      );

      await criarLeitorPorVisao(gateway)(PAGINA, "abc123");

      // Sem processo, o relatório de consumo tem um total sem responsável; sem
      // referência, dá para somar tokens mas não para dividir por fatura — que é
      // o número que decide se compensa.
      expect(pedidos[0]?.processo).toBe(PROCESSOS.FATURA_VISAO);
      expect(pedidos[0]?.referencia).toBe("abc123");
    });

    it("pede saída estruturada em vez de confiar em texto solto", async () => {
      const { gateway, pedidos } = gatewayFalso('{"distribuidora":null,"unidadeConsumidora":null,"competenciaMes":null,"competenciaAno":null,"itens":[]}');

      await criarLeitorPorVisao(gateway)(PAGINA);

      expect(pedidos[0]?.esquema?.nome).toBe("fatura");
    });
  });

  describe("degradação", () => {
    it("devolve nulo quando o gateway não respondeu, em vez de estourar", async () => {
      const { gateway } = gatewayFalso(null);

      await expect(criarLeitorPorVisao(gateway)(PAGINA)).resolves.toBeNull();
    });

    it("devolve nulo quando o JSON veio quebrado", async () => {
      const { gateway } = gatewayFalso("isto não é json");

      await expect(criarLeitorPorVisao(gateway)(PAGINA)).resolves.toBeNull();
    });

    it("não chama o modelo sem página para ler", async () => {
      const { gateway, pedidos } = gatewayFalso("{}");

      await expect(criarLeitorPorVisao(gateway)([])).resolves.toBeNull();
      expect(pedidos).toHaveLength(0);
    });
  });
});
