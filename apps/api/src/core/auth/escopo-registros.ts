import { telasPorDepartamento, type Departamento, type Tela } from "@plugga/shared";

import { AcessoNegado, NaoEncontrado } from "../../common/errors/dominio";
import type { AuthPrincipal } from "./auth.types";

/** Papéis de gestão mantêm o alcance do departamento; membro opera só o próprio registro. */
export function gerenciaRegistros(principal: AuthPrincipal, departamentos: Departamento | readonly Departamento[], telas?: readonly Tela[]): boolean {
  const alvos = typeof departamentos === "string" ? [departamentos] : departamentos;
  if (principal.acesso.plataforma !== null) return true;
  return principal.acesso.departamentos.some((entrada) => entrada.nivel === "gerente" && alvos.includes(entrada.departamento)
    && (entrada.telas ?? telasPorDepartamento[entrada.departamento]).some((tela) => !telas || telas.includes(tela)));
}

export function filtroDoResponsavel(
  principal: AuthPrincipal,
  departamentos: Departamento | readonly Departamento[],
  telas?: readonly Tela[],
): { ownerId?: string } {
  return gerenciaRegistros(principal, departamentos, telas) ? {} : { ownerId: principal.id };
}

export function exigeRegistroVisivel(
  principal: AuthPrincipal,
  ownerId: string | null | undefined,
  departamentos: Departamento | readonly Departamento[],
  mensagem: string,
  telas?: readonly Tela[],
): void {
  if (!gerenciaRegistros(principal, departamentos, telas) && ownerId !== principal.id) {
    throw new NaoEncontrado(mensagem);
  }
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
