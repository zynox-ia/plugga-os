import { SetMetadata } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import {
  alcancaDepartamento,
  alcancaPlataforma,
  type Acesso,
  type Departamento as DepartamentoId,
  type NivelDeDepartamento,
  type PapelDePlataforma,
} from "@plugga/shared";

/**
 * Declarações de acesso do modelo de 4 papéis (packages/shared/src/acesso.ts).
 * Quem as aplica é o `AcessoGuard`; o inventário de rotas exige que toda rota
 * que as declara passe por ele.
 */
export const DEPARTAMENTO_METADATA = "plugga:departamento";
export const PLATAFORMA_METADATA = "plugga:plataforma";

export interface ExigenciaDeDepartamento {
  departamentos: DepartamentoId[];
  nivel: NivelDeDepartamento;
}

/**
 * Membro (ou gerente, com `nivel: "gerente"`) de ao menos um dos departamentos.
 * Admin e desenvolvedor passam em qualquer um.
 */
export const Departamento = (
  departamentos: DepartamentoId | DepartamentoId[],
  nivel: NivelDeDepartamento = "membro",
): MethodDecorator & ClassDecorator =>
  SetMetadata(DEPARTAMENTO_METADATA, {
    departamentos: Array.isArray(departamentos) ? departamentos : [departamentos],
    nivel,
  } satisfies ExigenciaDeDepartamento);

/** `admin` deixa passar admin e desenvolvedor; `desenvolvedor`, só o desenvolvedor. */
export const Plataforma = (papel: PapelDePlataforma): MethodDecorator & ClassDecorator =>
  SetMetadata(PLATAFORMA_METADATA, papel);

export interface ExigenciaDeAcesso {
  departamento?: ExigenciaDeDepartamento;
  plataforma?: PapelDePlataforma;
}

/** O que a rota exige no modelo novo, olhando o método e depois a classe. */
export function exigenciaDeAcesso(
  reflector: Reflector,
  handler: (...args: never[]) => unknown,
  classe: new (...args: never[]) => unknown,
): ExigenciaDeAcesso {
  const alvos = [handler, classe];
  const departamento = reflector.getAllAndOverride<ExigenciaDeDepartamento | undefined>(
    DEPARTAMENTO_METADATA,
    alvos,
  );
  const plataforma = reflector.getAllAndOverride<PapelDePlataforma | undefined>(PLATAFORMA_METADATA, alvos);
  return {
    ...(departamento && departamento.departamentos.length > 0 ? { departamento } : {}),
    ...(plataforma ? { plataforma } : {}),
  };
}

/**
 * Se o acesso atende a exigência. Sem acesso (principal de serviço, ou montado
 * só com papéis antigos) não atende nada. Com as duas exigências na mesma rota,
 * vale cada uma — a rota é tão fechada quanto a mais estrita.
 */
export function atendeExigencia(acesso: Acesso | undefined, exigencia: ExigenciaDeAcesso): boolean {
  if (!acesso) {
    return false;
  }
  if (exigencia.plataforma && !alcancaPlataforma(acesso, exigencia.plataforma)) {
    return false;
  }
  if (
    exigencia.departamento &&
    !exigencia.departamento.departamentos.some((departamento) =>
      alcancaDepartamento(acesso, departamento, exigencia.departamento?.nivel),
    )
  ) {
    return false;
  }
  return true;
}
