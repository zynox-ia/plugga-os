import {
  ConflictException,
  Controller,
  Inject,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TriggerBitrixImportResponse } from "@plugga/shared";

import { CurrentPrincipal } from "../../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../../core/auth/dev-auth.guard";
import { Roles } from "../../core/auth/roles.decorator";
import { RolesGuard } from "../../core/auth/roles.guard";
import type { AuthPrincipal } from "../../core/auth/auth.types";
import { JobsQueue } from "../../jobs/queue/jobs-queue.port";
import {
  BITRIX_INTEGRATION_KEY,
  BITRIX_OPM_DOMAIN,
  BITRIX_OPM_IMPORT_JOB_KEY,
} from "./bitrix.constants";
import { BitrixRepository } from "./bitrix.repository";

/**
 * Admin-triggered enqueue for the Bitrix read-only import. The capability is
 * gated (ADR-0009): it exists only when the domain is in read_only mode AND the
 * credential is present. Otherwise it refuses rather than reading Bitrix.
 */
@Controller("integrations/bitrix")
@UseGuards(DevAuthGuard, RolesGuard)
export class BitrixController {
  constructor(
    @Inject(BitrixRepository) private readonly repository: BitrixRepository,
    @Inject(JobsQueue) private readonly queue: JobsQueue,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Post("import")
  @Roles("admin")
  async triggerOpmImport(
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<TriggerBitrixImportResponse> {
    const mode = await this.repository.getIntegrationMode(BITRIX_INTEGRATION_KEY);
    if (mode !== "read_only") {
      throw new ConflictException(
        `bitrix must be in read_only mode to import (current: ${mode ?? "unknown"})`,
      );
    }

    if (!this.config.get<string>("BITRIX_WEBHOOK_URL") || !this.config.get<number>("BITRIX_OPM_ENTITY_TYPE_ID")) {
      throw new ServiceUnavailableException("bitrix read credential is not configured");
    }

    const result = await this.queue.enqueue(
      BITRIX_OPM_IMPORT_JOB_KEY,
      {},
      { triggeredBy: `${principal.kind}:${principal.id}` },
    );

    return {
      domain: BITRIX_OPM_DOMAIN,
      jobKey: result.jobKey,
      jobId: result.jobId,
      deduped: result.deduped,
    };
  }
}
