import { Inject, Injectable, NotFoundException, type CanActivate } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Portão do Financeiro enquanto o módulo não está completo (decisão do
 * Coordenador em 23/11/2026). A regra é `financeiroLigado`, em
 * config/environment.ts: liga em `development` e `test` (pelo NODE_ENV cru, sem
 * o padrão do schema) ou com `FINANCEIRO_HABILITADO=true`; na dúvida, desligado.
 * Os jobs do Financeiro e do OMIE usam o mesmo `FINANCEIRO_LIGADO`. Sai num
 * commit próprio quando o módulo estiver completo.
 */
@Injectable()
export class FinanceiroHabilitadoGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  /** Desligado, as rotas respondem 404, como se não existissem, antes até da sessão. */
  canActivate(): boolean {
    if (this.config.get<boolean>("FINANCEIRO_LIGADO") !== true) throw new NotFoundException();
    return true;
  }
}
