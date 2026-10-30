import { SetMetadata } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import { exigenciaDeAcesso } from "./acesso.decorator";

/**
 * Declaração explícita de acesso (inventário em apps/api/test/fixtures/inventario-rotas.json).
 * Toda rota declara exatamente um destes: `@Public()`, `@Authenticated()`,
 * `@Departamento(...)` ou `@Plataforma(...)`. Rota sem declaração é "undeclared": registrada em log no modo
 * `warn` e negada no modo `enforce` (ver rota-fechada.guard.ts).
 */
export const PUBLIC_METADATA = "plugga:public";
export const AUTHENTICATED_METADATA = "plugga:authenticated";

/** Aberta a qualquer pessoa. A lista de rotas públicas é aprovada pelo dono. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_METADATA, true);

/** Qualquer usuário logado, declarado de propósito (sem papel específico). */
export const Authenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_METADATA, true);

export type AcessoDeclarado = "public" | "authenticated" | "acesso" | "undeclared";

/**
 * Como a rota declara o acesso, olhando o método e depois a classe. Para
 * `acesso`, `papeis` descreve a exigência (`plataforma:admin`,
 * `departamento:crm:membro`), para o inventário mostrar a regra.
 */
export function acessoDeclarado(
  reflector: Reflector,
  handler: (...args: never[]) => unknown,
  classe: new (...args: never[]) => unknown,
): { acesso: AcessoDeclarado; papeis: string[] } {
  const alvos = [handler, classe];
  if (reflector.getAllAndOverride<boolean | undefined>(PUBLIC_METADATA, alvos)) {
    return { acesso: "public", papeis: [] };
  }
  const exigencia = exigenciaDeAcesso(reflector, handler, classe);
  if (exigencia.plataforma || exigencia.departamento || exigencia.telas) {
    return {
      acesso: "acesso",
      papeis: [
        ...(exigencia.telas?.map((tela) => `tela:${tela}`) ?? []),
        ...(exigencia.plataforma ? [`plataforma:${exigencia.plataforma}`] : []),
        ...(exigencia.departamento?.departamentos.map(
          (departamento) => `departamento:${departamento}:${exigencia.departamento?.nivel}`,
        ) ?? []),
      ],
    };
  }
  if (reflector.getAllAndOverride<boolean | undefined>(AUTHENTICATED_METADATA, alvos)) {
    return { acesso: "authenticated", papeis: [] };
  }
  return { acesso: "undeclared", papeis: [] };
}
