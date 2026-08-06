import { Inject, Injectable } from "@nestjs/common";

import type { JobHandler, JobResult } from "../../jobs/queue/job-handler";
import {
  BITRIX_INTEGRATION_KEY,
  BITRIX_OPM_DOMAIN,
  BITRIX_OPM_IMPORT_JOB_KEY,
} from "./bitrix.constants";
import { BitrixImportService } from "./bitrix-import.service";

/**
 * BullMQ handler for the OPM (C7) read-only import. Idempotent: re-running
 * mirrors the same records without duplicates. Its job_runs lifecycle (and the
 * counts in logRef) are recorded by the worker's JobRunsRecorder.
 *
 * The mode + credential gate is enforced by the import service, not by the HTTP
 * controller alone: a job can also arrive from the scheduler or from a BullMQ
 * retry that runs after the mode was downgraded. A closed gate records the run
 * as `skipped` and reads nothing.
 */
@Injectable()
export class BitrixOpmImportHandler implements JobHandler {
  readonly jobKey = BITRIX_OPM_IMPORT_JOB_KEY;
  readonly integrationKey = BITRIX_INTEGRATION_KEY;

  constructor(
    @Inject(BitrixImportService) private readonly importService: BitrixImportService,
  ) {}

  async process(): Promise<JobResult> {
    const outcome = await this.importService.importOpm();

    if (outcome.skipped) {
      return {
        skipped: true,
        logRef: `os://bitrix/${BITRIX_OPM_DOMAIN} skipped reason=${outcome.reason}`,
      };
    }

    const { summary } = outcome;
    return {
      logRef:
        `os://bitrix/${summary.domain} ` +
        `read=${summary.read} created=${summary.created} ` +
        `updated=${summary.updated} unchanged=${summary.unchanged} ` +
        `skipped=${summary.skipped} truncated=${summary.truncated}`,
    };
  }
}
