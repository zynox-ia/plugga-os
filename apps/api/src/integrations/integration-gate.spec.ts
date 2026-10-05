import type { IntegrationMode } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { IntegrationGate, ModoNaoPermitido } from "./integration-gate";
import type { IntegrationsRepository } from "./integrations.repository";

function gateCom(modos: Record<string, IntegrationMode>) {
  const repository = {
    findModeByKey: async (chave: string) => modos[chave] ?? null,
  } as unknown as IntegrationsRepository;
  return new IntegrationGate(repository);
}

const MODOS: IntegrationMode[] = ["mock", "read_only", "bridge", "write"];

describe("IntegrationGate", () => {
  // Para cada modo atual e cada mínimo pedido: permite se, e só se, o atual é o
  // mesmo ou mais aberto. É a tabela inteira, não amostras.
  for (const atual of MODOS) {
    for (const minimo of MODOS) {
      const esperado = MODOS.indexOf(atual) >= MODOS.indexOf(minimo);
      it(`modo ${atual} com mínimo ${minimo}: ${esperado ? "permite" : "recusa"}`, async () => {
        const gate = gateCom({ x: atual });
        await expect(gate.permite("x", minimo)).resolves.toBe(esperado);
        if (esperado) {
          await expect(gate.assertMode("x", minimo)).resolves.toBeUndefined();
        } else {
          await expect(gate.assertMode("x", minimo)).rejects.toBeInstanceOf(ModoNaoPermitido);
        }
      });
    }
  }

  it("integração sem registro conta como mock (falha fechada)", async () => {
    const gate = gateCom({});
    await expect(gate.modoDe("desconhecida")).resolves.toBe("mock");
    await expect(gate.permite("desconhecida", "read_only")).resolves.toBe(false);
  });

  it("o erro diz qual integração, em que modo está e o que a operação exige", async () => {
    const gate = gateCom({ openrouter: "mock" });
    const erro = await gate.assertMode("openrouter", "write").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ModoNaoPermitido);
    expect((erro as ModoNaoPermitido).chave).toBe("openrouter");
    expect((erro as ModoNaoPermitido).modoAtual).toBe("mock");
    expect((erro as ModoNaoPermitido).modoMinimo).toBe("write");
    expect((erro as ModoNaoPermitido).codigo).toBe("CONFLITO_ESTADO");
  });
});
