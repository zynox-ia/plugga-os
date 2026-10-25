import { z } from "zod";

import { acessoSchema, departamentoSchema } from "./acesso.js";
import { emailSchema, userStatusSchema } from "./auth.js";

/**
 * Equipe e acessos no modelo de 4 papéis (`acesso.ts`). Substitui os contratos
 * de equipe de `auth.ts` (`teamMemberSchema`, `inviteRequestSchema`…), que
 * falam empresa × departamento × cargo e saem quando a tela migrar.
 *
 * Quem dá cada papel segue a escada:
 * - desenvolvedor dá qualquer papel e vê todo mundo;
 * - admin dá admin, gerente e membro, e não vê nem edita desenvolvedores;
 * - gerente dá só membro, e só nos departamentos que gere;
 * - membro não gere equipe.
 */

/** Os quatro papéis como a tela os mostra: dois de plataforma, dois por departamento. */
export const papeisDaEquipe = ["desenvolvedor", "admin", "gerente", "membro"] as const;

export const papelDaEquipeSchema = z.enum(papeisDaEquipe);

export type PapelDaEquipe = (typeof papeisDaEquipe)[number];

/**
 * Acesso que está sendo **concedido**: sem papel de plataforma e sem
 * departamento a pessoa entraria e não alcançaria nada.
 */
export const acessoConcedidoSchema = acessoSchema.superRefine((value, ctx) => {
  if (value.plataforma === null && value.departamentos.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["departamentos"],
      message: "access must include a platform role or at least one department",
    });
  }
});

export const membroDaEquipeSchema = z
  .object({
    id: z.guid(),
    email: z.string().email(),
    name: z.string(),
    status: userStatusSchema,
    acesso: acessoSchema,
    createdAt: z.string().datetime(),
    /** Se quem pediu a lista pode editar o acesso desta pessoa (a API decide). */
    podeEditar: z.boolean(),
    /** Desativar é de admin e desenvolvedor, nunca de gerente, nunca de si mesmo. */
    podeDesativar: z.boolean(),
    /** Reenviar convite: quem pode editar, enquanto o convite estiver pendente. */
    podeReenviarConvite: z.boolean(),
  })
  .strict();

/**
 * O alcance de quem pede, para o formulário desenhar só o que a API aceita:
 * que papéis pode dar e em quais departamentos.
 */
export const escopoDaEquipeSchema = z
  .object({
    /** O papel de quem pede, no degrau mais alto que tem. */
    papel: papelDaEquipeSchema,
    podeConvidar: z.boolean(),
    papeisConcediveis: z.array(papelDaEquipeSchema),
    departamentos: z.array(departamentoSchema),
  })
  .strict();

export const listaDaEquipeSchema = z
  .object({
    membros: z.array(membroDaEquipeSchema),
    escopo: escopoDaEquipeSchema,
  })
  .strict();

export const consultaDaEquipeSchema = z
  .object({
    departamento: departamentoSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .strict();

export const conviteDaEquipeSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().min(1).max(150),
    acesso: acessoConcedidoSchema,
  })
  .strict();

export const edicaoDeAcessoSchema = z
  .object({
    acesso: acessoConcedidoSchema,
  })
  .strict();

export type MembroDaEquipe = z.infer<typeof membroDaEquipeSchema>;
export type EscopoDaEquipe = z.infer<typeof escopoDaEquipeSchema>;
export type ListaDaEquipe = z.infer<typeof listaDaEquipeSchema>;
export type ConsultaDaEquipe = z.infer<typeof consultaDaEquipeSchema>;
export type ConviteDaEquipe = z.infer<typeof conviteDaEquipeSchema>;
export type EdicaoDeAcesso = z.infer<typeof edicaoDeAcessoSchema>;
