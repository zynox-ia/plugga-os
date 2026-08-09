import { describe, expect, it } from "vitest";

import {
  JobRunsRepository,
  type FinishJobRunData,
  type StartJobRunData,
} from "./job-runs.repository";
import { JobRunsRecorder } from "./job-runs-recorder";

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
    if (!run) {
      throw new Error(`unknown run ${id}`);
    }
    run.finish = data;
  }
}

const meta = {
  jobKey: "bitrix.import.opm",
  integrationKey: "bitrix",
  attempt: 1,
  triggeredBy: "user:123",
} as const;

describe("JobRunsRecorder", () => {
  it("records a running row then success with duration and logRef", async () => {
    const repository = new InMemoryJobRunsRepository();
    const recorder = new JobRunsRecorder(repository);

    await recorder.run(meta, async ({ jobRunId }) => {
      expect(jobRunId).toBe("run-1");
      return { logRef: "os://job-runs/run-1" };
    });

    const run = repository.runs[0]!;
    expect(run.jobKey).toBe("bitrix.import.opm");
    expect(run.integrationKey).toBe("bitrix");
    expect(run.triggeredBy).toBe("user:123");
    expect(run.finish?.status).toBe("success");
    expect(run.finish?.logRef).toBe("os://job-runs/run-1");
    expect(run.finish?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records `skipped` when the handler's own gate refuses the work", async () => {
    const repository = new InMemoryJobRunsRepository();
    const recorder = new JobRunsRecorder(repository);

    await recorder.run(meta, async () => ({
      skipped: true,
      logRef: "os://bitrix/opm skipped reason=mode",
    }));

    const run = repository.runs[0]!;
    // A refusal must never be indistinguishable from completed work.
    expect(run.finish?.status).toBe("skipped");
    expect(run.finish?.logRef).toBe("os://bitrix/opm skipped reason=mode");
  });

  it("records failure with the error message and rethrows", async () => {
    const repository = new InMemoryJobRunsRepository();
    const recorder = new JobRunsRecorder(repository);

    await expect(
      recorder.run(meta, async () => {
        throw new Error("bitrix unreachable");
      }),
    ).rejects.toThrow("bitrix unreachable");

    const run = repository.runs[0]!;
    expect(run.finish?.status).toBe("failed");
    expect(run.finish?.error).toBe("bitrix unreachable");
  });

  it("não reexecuta trabalho concluído quando a contabilidade falha", async () => {
    // Se a rejeição do finishRun subisse, o BullMQ marcaria o job como failed
    // e rodaria de novo um handler que já terminou — import duplicado.
    const repository = new InMemoryJobRunsRepository();
    repository.finishRun = async () => {
      throw new Error("postgres piscou");
    };
    const recorder = new JobRunsRecorder(repository);

    let execucoes = 0;
    await expect(
      recorder.run(meta, async () => {
        execucoes += 1;
      }),
    ).resolves.toBeUndefined();
    expect(execucoes).toBe(1);
  });

  it("propaga o erro do handler mesmo quando o finishRun de falha também falha", async () => {
    const repository = new InMemoryJobRunsRepository();
    repository.finishRun = async () => {
      throw new Error("postgres piscou");
    };
    const recorder = new JobRunsRecorder(repository);

    // O BullMQ precisa registrar a causa real, não o erro de contabilidade.
    await expect(
      recorder.run(meta, async () => {
        throw new Error("bitrix unreachable");
      }),
    ).rejects.toThrow("bitrix unreachable");
  });
});
