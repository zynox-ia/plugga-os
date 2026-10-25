import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleKey } from "@plugga/shared";

import { acessoDeclarado } from "./access.decorators";
import { atendeExigencia, exigenciaDeAcesso } from "./acesso.decorator";
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
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Modelo de 4 papéis (`@Departamento`/`@Plataforma`). Fica neste guard, e
    // não num separado, para a declaração nunca valer sem quem a aplique. Junto
    // de `@Roles`, as duas exigências valem.
    const exigencia = exigenciaDeAcesso(this.reflector, context.getHandler() as never, context.getClass() as never);
    if ((exigencia.departamento || exigencia.plataforma) && !atendeExigencia(request.authPrincipal?.acesso, exigencia)) {
      throw new ForbiddenException("principal does not have the required access");
    }

    if (!required?.length) {
      // Fail-closed (US5): sem papel, a rota só passa se declarou `@Public`,
      // `@Authenticated`, `@Permissions`, `@Departamento` ou `@Plataforma`.
      // Rota sem nenhuma declaração é negada.
      const { acesso } = acessoDeclarado(this.reflector, context.getHandler() as never, context.getClass() as never);
      if (acesso === "undeclared") {
        throw new ForbiddenException("rota sem declaração de acesso");
      }
      return true;
    }

    const roles = request.authPrincipal?.roles ?? [];
    if (!required.some((role) => roles.includes(role))) {
      throw new ForbiddenException("principal does not have a required role");
    }

    return true;
  }
}
