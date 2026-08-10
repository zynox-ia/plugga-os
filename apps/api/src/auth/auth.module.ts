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
import { EmailAttemptLimiter } from "./email-attempt-limiter.service";
import { GoogleAuthLibraryVerifier } from "./google-auth-library.verifier";
import { GoogleAuthService } from "./google-auth.service";
import { GoogleIdentityVerifier } from "./google-identity.verifier";
import { LockoutService } from "./lockout.service";
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
    // Per-IP request rate limiting; sensitive routes tighten via @Throttle.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AuthController, TeamController],
  providers: [
    AuthService,
    AuthTokenIssuer,
    GoogleAuthService,
    TeamService,
    PasswordService,
    SessionService,
    LockoutService,
    EmailAttemptLimiter,
    { provide: AuthRepository, useClass: PrismaAuthRepository },
    // A porta é o que permite exercitar toda a política de vínculo sem rede e
    // sem conta Google real — e sem abrir um atalho por variável de ambiente,
    // que existiria também em produção.
    { provide: GoogleIdentityVerifier, useClass: GoogleAuthLibraryVerifier },
  ],
})
export class AuthModule {}
