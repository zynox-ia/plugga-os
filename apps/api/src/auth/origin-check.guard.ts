import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AuthenticatedRequest } from "../core/auth/auth.types";

/**
 * CSRF defense in depth for mutating auth routes (alongside SameSite=Lax).
 * When a browser Origin header is present it must match the allowed set; a
 * missing Origin (server-to-server / documented curl flow) is not a CSRF
 * vector and is allowed. With no explicit allowlist, only localhost origins are
 * accepted (dev); production must set AUTH_ALLOWED_ORIGINS.
 */
@Injectable()
export class OriginCheckGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const configured = config.get<string>("AUTH_ALLOWED_ORIGINS");
    this.allowedOrigins = new Set(
      (configured ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const originHeader = request.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

    if (!origin) {
      return true;
    }

    if (this.isAllowed(origin)) {
      return true;
    }

    throw new ForbiddenException("origin not allowed");
  }

  private isAllowed(origin: string): boolean {
    if (this.allowedOrigins.size > 0) {
      return this.allowedOrigins.has(origin);
    }

    try {
      const hostname = new URL(origin).hostname;
      return hostname === "localhost" || hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }
}
