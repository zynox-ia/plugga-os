import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { acessoDeclarado } from "./access.decorators";
import { atendeExigencia, exigenciaDeAcesso } from "./acesso.decorator";
import { type AuthenticatedRequest } from "./auth.types";

/**
 * Aplica `@Departamento`/`@Plataforma` (modelo de 4 papéis). Fail-closed: rota
 * sem nenhuma declaração (`@Public`, `@Authenticated`, `@Departamento`,
 * `@Plataforma`) é negada, mesmo que o guard global de rota fechada esteja em
 * modo `warn`.
 */
@Injectable()
export class AcessoGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler() as never;
    const classe = context.getClass() as never;
    const exigencia = exigenciaDeAcesso(this.reflector, handler, classe);

    if (exigencia.departamento || exigencia.plataforma) {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      if (!atendeExigencia(request.authPrincipal?.acesso, exigencia)) {
        throw new ForbiddenException("principal does not have the required access");
      }
      return true;
    }

    if (acessoDeclarado(this.reflector, handler, classe).acesso === "undeclared") {
      throw new ForbiddenException("rota sem declaração de acesso");
    }
    return true;
  }
}
