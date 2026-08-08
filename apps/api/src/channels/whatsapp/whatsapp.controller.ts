import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
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

// OriginCheckGuard belongs on every mutating route (see CoreModule): the send is
// a no-op, but it still writes an audit trail on the caller's behalf.
@Controller("channels/whatsapp")
@UseGuards(DevAuthGuard, RolesGuard, OriginCheckGuard)
@Roles("tech", "admin")
export class WhatsappController {
  constructor(@Inject(WhatsappService) private readonly service: WhatsappService) {}

  @Post("send")
  send(
    @Body(new ZodValidationPipe(whatsappSendSchema)) request: WhatsappSendRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<WhatsappSendResponse> {
    return this.service.simulateSend(request, principal);
  }
}
