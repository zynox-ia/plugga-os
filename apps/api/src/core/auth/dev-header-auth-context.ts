import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { roleKeySchema, type RoleKey } from "@plugga/shared";

import { AuthContext, type AuthenticatedRequest, type AuthPrincipal } from "./auth.types";

@Injectable()
export class DevHeaderAuthContext extends AuthContext {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    super();
  }

  async resolve(request: AuthenticatedRequest): Promise<AuthPrincipal | null> {
    if (!this.config.get<boolean>("DEV_AUTH_ENABLED", false)) {
      return null;
    }

    const id = this.firstHeader(request.headers["x-dev-principal"]);
    if (!id) {
      return null;
    }

    const roles = this.parseRoles(this.firstHeader(request.headers["x-dev-roles"]));

    return {
      id,
      kind: id.startsWith("service:") ? "service" : "user",
      roles,
    };
  }

  private parseRoles(header: string | undefined): RoleKey[] {
    if (!header) {
      return [];
    }

    return header
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .flatMap((role) => {
        const parsed = roleKeySchema.safeParse(role);
        return parsed.success ? [parsed.data] : [];
      });
  }

  private firstHeader(header: string | string[] | undefined): string | undefined {
    const value = Array.isArray(header) ? header[0] : header;
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }
}
