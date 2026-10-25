import { z } from "zod";

import type { UserAccess } from "./auth.js";
import type { DepartmentId } from "./organization.js";

/**
 * Modelo de acesso de 4 papéis (decisão do André em 25/10/2026), que substitui
 * os papéis por cargo de `auth.ts` e `permissions.ts`:
 *
 * - **Membro** e **Gerente** valem por departamento: o membro opera, o gerente
 *   aprova e gere a equipe do departamento. Diretor é gerente, normalmente de
 *   mais de um departamento.
 * - **Admin** e **Desenvolvedor** são de plataforma e alcançam tudo, inclusive
 *   aprovar. Desenvolvedor é admin mais as telas técnicas (logs, auditoria,
 *   tarefas em segundo plano).
 *
 * O acesso é só por departamento: Plugga e Waze são etiqueta do registro, não
 * fronteira de acesso. Por enquanto este contrato convive com `UserAccess`; as
 * rotas passam a lê-lo uma a uma, e o modelo antigo sai quando nenhuma o usar.
 */

export const papeisDePlataforma = ["admin", "desenvolvedor"] as const;

export const papelDePlataformaSchema = z.enum(papeisDePlataforma);

export type PapelDePlataforma = (typeof papeisDePlataforma)[number];

export const niveisDeDepartamento = ["membro", "gerente"] as const;

export const nivelDeDepartamentoSchema = z.enum(niveisDeDepartamento);

export type NivelDeDepartamento = (typeof niveisDeDepartamento)[number];

/**
 * Os departamentos da barra lateral. Os ids antigos foram mantidos onde já
 * existiam; só os dois comerciais (`comercial-clientes` da Plugga e
 * `comercial-obras` da Waze) viram um `crm`, porque o CRM é um só.
 */
export const departamentos = [
  "crm",
  "energia-opm",
  "produto-tecnologia",
  "financeiro",
  "suprimentos",
  "engenharia-obras",
  "marketing",
] as const;

export const departamentoSchema = z.enum(departamentos);

export type Departamento = (typeof departamentos)[number];

export const acessoADepartamentoSchema = z
  .object({
    departamento: departamentoSchema,
    nivel: nivelDeDepartamentoSchema,
  })
  .strict();

export const acessoSchema = z
  .object({
    /** Admin ou desenvolvedor. Nulo para quem é da equipe de algum departamento. */
    plataforma: papelDePlataformaSchema.nullable(),
    departamentos: z.array(acessoADepartamentoSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    // O alcance da plataforma é regra, não concessão: gravar departamentos para
    // um admin seria um acesso que ninguém vê e que sobraria ao tirar o papel.
    if (value.plataforma !== null && value.departamentos.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departamentos"],
        message: "platform roles reach every department and take no department access",
      });
    }
    const vistos = new Set<string>();
    value.departamentos.forEach((entrada, index) => {
      if (vistos.has(entrada.departamento)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["departamentos", index, "departamento"],
          message: `duplicate department ${entrada.departamento}`,
        });
      }
      vistos.add(entrada.departamento);
    });
  });

export type AcessoADepartamento = z.infer<typeof acessoADepartamentoSchema>;
export type Acesso = z.infer<typeof acessoSchema>;

/** Desenvolvedor alcança tudo o que o admin alcança, e o admin não alcança o desenvolvedor. */
export function alcancaPlataforma(acesso: Acesso, papel: PapelDePlataforma): boolean {
  if (papel === "admin") {
    return acesso.plataforma !== null;
  }
  return acesso.plataforma === "desenvolvedor";
}

/** Admin e desenvolvedor contam como gerente em todo departamento. */
export function nivelNoDepartamento(
  acesso: Acesso,
  departamento: Departamento,
): NivelDeDepartamento | null {
  if (acesso.plataforma !== null) {
    return "gerente";
  }
  return acesso.departamentos.find((entrada) => entrada.departamento === departamento)?.nivel ?? null;
}

export function alcancaDepartamento(
  acesso: Acesso,
  departamento: Departamento,
  nivelMinimo: NivelDeDepartamento = "membro",
): boolean {
  const nivel = nivelNoDepartamento(acesso, departamento);
  if (nivel === null) {
    return false;
  }
  return nivelMinimo === "membro" || nivel === "gerente";
}

export function departamentoUnificado(departmentId: DepartmentId): Departamento {
  if (departmentId === "comercial-clientes" || departmentId === "comercial-obras") {
    return "crm";
  }
  return departmentId;
}

/**
 * Converte o acesso antigo (empresa × departamento × papel por cargo) no novo.
 * É a mesma regra da migration `acesso_por_departamento_conversao`, e as duas
 * precisam continuar iguais enquanto o acesso antigo ainda for gravado:
 *
 * - admin de plataforma continua admin, sem departamentos;
 * - cada departamento liberado vira acesso ao departamento unificado;
 * - é gerente quem era gestor do departamento ou tinha `diretoria` na empresa;
 * - o mesmo departamento nas duas empresas fica com o nível mais alto.
 *
 * Ninguém vira desenvolvedor por conversão: `tech` era cargo de equipe, e
 * promovê-lo daria a ele mais do que o admin. Desenvolvedor é concedido à mão.
 */
export function converterAcessoAntigo(antigo: UserAccess): Acesso {
  if (antigo.platformRoles.includes("admin")) {
    return { plataforma: "admin", departamentos: [] };
  }

  const niveis = new Map<Departamento, NivelDeDepartamento>();
  for (const empresa of antigo.companies) {
    const diretoria = empresa.roles.includes("diretoria");
    for (const entrada of empresa.departments) {
      const departamento = departamentoUnificado(entrada.departmentId);
      const nivel: NivelDeDepartamento = entrada.isManager || diretoria ? "gerente" : "membro";
      if (niveis.get(departamento) !== "gerente") {
        niveis.set(departamento, nivel);
      }
    }
  }

  return {
    plataforma: null,
    departamentos: departamentos.flatMap((departamento) => {
      const nivel = niveis.get(departamento);
      return nivel ? [{ departamento, nivel }] : [];
    }),
  };
}
