import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import { AuthContext, type AuthenticatedRequest } from "./auth.types";

@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(@Inject(AuthContext) private readonly authContext: AuthContext) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = await this.authContext.resolve(request);

    if (!principal) {
      throw new UnauthorizedException("authentication required");
    }

    request.authPrincipal = principal;
    return true;
  }
}
