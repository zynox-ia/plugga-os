import { Inject, Injectable } from "@nestjs/common";

import type { JobHandler, JobResult } from "../../jobs/queue/job-handler";
import {
  BITRIX_INTEGRATION_KEY,
  BITRIX_OPM_IMPORT_JOB_KEY,
} from "./bitrix.constants";
import { BitrixImportService } from "./bitrix-import.service";

/**
 * BullMQ handler for the OPM (C7) read-only import. Idempotent: re-running
 * mirrors the same records without duplicates. Its job_runs lifecycle (and the
 * counts in logRef) are recorded by the worker's JobRunsRecorder.
 */
@Injectable()
export class BitrixOpmImportHandler implements JobHandler {
  readonly jobKey = BITRIX_OPM_IMPORT_JOB_KEY;
  readonly integrationKey = BITRIX_INTEGRATION_KEY;

  constructor(
    @Inject(BitrixImportService) private readonly importService: BitrixImportService,
  ) {}

  async process(): Promise<JobResult> {
    const summary = await this.importService.importOpm();
    return {
      logRef:
        `os://bitrix/${summary.domain} ` +
        `read=${summary.read} created=${summary.created} ` +
        `updated=${summary.updated} unchanged=${summary.unchanged} ` +
        `skipped=${summary.skipped} truncated=${summary.truncated}`,
    };
  }
}
