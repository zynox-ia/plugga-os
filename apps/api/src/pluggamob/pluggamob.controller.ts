import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { PluggamobOverview } from "@plugga/shared";

import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { PluggamobService } from "./pluggamob.service";

@Controller("pluggamob")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles("pluggamob", "financeiro", "diretoria", "tech", "admin")
export class PluggamobController {
  constructor(@Inject(PluggamobService) private readonly service: PluggamobService) {}

  @Get("overview")
  overview(): Promise<PluggamobOverview> {
    return this.service.overview();
  }
}
