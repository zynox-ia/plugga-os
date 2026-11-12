import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaSegredoRepository } from "../llm/prisma-segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { PrismaModule } from "../prisma/prisma.module";
import { GoogleOAuthCofreService, GoogleOAuthLeitura } from "./google-oauth-cofre.service";
import { GoogleOAuthController } from "./google-oauth.controller";
import { PrismaGoogleOAuthLeitura } from "./prisma-google-oauth-leitura.repository";

/**
 * Integração com o Google: as credenciais do app OAuth (plataforma) e, a seguir,
 * a conexão da agenda de cada pessoa.
 */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [GoogleOAuthController],
  providers: [
    GoogleOAuthCofreService,
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
    { provide: GoogleOAuthLeitura, useClass: PrismaGoogleOAuthLeitura },
  ],
})
export class GoogleCalendarModule {}
