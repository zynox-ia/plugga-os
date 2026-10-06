import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AuthenticatedRequest } from "./auth.types";
import { SESSION_COOKIE_NAME } from "./token.util";

/** Métodos que não mudam estado: não são vetor de CSRF e não exigem Origin. */
const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defense in depth for mutating routes (alongside SameSite=Lax).
 *
 * - Com cabeçalho Origin: ele precisa estar no conjunto permitido.
 * - SEM Origin: só passa se a requisição NÃO estiver autenticada por cookie de
 *   sessão. Uma mutação que carrega o cookie e não diz de onde vem não é o
 *   navegador do nosso app (todo `fetch` POST/PUT/PATCH/DELETE do browser manda
 *   Origin); é, no melhor caso, um cliente fora do fluxo e, no pior, um ataque
 *   que apagou o cabeçalho. O fluxo servidor-a-servidor sem cookie (curl com
 *   cabeçalho de dev, login inicial) continua livre (US11, T119, SEC).
 * - O app web repassa o Origin do navegador à API (`apps/web/app/lib/*-proxy.ts`).
 *
 * With no explicit allowlist, only localhost origins are accepted (dev);
 * production must set AUTH_ALLOWED_ORIGINS.
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
      if (this.ehMutacao(request) && this.temCookieDeSessao(request)) {
        throw new ForbiddenException("origin required");
      }
      return true;
    }

    if (this.isAllowed(origin)) {
      return true;
    }

    throw new ForbiddenException("origin not allowed");
  }

  private ehMutacao(request: AuthenticatedRequest): boolean {
    const metodo = (request.method ?? "GET").toUpperCase();
    return !METODOS_SEGUROS.has(metodo);
  }

  private temCookieDeSessao(request: AuthenticatedRequest): boolean {
    return Boolean(
      request.signedCookies?.[SESSION_COOKIE_NAME] || request.cookies?.[SESSION_COOKIE_NAME],
    );
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
