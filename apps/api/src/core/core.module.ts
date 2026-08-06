import { Module } from "@nestjs/common";

import { AuthContext } from "./auth/auth.types";
import { DevAuthGuard } from "./auth/dev-auth.guard";
import { DevHeaderAuthContext } from "./auth/dev-header-auth-context";
import { RolesGuard } from "./auth/roles.guard";

@Module({
  providers: [
    { provide: AuthContext, useClass: DevHeaderAuthContext },
    DevAuthGuard,
    RolesGuard,
  ],
  exports: [AuthContext, DevAuthGuard, RolesGuard],
})
export class CoreModule {}
