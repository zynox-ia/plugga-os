import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { EmailModule } from "../email/email.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { LockoutService } from "./lockout.service";
import { PasswordService } from "./password.service";
import { PrismaAuthRepository } from "./prisma-auth.repository";
import { SessionService } from "./session.service";

@Module({
  imports: [
    CoreModule,
    PrismaModule,
    AuditModule,
    EmailModule,
    // Per-IP request rate limiting; sensitive routes tighten via @Throttle.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    LockoutService,
    { provide: AuthRepository, useClass: PrismaAuthRepository },
  ],
})
export class AuthModule {}
