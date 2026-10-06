import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { EmailModule } from "../email/email.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { AuthTokenIssuer } from "./auth-token-issuer.service";
import { GoogleAuthLibraryVerifier } from "./google-auth-library.verifier";
import { GoogleAuthService } from "./google-auth.service";
import { GoogleIdentityVerifier } from "./google-identity.verifier";
import { ContadorTentativas } from "./limitador/contador-tentativas";
import { ContadorThrottlerStorage } from "./limitador/contador-throttler-storage";
import { LimitadorModule } from "./limitador/limitador.module";
import { PasswordService } from "./password.service";
import { PrismaAuthRepository } from "./prisma-auth.repository";
import { SessionService } from "./session.service";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

@Module({
  imports: [
    CoreModule,
    PrismaModule,
    AuditModule,
    EmailModule,
    LimitadorModule,
    // Per-IP request rate limiting; sensitive routes tighten via @Throttle.
    // Os contadores vivem no Redis (US11, T112, SEC-006): sobrevivem a reinício
    // e valem para todas as instâncias. O módulo é global, então este
    // armazenamento atende também os controllers de outros módulos.
    ThrottlerModule.forRootAsync({
      imports: [LimitadorModule],
      inject: [ContadorTentativas],
      useFactory: (contador: ContadorTentativas) => ({
        throttlers: [{ name: "default", ttl: 60_000, limit: 60 }],
        storage: new ContadorThrottlerStorage(contador),
      }),
    }),
  ],
  controllers: [AuthController, TeamController],
  providers: [
    AuthService,
    AuthTokenIssuer,
    GoogleAuthService,
    TeamService,
    PasswordService,
    SessionService,
    { provide: AuthRepository, useClass: PrismaAuthRepository },
    // A porta é o que permite exercitar toda a política de vínculo sem rede e
    // sem conta Google real — e sem abrir um atalho por variável de ambiente,
    // que existiria também em produção.
    { provide: GoogleIdentityVerifier, useClass: GoogleAuthLibraryVerifier },
  ],
})
export class AuthModule {}
