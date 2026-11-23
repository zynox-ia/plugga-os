import { Inject, Injectable, NotFoundException, type CanActivate } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Portão do Financeiro enquanto o módulo não está completo (decisão do
 * Coordenador em 23/11/2026), com a mesma regra da web (`lib/recursos.ts`):
 * liga em `development` e `test`, ou com `FINANCEIRO_HABILITADO=true`. Fechado na
 * dúvida: sem `NODE_ENV`, ou com outro valor, fica desligado. Os jobs do
 * Financeiro e do OMIE usam a mesma regra. Sai num commit próprio quando o
 * módulo estiver completo.
 */
export function financeiroHabilitado(ambiente: { NODE_ENV?: string; FINANCEIRO_HABILITADO?: boolean }): boolean {
  return ambiente.NODE_ENV === "development" || ambiente.NODE_ENV === "test" || ambiente.FINANCEIRO_HABILITADO === true;
}

/** Desligado, as rotas respondem 404, como se não existissem, antes até da sessão. */
@Injectable()
export class FinanceiroHabilitadoGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  canActivate(): boolean {
    const habilitado = financeiroHabilitado({
      NODE_ENV: this.config.get<string>("NODE_ENV"),
      FINANCEIRO_HABILITADO: this.config.get<boolean>("FINANCEIRO_HABILITADO"),
    });
    if (!habilitado) throw new NotFoundException();
    return true;
  }
}
