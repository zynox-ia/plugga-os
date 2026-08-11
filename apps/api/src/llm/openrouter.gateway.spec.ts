import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChaveDeLlmService } from "./chave.service.js";
import type { ConsumoRepository } from "./consumo.repository.js";
import { OpenRouterGateway } from "./openrouter.gateway.js";
import { PROCESSOS } from "./processo.js";

/**
 * A porta de saída, vista de fora: **o que exatamente sai daqui.**
 *
 * A pergunta que este arquivo responde não é se o modelo lê bem — é onde a
 * fatura do cliente pode ser processada. Titular, CNPJ, endereço, valores e
 * linha digitável atravessam esta função; sem as preferências de provedor no
 * corpo, a OpenRouter aceita o roteamento padrão, que pode cair em quem registra
 * o conteúdo e treina em cima dele.
 *
 * O teste que mais importa é o do parágrafo de baixo: quando não sobra provedor
 * aceitável, **nada é reenviado**. Uma repetição sem a exigência seria
 * exatamente o acidente que a política existe para impedir, e ela não apareceria
 * em lugar nenhum — a fatura teria ido embora e o log diria "ok".
 */

const CORPO_OK = {
  id: "gen-1",
  model: "anthropic/claude-sonnet-4.5",
  choices: [{ message: { content: '{"ok":true}' } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.002 },
};

/**
 * A recusa da OpenRouter quando o filtro de política não deixa endpoint de pé.
 * Ela recusa antes de rotear: nenhum provedor chega a ver a carga.
 */
const CORPO_SEM_PROVEDOR = {
  error: {
    message:
      "No endpoints found matching your data policy (Zero Data Retention). " +
      "Configure: https://openrouter.ai/settings/privacy",
  },
};

function montar(chave: string | null = "sk-or-de-mentira") {
  const registrar = vi.fn(async () => {});
  const gateway = new OpenRouterGateway(
    { registrar } as unknown as ConsumoRepository,
    { valor: async () => chave } as unknown as ChaveDeLlmService,
  );
  return { gateway, registrar };
}

const PEDIDO = {
  processo: PROCESSOS.FATURA_VISAO,
  partes: [{ tipo: "imagem" as const, conteudo: Buffer.from("a fatura"), mime: "image/png" }],
  referencia: "abc123",
};

/** O corpo JSON que foi realmente para a rede na chamada `n`. */
function corpoEnviado(fetchMock: ReturnType<typeof vi.fn>, n = 0): Record<string, unknown> {
  const chamada = fetchMock.mock.calls[n] as unknown as [string, RequestInit];
  return JSON.parse(chamada[1].body as string) as Record<string, unknown>;
}

describe("gateway da OpenRouter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("a fatura só vai para quem não a guarda", () => {
    it("manda as preferências de provedor no corpo de toda chamada", async () => {
      const fetchMock = vi.fn(async () => Response.json(CORPO_OK));
      vi.stubGlobal("fetch", fetchMock);
      const { gateway } = montar();

      await gateway.completar(PEDIDO);

      // Os três nomes são os que a OpenRouter aceita hoje no corpo REST
      // (`snake_case`), conferidos na documentação em 10/08/2026. Um campo com
      // nome errado é aceito em silêncio e não faz nada — é por isso que este
      // teste compara a forma exata, e não só a presença de `provider`.
      expect(corpoEnviado(fetchMock).provider).toEqual({
        zdr: true,
        data_collection: "deny",
        require_parameters: true,
      });
    });

    it("manda as preferências mesmo quando o pedido escolhe outro modelo", async () => {
      const fetchMock = vi.fn(async () => Response.json(CORPO_OK));
      vi.stubGlobal("fetch", fetchMock);
      const { gateway } = montar();

      await gateway.completar({ ...PEDIDO, modelo: "google/gemini-2.5-pro", maxTokens: 100 });

      expect(corpoEnviado(fetchMock).provider).toMatchObject({ zdr: true, data_collection: "deny" });
    });
  });

  describe("sem provedor aceitável, nada é enviado", () => {
    it("não tenta de novo — nem sem a exigência, nem com outro provedor", async () => {
      const fetchMock = vi.fn(async () => Response.json(CORPO_SEM_PROVEDOR, { status: 404 }));
      vi.stubGlobal("fetch", fetchMock);
      const { gateway } = montar();

      const resultado = await gateway.completar(PEDIDO);

      // Uma chamada só, e ela levava a exigência. Se um dia alguém acrescentar
      // uma repetição "para não perder a leitura", é aqui que o repositório
      // reclama — antes de a fatura sair.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(corpoEnviado(fetchMock).provider).toMatchObject({ zdr: true });
      expect(resultado.ok).toBe(false);
    });

    it("diz que foi a política, e não uma falha qualquer", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(CORPO_SEM_PROVEDOR, { status: 404 })));
      const { gateway } = montar();

      const resultado = await gateway.completar(PEDIDO);

      expect(resultado).toMatchObject({ ok: false, motivo: "sem_provedor_sem_retencao" });
    });

    it("registra a recusa no consumo, com o motivo por extenso", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(CORPO_SEM_PROVEDOR, { status: 404 })));
      const { gateway, registrar } = montar();

      await gateway.completar(PEDIDO);

      // `llm_chamadas` é onde se descobre, semanas depois, que a exigência ficou
      // sem provedor para atendê-la. Sem esta linha o episódio não deixa rastro.
      expect(registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "erro",
          referencia: "abc123",
          erro: expect.stringContaining("data policy"),
        }),
      );
    });
  });

  describe("as outras falhas continuam distinguíveis", () => {
    it("separa erro de servidor da recusa por política", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ error: { message: "internal" } }, { status: 500 })),
      );
      const { gateway } = montar();

      expect(await gateway.completar(PEDIDO)).toMatchObject({ ok: false, motivo: "falha" });
    });

    it("não sai na rede sem chave, e diz que foi isso", async () => {
      const fetchMock = vi.fn(async () => Response.json(CORPO_OK));
      vi.stubGlobal("fetch", fetchMock);
      const { gateway } = montar(null);

      expect(await gateway.completar(PEDIDO)).toEqual({
        ok: false,
        motivo: "sem_chave",
        detalhe: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
