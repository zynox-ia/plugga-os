import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";

import { DisabledJobsQueue } from "./disabled-jobs-queue";
import { JobHandlerRegistry } from "./job-handler-registry";
import { JobRunsRecorder } from "./job-runs-recorder";
import { JobsQueue } from "./jobs-queue.port";
import { JobsQueueModule } from "./jobs-queue.module";

describe("JobsQueueModule", () => {
  const modules: { close(): Promise<void> }[] = [];

  afterEach(async () => {
    await Promise.all(modules.splice(0).map((module) => module.close()));
  });

  async function build(config: Record<string, unknown>) {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => config] }),
        JobsQueueModule,
      ],
    }).compile();
    modules.push(module);
    return module;
  }

  it("provides the safe DisabledJobsQueue when JOBS_ENABLED is off", async () => {
    const module = await build({ JOBS_ENABLED: false });

    const queue = module.get(JobsQueue);
    expect(queue).toBeInstanceOf(DisabledJobsQueue);
    expect(module.get(JobHandlerRegistry)).toBeInstanceOf(JobHandlerRegistry);
    expect(module.get(JobRunsRecorder)).toBeInstanceOf(JobRunsRecorder);
  });

  it("the disabled queue fails loudly instead of dropping jobs", async () => {
    const module = await build({ JOBS_ENABLED: false });
    const queue = module.get(JobsQueue);

    await expect(queue.enqueue("bitrix.import.opm", {})).rejects.toThrow(/disabled/);
  });
});
