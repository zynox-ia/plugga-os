import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ListJobRunsResponse } from "@plugga/shared";

import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { JobsService } from "./jobs.service";

@Controller("jobs")
@UseGuards(DevAuthGuard, RolesGuard)
// Os mesmos papéis que a navegação da web dá à tela de Jobs: sem o @Roles, o
// RolesGuard sem metadata liberava qualquer autenticado para o histórico
// operacional inteiro (inclusive mensagens de erro de integração).
@Roles("admin", "tech")
export class JobsController {
  constructor(@Inject(JobsService) private readonly service: JobsService) {}

  @Get()
  list(): Promise<ListJobRunsResponse> {
    return this.service.list();
  }
}
