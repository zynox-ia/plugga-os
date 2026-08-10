import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLE_PERMISSIONS, type PermissionKey } from "@plugga/shared";

import { type AuthenticatedRequest } from "./auth.types";
import { PERMISSIONS_METADATA } from "./permissions.decorator";

/**
 * Mesma forma do `RolesGuard`: sem `@Permissions(...)` na rota, passa. Com,
 * recusa quando nenhum papel do principal tem a permissão pedida. Não lê
 * banco — `ROLE_PERMISSIONS` é uma constante, então isto é síncrono, como o
 * `RolesGuard`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const roles = request.authPrincipal?.roles ?? [];
    // Mesma semântica do RolesGuard: qualquer uma das permissões listadas
    // basta. Uma rota que precisa de duas permissões ao mesmo tempo usa dois
    // decorators/guards, não uma lista — OR aqui evita ambiguidade silenciosa
    // entre "qualquer uma" e "todas".
    const temPermissao = required.some((permissao) =>
      roles.some((papel) => ROLE_PERMISSIONS[papel]?.includes(permissao)),
    );
    if (!temPermissao) {
      throw new ForbiddenException("principal does not have a required permission");
    }

    return true;
  }
}
