import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../src/prisma/prisma.service.js";
import { PrismaConsumoRepository } from "../src/llm/prisma-consumo.repository.js";
import { PROCESSOS } from "../src/llm/processo.js";

/**
 * A agregação do consumo, contra o Postgres de verdade.
 *
 * Fica atrás de variável porque exige banco no ar:
 *
 *     docker compose up -d postgres
 *     pnpm --filter @plugga/api test:llm
 *
 * O que se prova é o SQL, que é onde mora o risco: `count(DISTINCT referencia)`
 * e a soma em `numeric` não têm equivalente no cliente do Prisma, então nenhum
 * teste unitário cobriria. Um erro aqui produz relatório plausível e errado.
 */
const HABILITADO = process.env.RUN_LLM_INTEGRATION_TESTS === "true";

const PRAZO_MS = 60_000;

describe.skipIf(!HABILITADO)("consumo da chave de LLM", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaConsumoRepository(prisma);
  const marcador = `teste-${Date.now()}`;

  beforeAll(async () => {
    await prisma.$connect();
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.llmChamada.deleteMany({ where: { erro: marcador } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "soma tokens e custo por processo e conta faturas distintas",
    async () => {
      const base = {
        processo: PROCESSOS.FATURA_VISAO,
        modelo: "anthropic/claude-sonnet-4.5",
        modeloServido: "anthropic/claude-sonnet-4.5",
        tokensCache: 0,
        tokensRaciocinio: 0,
        duracaoMs: 1000,
        // O marcador vai no campo de erro para a limpeza achar só as linhas
        // deste teste; nenhuma outra linha da tabela é tocada.
        erro: marcador,
        geracaoId: null,
      };

      // Duas chamadas para a MESMA fatura e uma para outra: três chamadas, duas
      // faturas. É a diferença que o custo por unidade depende de acertar.
      await repositorio.registrar({
        ...base,
        status: "ok",
        tokensEntrada: 1000,
        tokensSaida: 200,
        custoCreditos: 0.01,
        referencia: `${marcador}-fatura-a`,
      });
      await repositorio.registrar({
        ...base,
        status: "erro",
        tokensEntrada: 500,
        tokensSaida: 0,
        custoCreditos: 0.002,
        referencia: `${marcador}-fatura-a`,
      });
      await repositorio.registrar({
        ...base,
        status: "ok",
        tokensEntrada: 1500,
        tokensSaida: 300,
        custoCreditos: 0.02,
        referencia: `${marcador}-fatura-b`,
      });

      const desde = new Date(Date.now() - 60 * 60 * 1000);
      const ate = new Date(Date.now() + 60 * 60 * 1000);
      const linhas = await repositorio.porProcesso({ desde, ate });
      const nossa = linhas.find((l) => l.processo === PROCESSOS.FATURA_VISAO);

      expect(nossa).toBeDefined();
      // As três chamadas contam, inclusive a que falhou.
      expect(nossa!.chamadas).toBeGreaterThanOrEqual(3);
      expect(nossa!.falhas).toBeGreaterThanOrEqual(1);
      // Somas em `numeric`: 0,01 + 0,002 + 0,02 tem de dar 0,032 exato, sem a
      // sujeira que ponto flutuante deixaria.
      expect(nossa!.custoCreditos).toBeGreaterThanOrEqual(0.032);
    },
    PRAZO_MS,
  );

  it(
    "agrupa por dia sem jogar o consumo da noite para a data seguinte",
    async () => {
      const desde = new Date(Date.now() - 60 * 60 * 1000);
      const ate = new Date(Date.now() + 60 * 60 * 1000);
      const dias = await repositorio.porDia({ desde, ate });

      expect(dias.length).toBeGreaterThan(0);
      // Formato de data pura, já convertida para Manaus pela consulta.
      expect(dias[0]?.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
    PRAZO_MS,
  );
});
