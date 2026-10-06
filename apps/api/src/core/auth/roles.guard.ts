import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleKey } from "@plugga/shared";

import { acessoDeclarado } from "./access.decorators";
import { type AuthenticatedRequest } from "./auth.types";
import { ROLES_METADATA } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleKey[]>(ROLES_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      // Fail-closed (US5): sem papel, a rota só passa se declarou `@Public`,
      // `@Authenticated` ou `@Permissions`. Rota sem nenhuma declaração é negada.
      const { acesso } = acessoDeclarado(this.reflector, context.getHandler() as never, context.getClass() as never);
      if (acesso === "undeclared") {
        throw new ForbiddenException("rota sem declaração de acesso");
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const roles = request.authPrincipal?.roles ?? [];
    if (!required.some((role) => roles.includes(role))) {
      throw new ForbiddenException("principal does not have a required role");
    }

    return true;
  }
}
