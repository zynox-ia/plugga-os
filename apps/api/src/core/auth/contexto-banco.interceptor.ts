import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";

import { contextoBanco } from "../../prisma/contexto-banco";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class ContextoBancoInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionHash = request.authPrincipal?.kind === "user" ? request.databaseSessionHash : undefined;
    const agentHash = request.authPrincipal?.kind === "service" ? request.databaseAgentHash : undefined;
    // O handler é lazy: criar E assinar o Observable dentro do ALS preserva o contexto assíncrono.
    return new Observable((subscriber) => contextoBanco.run({ sessionHash, agentHash }, () =>
      next.handle().subscribe(subscriber),
    ));
  }
}
