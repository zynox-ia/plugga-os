import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { JobHandler } from "../src/jobs/queue/job-handler";
import { JobHandlerRegistry } from "../src/jobs/queue/job-handler-registry";
import { JobsQueue } from "../src/jobs/queue/jobs-queue.port";
import { JobsQueueModule } from "../src/jobs/queue/jobs-queue.module";

/**
 * Opt-in smoke test (mirrors test:db): enqueues a real job, lets the BullMQ
 * worker process it, and asserts the job_runs lifecycle in Postgres. Skipped
 * unless RUN_JOBS_INTEGRATION_TESTS=true with Redis + Postgres reachable.
 */
const enabled = process.env.RUN_JOBS_INTEGRATION_TESTS === "true";
const describeJobs = enabled ? describe : describe.skip;

// 56379 é o Redis do stack local; na 6379 desta máquina vive o túnel para o
// Redis de PRODUÇÃO (mesma razão do guard de DATABASE_URL em test/setup.ts).
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:56379";
const MARKER = `test.jobs.integration.${Date.now()}`;

async function waitFor<T>(
  probe: () => Promise<T | null>,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for job_run");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describeJobs("BullMQ jobs foundation (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JOBS_ENABLED: true,
              JOBS_WORKER_CONCURRENCY: 1,
              REDIS_URL,
              DATABASE_URL: process.env.DATABASE_URL,
            }),
          ],
        }),
        JobsQueueModule,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    const registry = app.get(JobHandlerRegistry);
    const okHandler: JobHandler<{ value: number }> = {
      jobKey: `${MARKER}.ok`,
      async process() {
        return { logRef: "os://job-runs/ok" };
      },
    };
    const failHandler: JobHandler = {
      jobKey: `${MARKER}.fail`,
      async process() {
        throw new Error("intentional failure for integration test");
      },
    };
    registry.register(okHandler);
    registry.register(failHandler);
  });

  afterAll(async () => {
    await app?.close();
    await prisma.jobRun.deleteMany({ where: { jobKey: { startsWith: MARKER } } });
    await prisma.$disconnect();
  });

  it("processes an enqueued job and records a successful job_run", async () => {
    const queue = app.get(JobsQueue);
    await queue.enqueue(`${MARKER}.ok`, { value: 42 }, { triggeredBy: "user:test" });

    const run = await waitFor(async () =>
      prisma.jobRun.findFirst({
        where: { jobKey: `${MARKER}.ok`, status: "success" },
      }),
    );

    expect(run.triggeredBy).toBe("user:test");
    expect(run.startedAt).not.toBeNull();
    expect(run.finishedAt).not.toBeNull();
    expect(run.durationMs).toBeGreaterThanOrEqual(0);
    expect(run.logRef).toBe("os://job-runs/ok");
  });

  it("records a failed job_run when the handler throws", async () => {
    const queue = app.get(JobsQueue);
    await queue.enqueue(`${MARKER}.fail`, {}, { attempts: 1, triggeredBy: "user:test" });

    const run = await waitFor(async () =>
      prisma.jobRun.findFirst({
        where: { jobKey: `${MARKER}.fail`, status: "failed" },
      }),
    );

    expect(run.error).toContain("intentional failure");
  });
});
