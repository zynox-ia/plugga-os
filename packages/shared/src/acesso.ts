import { z } from "zod";


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
 * fronteira de acesso.
 */

export const papeisDePlataforma = ["admin", "desenvolvedor"] as const;

export const papelDePlataformaSchema = z.enum(papeisDePlataforma);

export type PapelDePlataforma = (typeof papeisDePlataforma)[number];

export const niveisDeDepartamento = ["membro", "gerente"] as const;

export const nivelDeDepartamentoSchema = z.enum(niveisDeDepartamento);

export type NivelDeDepartamento = (typeof niveisDeDepartamento)[number];

/**
 * Os departamentos da barra lateral. O CRM é um só para as duas empresas.
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
