import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ListJobRunsResponse } from "@plugga/shared";

import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { JobsService } from "./jobs.service";

@Controller("jobs")
@UseGuards(SessionAuthGuard, AcessoGuard)
// Tela técnica: o histórico operacional inteiro (inclusive mensagens de erro de
// integração) é só do desenvolvedor.
@Plataforma("desenvolvedor")
export class JobsController {
  constructor(@Inject(JobsService) private readonly service: JobsService) {}

  @Get()
  list(): Promise<ListJobRunsResponse> {
    return this.service.list();
  }
}
