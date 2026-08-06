import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import {
  JobRunsRepository,
  type FinishJobRunData,
  type StartJobRunData,
} from "./job-runs.repository";

@Injectable()
export class PrismaJobRunsRepository extends JobRunsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async startRun(data: StartJobRunData): Promise<string> {
    const integrationId = data.integrationKey
      ? (
          await this.prisma.integration.findUnique({
            where: { key: data.integrationKey },
            select: { id: true },
          })
        )?.id ?? null
      : null;

    const run = await this.prisma.jobRun.create({
      data: {
        jobKey: data.jobKey,
        integrationId,
        startedAt: data.startedAt,
        status: "running",
        attempt: data.attempt,
        triggeredBy: data.triggeredBy,
      },
      select: { id: true },
    });

    return run.id;
  }

  async finishRun(id: string, data: FinishJobRunData): Promise<void> {
    await this.prisma.jobRun.update({
      where: { id },
      data: {
        status: data.status,
        finishedAt: data.finishedAt,
        durationMs: data.durationMs,
        error: data.error ?? null,
        logRef: data.logRef ?? null,
      },
    });
  }
}
