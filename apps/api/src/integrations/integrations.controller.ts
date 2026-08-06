import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ListIntegrationsResponse } from "@plugga/shared";

import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
@UseGuards(DevAuthGuard)
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly service: IntegrationsService) {}

  @Get()
  list(): Promise<ListIntegrationsResponse> {
    return this.service.list();
  }
}
