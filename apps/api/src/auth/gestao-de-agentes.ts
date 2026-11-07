import { telasPorDepartamento, type AcessoADepartamento, type CriacaoDeAgente, type Tela } from "@plugga/shared";

import { AcessoNegado, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import type { AuthUserRecord } from "./auth.repository";

function gerencia(principal: AuthPrincipal, ator: AuthUserRecord | null): AcessoADepartamento[] | null {
  if (principal.kind !== "user" || !ator || ator.id !== principal.id || ator.status !== "active" || ator.tipo === "agente_ia") {
    throw new AcessoNegado("A gestão exige uma pessoa ativa.");
  }
  if (ator.acesso.plataforma !== null) return null;
  const departamentos = ator.acesso.departamentos.filter((d) => d.nivel === "gerente");
  if (departamentos.length === 0) throw new AcessoNegado("Esta pessoa não gere a equipe.");
  return departamentos;
}

function exigeConcessao(gerencias: AcessoADepartamento[] | null, acesso: AcessoADepartamento, esconderAlvo = false): void {
  if (gerencias === null) return;
  const gerente = gerencias.find((d) => d.departamento === acesso.departamento);
  if (!gerente && esconderAlvo) throw new NaoEncontrado("Agente não encontrado.");
  const concediveis: readonly Tela[] = gerente ? gerente.telas ?? telasPorDepartamento[gerente.departamento] : [];
  if (!gerente || !(acesso.telas ?? telasPorDepartamento[acesso.departamento]).every((tela) =>
    concediveis.includes(tela))) {
    throw new AcessoNegado("O departamento ou tela está fora do alcance da gestão.");
  }
}

export function exigeCriacaoDeAgente(principal: AuthPrincipal, ator: AuthUserRecord | null, input: CriacaoDeAgente): void {
  exigeConcessao(gerencia(principal, ator), { departamento: input.departamento, nivel: "membro", telas: input.telas });
}

export function exigeGestaoDeAgente(principal: AuthPrincipal, ator: AuthUserRecord | null, alvo: AuthUserRecord | null): void {
  const gerencias = gerencia(principal, ator);
  if (!alvo || alvo.tipo !== "agente_ia" || alvo.status === "removed") throw new NaoEncontrado("Agente não encontrado.");
  const departamento = alvo.acesso.departamentos[0];
  if (alvo.id === principal.id || alvo.acesso.plataforma !== null || alvo.acesso.departamentos.length !== 1 || departamento?.nivel !== "membro") {
    throw new AcessoNegado("O alvo precisa ser outro membro de IA de um único departamento.");
  }
  exigeConcessao(gerencias, departamento, true);
}
