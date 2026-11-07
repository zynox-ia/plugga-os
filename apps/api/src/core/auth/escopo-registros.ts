import { alcancaTela, telasPorDepartamento, type Departamento, type Tela } from "@plugga/shared";

import { AcessoNegado } from "../../common/errors/dominio";
import type { AuthPrincipal } from "./auth.types";

/** Gestão e atribuição são independentes da visualização do conteúdo da tela. */
export function gerenciaRegistros(principal: AuthPrincipal, departamentos: Departamento | readonly Departamento[], telas?: readonly Tela[]): boolean {
  const alvos = typeof departamentos === "string" ? [departamentos] : departamentos;
  if (principal.acesso.plataforma !== null) return true;
  return principal.acesso.departamentos.some((entrada) => entrada.nivel === "gerente" && alvos.includes(entrada.departamento)
    && (entrada.telas ?? telasPorDepartamento[entrada.departamento]).some((tela) => !telas || telas.includes(tela)));
}

export function exigeAcessoATela(principal: AuthPrincipal, ...telas: readonly Tela[]): void {
  if (!telas.some((tela) => alcancaTela(principal.acesso, tela))) throw new AcessoNegado("Você não tem acesso a esta tela.");
}

export function exigeAtribuicaoPermitida(
  principal: AuthPrincipal,
  ownerId: string | null | undefined,
  departamentos: Departamento | readonly Departamento[],
  telas?: readonly Tela[],
): void {
  if (!gerenciaRegistros(principal, departamentos, telas) && ownerId !== principal.id) {
    throw new AcessoNegado("Somente a gestão pode atribuir registros a outra pessoa.");
  }
}
