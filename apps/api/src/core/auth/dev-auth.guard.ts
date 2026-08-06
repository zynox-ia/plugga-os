import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import { AuthContext, type AuthenticatedRequest } from "./auth.types";

@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(@Inject(AuthContext) private readonly authContext: AuthContext) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = this.authContext.resolve(request);

    if (!principal) {
      throw new UnauthorizedException("authenticated development principal required");
    }

    request.authPrincipal = principal;
    return true;
  }
}
