import { Inject, Injectable, NotFoundException, type CanActivate } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Portão da Engenharia e Obras (PLU-345) até o André liberar o módulo, igual ao
 * do Financeiro. A regra é `engenhariaLigada`, em config/environment.ts: liga em
 * `development` e `test` (pelo NODE_ENV cru) ou com `ENGENHARIA_HABILITADO=true`;
 * na dúvida, desligado. Sai num commit próprio quando o módulo for liberado.
 */
@Injectable()
export class EngenhariaHabilitadaGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  /** Desligado, as rotas respondem 404, como se não existissem, antes até da sessão. */
  canActivate(): boolean {
    if (this.config.get<boolean>("ENGENHARIA_LIGADA") !== true) throw new NotFoundException();
    return true;
  }
}
