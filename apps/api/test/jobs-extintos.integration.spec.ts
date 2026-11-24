import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BullJobsQueue } from "../src/jobs/queue/bull-jobs-queue";
import { JOBS_QUEUE_NAME } from "../src/jobs/queue/jobs-queue.constants";
import { LimpezaDeJobsExtintos } from "../src/jobs/queue/limpeza-de-jobs-extintos";

/**
 * A limpeza do que a integração com o OMIE (extinta em 24/11/2026) deixou no Redis, contra
 * um Redis de verdade: o agendamento `omie-despacho` e os jobs `omie.*` pendentes saem; os
 * outros jobs ficam; rodar de novo não muda nada. Opt-in, como o test:jobs.
 */
const enabled = process.env.RUN_JOBS_INTEGRATION_TESTS === "true";
const describeJobs = enabled ? describe : describe.skip;

// 56380 é o Redis do stack LOCAL TEST; a 6379 desta máquina é o túnel para PRODUÇÃO.
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:56380";
const HORA_MS = 3_600_000;

describeJobs("limpeza dos jobs extintos no Redis (integration)", () => {
  let fila: BullJobsQueue;
  let conexao: Redis;
  let inspecao: Queue;
  const outro = `test.jobs-extintos.mantem.${randomUUID().slice(0, 8)}`;

  beforeAll(() => {
    fila = new BullJobsQueue(REDIS_URL);
    conexao = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    inspecao = new Queue(JOBS_QUEUE_NAME, { connection: conexao });
  });

  afterAll(async () => {
    for (const job of await inspecao.getJobs(["delayed"])) if (job?.name === outro) await job.remove();
    await inspecao.close();
    await conexao.quit();
    await fila.onModuleDestroy();
  });

  it("tira o agendamento do despacho e os omie.* pendentes; o resto fica; de novo, nada muda", async () => {
    // O que a API antiga deixava: o despacho a cada 30 min e envios esperando.
    await fila.agendarACada("omie.despachar", {}, { id: "omie-despacho", intervaloMs: 30 * 60_000 });
    await fila.enqueue("omie.enviar", { envioId: "x" }, { delayMs: HORA_MS });
    await fila.enqueue(outro, {}, { delayMs: HORA_MS });

    const limpeza = new LimpezaDeJobsExtintos(fila);
    const primeira = await limpeza.limpar();
    expect(primeira.agendamentosRemovidos).toBe(1);
    expect(primeira.descartados).toBeGreaterThanOrEqual(1);

    const agendamentos = await inspecao.getJobSchedulers();
    expect(agendamentos.map((a) => a.key)).not.toContain("omie-despacho");
    const pendentes = await inspecao.getJobs(["waiting", "delayed", "prioritized"]);
    expect(pendentes.filter((j) => j?.name.startsWith("omie.")).map((j) => j?.name)).toEqual([]);
    expect(pendentes.some((j) => j?.name === outro)).toBe(true);

    expect(await limpeza.limpar()).toEqual({ agendamentosRemovidos: 0, descartados: 0 });
  });
});
