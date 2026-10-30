import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ListIntegrationsResponse } from "@plugga/shared";

import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { IntegrationsService } from "./integrations.service";

/** Integrações é tela de administração: admin e desenvolvedor. */
@Controller("integrations")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Plataforma("admin")
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly service: IntegrationsService) {}

  @Get()
  list(): Promise<ListIntegrationsResponse> {
    return this.service.list();
  }
}
