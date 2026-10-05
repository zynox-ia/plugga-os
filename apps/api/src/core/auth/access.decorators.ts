import { SetMetadata } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import { PERMISSIONS_METADATA } from "./permissions.decorator";
import { ROLES_METADATA } from "./roles.decorator";

/**
 * Declaração explícita de acesso (spec 002, US5, contrato inventario-rotas.md).
 * Toda rota declara exatamente um destes: `@Public()`, `@Authenticated()` ou
 * `@Roles(...)`. Rota sem declaração é "undeclared": registrada em log no modo
 * `warn` e negada no modo `enforce` (ver rota-fechada.guard.ts).
 */
export const PUBLIC_METADATA = "plugga:public";
export const AUTHENTICATED_METADATA = "plugga:authenticated";

/** Aberta a qualquer pessoa. A lista de rotas públicas é aprovada pelo dono. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_METADATA, true);

/** Qualquer usuário logado, declarado de propósito (sem papel específico). */
export const Authenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_METADATA, true);

export type AcessoDeclarado = "public" | "authenticated" | "roles" | "permissions" | "undeclared";

/**
 * Como a rota declara o acesso, olhando o método e depois a classe. `@Roles`
 * vale mesmo vazio de efeito? Não: lista vazia não declara nada. `permissions`
 * (de `@Permissions(...)`) é uma declaração do mesmo tipo que `roles` e fica
 * separada só para o inventário mostrar de onde veio.
 */
export function acessoDeclarado(
  reflector: Reflector,
  handler: (...args: never[]) => unknown,
  classe: new (...args: never[]) => unknown,
): { acesso: AcessoDeclarado; papeis: string[] } {
  const alvos = [handler, classe];
  const papeis = reflector.getAllAndOverride<string[] | undefined>(ROLES_METADATA, alvos) ?? [];
  if (reflector.getAllAndOverride<boolean | undefined>(PUBLIC_METADATA, alvos)) {
    return { acesso: "public", papeis: [] };
  }
  if (papeis.length > 0) {
    return { acesso: "roles", papeis: [...papeis] };
  }
  const permissoes = reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA, alvos) ?? [];
  if (permissoes.length > 0) {
    return { acesso: "permissions", papeis: [] };
  }
  if (reflector.getAllAndOverride<boolean | undefined>(AUTHENTICATED_METADATA, alvos)) {
    return { acesso: "authenticated", papeis: [] };
  }
  return { acesso: "undeclared", papeis: [] };
}
