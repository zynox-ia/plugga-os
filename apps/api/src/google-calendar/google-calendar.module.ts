import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaSegredoRepository } from "../llm/prisma-segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { PrismaModule } from "../prisma/prisma.module";
import { ConexaoGoogleCalendarRepository } from "./conexao-google-calendar.repository";
import { GoogleCalendarHttpAdapter } from "./google-calendar-http.adapter";
import { GoogleCalendarController } from "./google-calendar.controller";
import { GoogleCalendarPort } from "./google-calendar.port";
import { GoogleCalendarService } from "./google-calendar.service";
import { GoogleOAuthCofreService, GoogleOAuthLeitura } from "./google-oauth-cofre.service";
import { GoogleOAuthController } from "./google-oauth.controller";
import { PrismaConexaoGoogleCalendarRepository } from "./prisma-conexao-google-calendar.repository";
import { PrismaGoogleOAuthLeitura } from "./prisma-google-oauth-leitura.repository";

/**
 * Integração com o Google: as credenciais do app OAuth (plataforma) e a conexão da
 * agenda de cada pessoa. A porta para o Google é exportada para a sincronização de
 * atividades usar a mesma abstração (e, nos testes, o adaptador falso).
 */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [GoogleOAuthController, GoogleCalendarController],
  providers: [
    GoogleOAuthCofreService,
    GoogleCalendarService,
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
    { provide: GoogleOAuthLeitura, useClass: PrismaGoogleOAuthLeitura },
    { provide: ConexaoGoogleCalendarRepository, useClass: PrismaConexaoGoogleCalendarRepository },
    { provide: GoogleCalendarPort, useClass: GoogleCalendarHttpAdapter },
  ],
  exports: [GoogleCalendarPort],
})
export class GoogleCalendarModule {}
