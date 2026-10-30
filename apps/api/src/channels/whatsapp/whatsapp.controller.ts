import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  whatsappSendSchema,
  type WhatsappSendRequest,
  type WhatsappSendResponse,
} from "@plugga/shared";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentPrincipal } from "../../core/auth/current-principal.decorator";
import { SessionAuthGuard } from "../../core/auth/session-auth.guard";
import { OriginCheckGuard } from "../../core/auth/origin-check.guard";
import { Plataforma } from "../../core/auth/acesso.decorator";
import { AcessoGuard } from "../../core/auth/acesso.guard";
import type { AuthPrincipal } from "../../core/auth/auth.types";
import { WhatsappService } from "./whatsapp.service";

@Controller("channels/whatsapp")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Plataforma("desenvolvedor")
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
