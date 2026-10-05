import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { DiscoveryService, Reflector } from "@nestjs/core";

import { acessoDeclarado, type AcessoDeclarado } from "./access.decorators";

export interface RotaDoInventario {
  metodo: string;
  caminho: string;
  controller: string;
  acesso: AcessoDeclarado;
  papeis: string[];
  guards: string[];
}

function juntaCaminho(...partes: string[]): string {
  const caminho = partes
    .flatMap((p) => p.split("/"))
    .filter((p) => p.length > 0)
    .join("/");
  return `/${caminho}`;
}

function nomesDosGuards(alvo: object): string[] {
  const guards = (Reflect.getMetadata(GUARDS_METADATA, alvo) ?? []) as Array<{ name?: string } | object>;
  return guards.map((g) => (typeof g === "function" ? g.name : (g.constructor?.name ?? "?")) ?? "?");
}

/**
 * Lista toda rota HTTP da aplicação: método, caminho, `Controller.handler`,
 * como declara o acesso e os guards (da classe, depois do método). Ordenada,
 * para o arquivo versionado só mudar quando uma rota muda.
 */
export function listarRotas(descoberta: DiscoveryService, reflector: Reflector): RotaDoInventario[] {
  const rotas: RotaDoInventario[] = [];

  for (const wrapper of descoberta.getControllers()) {
    const classe = wrapper.metatype as (new (...args: never[]) => unknown) | null;
    if (!classe) continue;
    const prefixo = (Reflect.getMetadata(PATH_METADATA, classe) as string | string[] | undefined) ?? "";
    const prefixoTexto = Array.isArray(prefixo) ? (prefixo[0] ?? "") : prefixo;

    const prototipo = classe.prototype as Record<string, unknown>;
    for (const nome of Object.getOwnPropertyNames(prototipo)) {
      if (nome === "constructor") continue;
      const handler = prototipo[nome];
      if (typeof handler !== "function") continue;
      const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      if (metodo === undefined) continue;
      const caminhoDoMetodo = (Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined) ?? "";
      const caminhoTexto = Array.isArray(caminhoDoMetodo) ? (caminhoDoMetodo[0] ?? "") : caminhoDoMetodo;

      const { acesso, papeis } = acessoDeclarado(reflector, handler as (...args: never[]) => unknown, classe);
      rotas.push({
        metodo: RequestMethod[metodo] ?? String(metodo),
        caminho: juntaCaminho(prefixoTexto, caminhoTexto),
        controller: `${classe.name}.${nome}`,
        acesso,
        papeis,
        guards: [...nomesDosGuards(classe), ...nomesDosGuards(handler as object)],
      });
    }
  }

  return rotas.sort(
    (a, b) =>
      a.caminho.localeCompare(b.caminho) ||
      a.metodo.localeCompare(b.metodo) ||
      a.controller.localeCompare(b.controller),
  );
}
