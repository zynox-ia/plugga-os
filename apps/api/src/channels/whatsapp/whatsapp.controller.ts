import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  whatsappSendSchema,
  type WhatsappSendRequest,
  type WhatsappSendResponse,
} from "@plugga/shared";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentPrincipal } from "../../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../../core/auth/origin-check.guard";
import { Roles } from "../../core/auth/roles.decorator";
import { RolesGuard } from "../../core/auth/roles.guard";
import type { AuthPrincipal } from "../../core/auth/auth.types";
import { WhatsappService } from "./whatsapp.service";

@Controller("channels/whatsapp")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles("tech", "admin")
export class WhatsappController {
  constructor(@Inject(WhatsappService) private readonly service: WhatsappService) {}

  // 🔒 SEGURANÇA [VULN-3]: OriginCheckGuard (CSRF, faltava aqui) e ThrottlerGuard
  // (DoS por mutação sem taxa) — mesmo padrão aplicado a todo POST/PATCH de
  // domínio nesta auditoria. Sem eles, uma sessão comprometida ou um site
  // hostil que arraste um `tech`/`admin` poderia disparar volume arbitrário de
  // "envios" simulados, cada um gravando evento de auditoria.
  @Post("send")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  send(
    @Body(new ZodValidationPipe(whatsappSendSchema)) request: WhatsappSendRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<WhatsappSendResponse> {
    return this.service.simulateSend(request, principal);
  }
}
