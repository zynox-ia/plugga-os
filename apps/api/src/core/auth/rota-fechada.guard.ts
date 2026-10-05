import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";

import { acessoDeclarado } from "./access.decorators";

export type ModoDaRotaFechada = "warn" | "enforce";

/**
 * Rota fechada por padrão (spec 002, US5; contrato inventario-rotas.md).
 * Guard global: toda rota precisa declarar `@Public()`, `@Authenticated()` ou
 * `@Roles(...)` (ou `@Permissions(...)`). Sem declaração:
 *
 * - `ROUTE_GUARD_MODE=enforce` (padrão): nega com 403;
 * - `ROUTE_GUARD_MODE=warn`: registra em log, uma vez por rota, e deixa passar.
 *
 * O modo é lido a cada requisição, então trocar a variável e reiniciar basta
 * para voltar de `enforce` a `warn`, sem nova publicação de código.
 */
@Injectable()
export class RotaFechadaGuard implements CanActivate {
  private readonly logger = new Logger(RotaFechadaGuard.name);
  private readonly jaRegistradas = new Set<string>();

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") {
      return true;
    }
    const handler = context.getHandler();
    const classe = context.getClass();
    const { acesso } = acessoDeclarado(this.reflector, handler as never, classe as never);
    if (acesso !== "undeclared") {
      return true;
    }

    const rota = `${classe.name}.${handler.name}`;
    const modo = this.config.get<ModoDaRotaFechada>("ROUTE_GUARD_MODE", "enforce");
    if (modo === "enforce") {
      throw new ForbiddenException("rota sem declaração de acesso");
    }
    if (!this.jaRegistradas.has(rota)) {
      this.jaRegistradas.add(rota);
      this.logger.warn(`rota sem declaração de acesso (undeclared): ${rota}`);
    }
    return true;
  }
}
