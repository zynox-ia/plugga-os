import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ListIntegrationsResponse } from "@plugga/shared";

import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { IntegrationsService } from "./integrations.service";

/**
 * Sem @Roles o RolesGuard libera qualquer autenticado. A navegação
 * (apps/web/app/lib/organizacao.ts) só mostra Integrações para admin e tech;
 * diretoria entra pelo mesmo padrão dos relatórios (llm/consumo.controller.ts).
 */
@Controller("integrations")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles("admin", "diretoria", "tech")
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly service: IntegrationsService) {}

  @Get()
  list(): Promise<ListIntegrationsResponse> {
    return this.service.list();
  }
}
