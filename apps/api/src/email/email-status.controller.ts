import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { emailStatusSchema, type EmailStatus } from "@plugga/shared";

import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { RolesGuard } from "../core/auth/roles.guard";

@Controller("email")
@UseGuards(DevAuthGuard, RolesGuard)
export class EmailStatusController {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  /**
   * Not sourced from the `integrations` table (ADR-0005's mock/read_only/
   * bridge/write cutover doesn't apply to email delivery) — just reports the
   * selected EMAIL_PROVIDER adapter (ADR-0010) and whether it can currently
   * deliver. Never an address, key, or other secret.
   */
  @Get("status")
  status(): EmailStatus {
    const provider = this.config.get<EmailStatus["provider"]>("EMAIL_PROVIDER", "noop");
    const configured = provider === "brevo" && Boolean(this.config.get<string>("BREVO_API_KEY"));

    return emailStatusSchema.parse({ provider, configured });
  }
}
