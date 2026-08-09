import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { JobsRepository, type StoredJobRunInventoryItem } from "./jobs.repository";

@Injectable()
export class PrismaJobsRepository extends JobsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  findRuns(): Promise<StoredJobRunInventoryItem[]> {
    return this.prisma.jobRun.findMany({
      // O JobRunsRecorder grava uma linha por tentativa de job, sem retenção:
      // sem teto, esta resposta cresce para sempre e a tela pagina no cliente.
      take: 100,
      orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        jobKey: true,
        integration: { select: { key: true } },
        scheduledFor: true,
        startedAt: true,
        finishedAt: true,
        status: true,
        attempt: true,
        durationMs: true,
        error: true,
        triggeredBy: true,
        logRef: true,
        createdAt: true,
      },
    });
  }
}
