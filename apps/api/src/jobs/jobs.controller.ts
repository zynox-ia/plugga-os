import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ListJobRunsResponse } from "@plugga/shared";

import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { RolesGuard } from "../core/auth/roles.guard";
import { JobsService } from "./jobs.service";

@Controller("jobs")
@UseGuards(DevAuthGuard, RolesGuard)
export class JobsController {
  constructor(@Inject(JobsService) private readonly service: JobsService) {}

  @Get()
  list(): Promise<ListJobRunsResponse> {
    return this.service.list();
  }
}
