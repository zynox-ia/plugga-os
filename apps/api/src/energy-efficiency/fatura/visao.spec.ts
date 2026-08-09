import { describe, expect, it, vi } from "vitest";

import { conferir } from "./conferencia.js";
import type { ItemDaFatura } from "./itens.js";

/**
 * O contrato da leitura por modelo de visão.
 *
 * A pergunta que este arquivo responde não é "o modelo lê bem?" — isso se mede
 * contra o corpus, não num teste unitário. É a pergunta anterior, e mais
 * importante: **o que acontece quando o modelo erra?** A resposta tem de ser a
 * mesma que quando o OCR erra ou quando alguém digita errado: o item cai fora da
 * ficha e vai para conferência humana.
 *
 * É essa garantia que torna aceitável pôr um modelo no caminho de uma auditoria.
 * Se ela cair, a integração inteira deixa de ser defensável.
 */

const item = (dados: Partial<ItemDaFatura> & { rotulo: string; valor: number }): ItemDaFatura => ({
  quantidade: null,
  unidade: null,
  tarifa: null,
  origem: "visao",
  ...dados,
});

describe("leitura por visão", () => {
  describe("a aritmética julga o modelo do mesmo jeito que julga o resto", () => {
    it("confirma o item cuja multiplicação fecha", () => {
      const conferencia = conferir([
        item({ rotulo: "Consumo Ponta", quantidade: 17419, unidade: "kWh", tarifa: 2.689175, valor: 46842.73 }),
      ]);

      expect(conferencia.itens[0]?.veredicto).toBe("confirmado");
    });

    it("recusa o número que o modelo inventou", () => {
      // O mesmo item, com o valor trocado por um plausível. É exatamente a
      // falha que se teme de um modelo — e ela não passa: 17419 × 2,689175 não
      // dá 51.000,00, então o item não entra na ficha.
      const conferencia = conferir([
        item({ rotulo: "Consumo Ponta", quantidade: 17419, unidade: "kWh", tarifa: 2.689175, valor: 51000 }),
      ]);

      expect(conferencia.itens[0]?.veredicto).toBe("divergente");
    });

    it("recusa o dígito trocado, que é como o erro de leitura costuma aparecer", () => {
      // 1,730090 lido como 1,7830090 — o caso real medido nesta base. A folga
      // de arredondamento não cobre um dígito a mais.
      const conferencia = conferir([
        item({ rotulo: "Consumo F/Ponta", quantidade: 183153, unidade: "kWh", tarifa: 1.783009, valor: 316_882.34 }),
      ]);

      expect(conferencia.itens[0]?.veredicto).toBe("divergente");
    });

    it("não inventa veredicto para item sem quantidade e tarifa", () => {
      // Bandeira, iluminação pública e multa não têm multiplicação. Ficam
      // marcados como não conferíveis em vez de aprovados por omissão.
      const conferencia = conferir([item({ rotulo: "Bandeira Amarela", valor: 3774.59 })]);

      expect(conferencia.itens[0]?.veredicto).toBe("sem_conferencia");
    });
  });

  describe("configuração", () => {
    it("se declara desligada sem credencial, e desligada não derruba leitura", async () => {
      vi.resetModules();
      const anterior = { ...process.env };
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;

      const { configurado, lerPorVisao } = await import("./visao.js");

      expect(configurado()).toBe(false);
      // Nulo, não exceção: quem chama segue com o que as regras conseguiram.
      await expect(lerPorVisao(Buffer.from("%PDF-1.4"), "application/pdf")).resolves.toBeNull();

      process.env = anterior;
    });
  });
});
