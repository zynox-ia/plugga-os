import {
  ConflictException,
  Controller,
  Inject,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { TriggerBitrixImportResponse } from "@plugga/shared";

import { CurrentPrincipal } from "../../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../../core/auth/origin-check.guard";
import { Roles } from "../../core/auth/roles.decorator";
import { RolesGuard } from "../../core/auth/roles.guard";
import type { AuthPrincipal } from "../../core/auth/auth.types";
import { JobsQueue } from "../../jobs/queue/jobs-queue.port";
import { BitrixImportService } from "./bitrix-import.service";
import {
  BITRIX_OPM_DOMAIN,
  BITRIX_OPM_IMPORT_JOB_KEY,
} from "./bitrix.constants";

/**
 * Admin-triggered enqueue for the Bitrix read-only import. The gate itself lives
 * in BitrixImportService and is re-checked when the job actually runs; the
 * 409/503 here are synchronous feedback for the HTTP caller, not the guarantee.
 */
@Controller("integrations/bitrix")
@UseGuards(DevAuthGuard, RolesGuard, OriginCheckGuard)
export class BitrixController {
  constructor(
    @Inject(BitrixImportService) private readonly importService: BitrixImportService,
    @Inject(JobsQueue) private readonly queue: JobsQueue,
  ) {}

  @Post("import")
  @Roles("admin")
  async triggerOpmImport(
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<TriggerBitrixImportResponse> {
    const gate = await this.importService.evaluateGate();
    if (!gate.allowed) {
      throw gate.reason === "mode"
        ? new ConflictException(
            `bitrix must be in read_only mode to import (current: ${gate.mode ?? "unknown"})`,
          )
        : new ServiceUnavailableException("bitrix read credential is not configured");
    }

    const result = await this.queue.enqueue(
      BITRIX_OPM_IMPORT_JOB_KEY,
      {},
      { triggeredBy: describePrincipal(principal) },
    );

    return {
      domain: BITRIX_OPM_DOMAIN,
      jobKey: result.jobKey,
      jobId: result.jobId,
      deduped: result.deduped,
    };
  }
}

/** `kind:id`, without doubling a prefix an id already carries (e.g. `service:x`). */
function describePrincipal(principal: AuthPrincipal): string {
  return principal.id.startsWith(`${principal.kind}:`)
    ? principal.id
    : `${principal.kind}:${principal.id}`;
}
