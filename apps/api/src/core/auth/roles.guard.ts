import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleKey } from "@plugga/shared";

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
