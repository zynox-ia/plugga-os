import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { JobHandlerRegistry } from "./job-handler-registry";
import type { JobContext, JobHandler } from "./job-handler";
import { JobRunsRecorder } from "./job-runs-recorder";
import {
  JobRunsRepository,
  type FinishJobRunData,
  type StartJobRunData,
} from "./job-runs.repository";
import { JobsWorker, type DispatchableJob } from "./jobs-worker";

interface StoredRun extends StartJobRunData {
  id: string;
  finish?: FinishJobRunData;
}

class InMemoryJobRunsRepository extends JobRunsRepository {
  readonly runs: StoredRun[] = [];
  async startRun(data: StartJobRunData): Promise<string> {
    const id = `run-${this.runs.length + 1}`;
    this.runs.push({ id, ...data });
    return id;
  }
  async finishRun(id: string, data: FinishJobRunData): Promise<void> {
    const run = this.runs.find((candidate) => candidate.id === id);
    run!.finish = data;
  }
}

function buildWorker(handler?: JobHandler) {
  const registry = new JobHandlerRegistry();
  if (handler) {
    registry.register(handler);
  }
  const repository = new InMemoryJobRunsRepository();
  const recorder = new JobRunsRecorder(repository);
  const config = new ConfigService({ JOBS_ENABLED: false });
  const worker = new JobsWorker(config, registry, recorder);
  return { worker, repository };
}

function job(overrides: Partial<DispatchableJob> = {}): DispatchableJob {
  return {
    name: "bitrix.import.opm",
    data: { payload: { domain: "C7" }, meta: { triggeredBy: "user:1" } },
    attemptsMade: 0,
    ...overrides,
  };
}

describe("JobsWorker.dispatch", () => {
  it("runs the registered handler and records a successful job_run", async () => {
    const seen: { payload: unknown; context: JobContext }[] = [];
    const handler: JobHandler<{ domain: string }> = {
      jobKey: "bitrix.import.opm",
      integrationKey: "bitrix",
      async process(payload, context) {
        seen.push({ payload, context });
        return { logRef: "os://run" };
      },
    };
    const { worker, repository } = buildWorker(handler);

    await worker.dispatch(job());

    expect(seen).toHaveLength(1);
    expect(seen[0].payload).toEqual({ domain: "C7" });
    expect(seen[0].context).toMatchObject({ jobKey: "bitrix.import.opm", attempt: 1 });
    expect(repository.runs[0]).toMatchObject({
      jobKey: "bitrix.import.opm",
      integrationKey: "bitrix",
      attempt: 1,
      triggeredBy: "user:1",
    });
    expect(repository.runs[0].finish?.status).toBe("success");
  });

  it("computes the 1-based attempt from attemptsMade", async () => {
    const handler: JobHandler = {
      jobKey: "bitrix.import.opm",
      async process() {},
    };
    const { worker, repository } = buildWorker(handler);

    await worker.dispatch(job({ attemptsMade: 2 }));

    expect(repository.runs[0].attempt).toBe(3);
  });

  it("throws and records a failure when the handler throws", async () => {
    const handler: JobHandler = {
      jobKey: "bitrix.import.opm",
      async process() {
        throw new Error("read failed");
      },
    };
    const { worker, repository } = buildWorker(handler);

    await expect(worker.dispatch(job())).rejects.toThrow("read failed");
    expect(repository.runs[0].finish?.status).toBe("failed");
    expect(repository.runs[0].finish?.error).toBe("read failed");
  });

  it("throws when no handler is registered for the job", async () => {
    const { worker, repository } = buildWorker();

    await expect(worker.dispatch(job())).rejects.toThrow(/no handler registered/);
    expect(repository.runs).toHaveLength(0);
  });

  it("does not start a worker when JOBS_ENABLED is false", () => {
    const { worker } = buildWorker();
    expect(() => worker.onApplicationBootstrap()).not.toThrow();
  });
});
