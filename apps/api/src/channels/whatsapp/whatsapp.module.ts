import { Module } from "@nestjs/common";

import { AuditModule } from "../../audit/audit.module";
import { CoreModule } from "../../core/core.module";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappService } from "./whatsapp.service";

@Module({
  imports: [AuditModule, CoreModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}
