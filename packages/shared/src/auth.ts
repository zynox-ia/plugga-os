import { z } from "zod";

import {
  companyKeys,
  companyKeySchema,
  departmentIdsByCompany,
  departmentIdSchema,
  isDepartmentOfCompany,
  type CompanyKey,
  type DepartmentId,
} from "./organization.js";

export const roleKeys = [
  "admin",
  "diretoria",
  "comercial",
  "pluggamob",
  "financeiro",
  "compras",
  "opm",
  "tech",
  "viewer",
  "projetista",
  "engenheiro",
  "supervisor",
  "tecnico",
  "almoxarife",
  "seguranca",
  "gestor_suprimentos",
  "comprador",
] as const;

export const roleKeySchema = z.enum(roleKeys);

export type RoleKey = z.infer<typeof roleKeySchema>;

/**
 * `admin` administra a plataforma inteira e por isso não cabe dentro de uma
 * empresa: quem pode conceder acesso à Waze não pode ser alguém cujo próprio
 * poder foi concedido dentro da Plugga. Os demais papéis passam a ser sempre
 * lidos no contexto de uma empresa — a mesma pessoa pode ser `financeiro` na
 * Plugga e `viewer` na Waze.
 */
export const platformRoleKeys = ["admin"] as const;

export const platformRoleKeySchema = z.enum(platformRoleKeys);

export type PlatformRoleKey = (typeof platformRoleKeys)[number];

/**
 * `compras` é o Responsável de Compras do POP-COMP-001 §1, separado de
 * `financeiro` (a Gestão Financeira do mesmo POP) porque o processo de compras
 * exige que quem seleciona a cotação não seja quem aprova a compra. Enquanto os
 * dois eram o mesmo papel, a separação que o POP descreve em três linhas não
 * existia no código. A ADR-0004 previu este refino como gatilho de revisão.
 *
 * `projetista`/`engenheiro`/`supervisor`/`tecnico`/`almoxarife`/`seguranca` são
 * os papéis de obra (edição de projeto, aprovação técnica, atualização de
 * campo, checklist/foto, controle de material, EPI/APR/incidente).
 * `gestor_suprimentos`/`comprador` cobrem cotação e alçada de compra dentro do
 * fluxo de Suprimentos; os demais cargos desse bloco (almoxarife central,
 * contas a pagar, controladoria de obras) ficam por ora dentro de
 * `almoxarife`/`financeiro`/`compras` — não viraram papel próprio até haver
 * necessidade real de os distinguir.
 */
export const companyRoleKeys = [
  "diretoria",
  "comercial",
  "pluggamob",
  "financeiro",
  "compras",
  "opm",
  "tech",
  "viewer",
  "projetista",
  "engenheiro",
  "supervisor",
  "tecnico",
  "almoxarife",
  "seguranca",
  "gestor_suprimentos",
  "comprador",
] as const;

export const companyRoleKeySchema = z.enum(companyRoleKeys);

export type CompanyRoleKey = (typeof companyRoleKeys)[number];

// Falha o build se um papel novo entrar em roleKeys sem ser classificado como
// de plataforma ou de empresa — a classificação é o que decide quem concede.
type _EveryRoleIsClassified = PlatformRoleKey | CompanyRoleKey extends RoleKey
  ? RoleKey extends PlatformRoleKey | CompanyRoleKey
    ? true
    : never
  : never;
const _everyRoleIsClassified: _EveryRoleIsClassified = true;
void _everyRoleIsClassified;

export const userStatuses = ["invited", "active", "disabled"] as const;

export const userStatusSchema = z.enum(userStatuses);

export type UserStatus = (typeof userStatuses)[number];

// Self-hosted auth contracts (ADR-0008). Framework-free: DTO shapes and types
// only. Credentials and tokens never appear in these schemas' outputs.

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * Mesma normalização que todo contrato de auth já aplica (trim + minúsculas).
 * Existe como função porque o login Google normaliza um e-mail que vem de fora
 * do schema — das claims do ID token — e comparar com `users.email` só é
 * correto se as duas pontas passarem pela MESMA regra.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Password policy for the internal OS: long enough to resist offline guessing,
// bounded to keep Argon2id input sane.
export const passwordSchema = z.string().min(12).max(200);

const opaqueTokenSchema = z.string().trim().min(16).max(512);

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(200),
  })
  .strict();

// Acesso: o que a pessoa alcança, por empresa. Mesmo formato na entrada
// (convite/edição) e na saída (/auth/me, lista da equipe) de propósito — duas
// formas do mesmo conceito divergiriam na primeira mudança de regra.

export const departmentAccessSchema = z
  .object({
    departmentId: departmentIdSchema,
    /** Gestor do departamento: pode convidar e editar acesso dentro dele. */
    isManager: z.boolean(),
  })
  .strict();

export const companyAccessSchema = z
  .object({
    companyId: companyKeySchema,
    roles: z.array(companyRoleKeySchema),
    /** Vazio é estado válido: enxerga a empresa, nenhum departamento nela. */
    departments: z.array(departmentAccessSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const vistos = new Set<string>();
    value.departments.forEach((department, index) => {
      if (!isDepartmentOfCompany(value.companyId, department.departmentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["departments", index, "departmentId"],
          message: `department ${department.departmentId} does not belong to company ${value.companyId}`,
        });
      }
      if (vistos.has(department.departmentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["departments", index, "departmentId"],
          message: `duplicate department ${department.departmentId}`,
        });
      }
      vistos.add(department.departmentId);
    });
  });

export const userAccessSchema = z
  .object({
    platformRoles: z.array(platformRoleKeySchema),
    companies: z.array(companyAccessSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const vistos = new Set<string>();
    value.companies.forEach((company, index) => {
      if (vistos.has(company.companyId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companies", index, "companyId"],
          message: `duplicate company ${company.companyId}`,
        });
      }
      vistos.add(company.companyId);
    });
  });

/**
 * Acesso que está sendo **concedido**. Sem papel de plataforma e sem empresa a
 * pessoa entra e não alcança nada: é convite para uma conta inútil, não um
 * estado a criar de propósito. A leitura (`userAccessSchema`) continua aceitando
 * o vazio — quem já perdeu todo o acesso precisa aparecer na lista da equipe
 * para alguém devolver, e não desaparecer do sistema.
 */
export const grantedAccessSchema = userAccessSchema.superRefine((value, ctx) => {
  if (value.platformRoles.length === 0 && value.companies.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["companies"],
      message: "access must include at least one platform role or one company",
    });
  }

  // Empresa sem papel nenhum não diz o que a pessoa é lá dentro; `viewer` é a
  // escolha honesta e quem convida precisa fazê-la explicitamente.
  value.companies.forEach((company, index) => {
    if (company.roles.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companies", index, "roles"],
        message: `company ${company.companyId} must have at least one role`,
      });
    }
  });
});

export const inviteRequestSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().min(1).max(150),
    access: grantedAccessSchema,
  })
  .strict();

export const acceptInviteRequestSchema = z
  .object({
    token: opaqueTokenSchema,
    password: passwordSchema,
  })
  .strict();

export const resetRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetConfirmRequestSchema = z
  .object({
    token: opaqueTokenSchema,
    password: passwordSchema,
  })
  .strict();

export const assignAccessRequestSchema = z
  .object({
    access: grantedAccessSchema,
  })
  .strict();

// --- Login federado (Google Identity Services) ---

/** Provedores federados aceitos. `provider` é coluna, então é enum, não string. */
export const identityProviders = ["google"] as const;

export const identityProviderSchema = z.enum(identityProviders);

export type IdentityProvider = (typeof identityProviders)[number];

/**
 * Corpo `application/x-www-form-urlencoded` que o botão GIS em modo redirect
 * envia para o callback. Deliberadamente NÃO é `.strict()`: o Google acrescenta
 * campos próprios (`select_by`, e `state` quando existe) e recusar o POST
 * inteiro por causa de um campo novo do provedor derrubaria o login sem que
 * nada nosso tivesse mudado. Os limites de tamanho vêm antes de qualquer
 * verificação criptográfica — um corpo gigante não pode custar um JWKS.
 */
export const googleCallbackSchema = z.object({
  credential: z.string().trim().min(1).max(8_192),
  g_csrf_token: z.string().trim().min(1).max(256),
});

export type GoogleCallback = z.infer<typeof googleCallbackSchema>;

/**
 * Único vocabulário de erro que pode chegar ao browser (e à URL de `/login`).
 * Toda recusa interna — token inválido, e-mail desconhecido, conta desativada,
 * `sub` já vinculado a outra pessoa, e-mail Google não autoritativo — colapsa em
 * `unauthorized`: distinguir esses casos para quem está de fora é exatamente o
 * oráculo de existência de conta que o login por senha já evita.
 */
export const googleLoginErrorCodes = [
  "unauthorized",
  "rate_limited",
  "unavailable",
  "disabled",
] as const;

export const googleLoginErrorCodeSchema = z.enum(googleLoginErrorCodes);

export type GoogleLoginErrorCode = (typeof googleLoginErrorCodes)[number];

export function googleLoginErrorMessage(code: GoogleLoginErrorCode): string {
  switch (code) {
    case "rate_limited":
      return "Muitas tentativas. Aguarde um minuto e tente novamente.";
    case "unavailable":
      return "O login Google está temporariamente indisponível. Use e-mail e senha ou tente novamente.";
    case "disabled":
      return "O login com o Google não está disponível no momento. Use e-mail e senha.";
    case "unauthorized":
    default:
      return "Não foi possível entrar com esta conta Google.";
  }
}

/** Converte um código desconhecido vindo da URL no genérico, sem quebrar a tela. */
export function parseGoogleLoginErrorCode(value: string | undefined): GoogleLoginErrorCode | null {
  if (!value) return null;
  const parsed = googleLoginErrorCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : "unauthorized";
}

export const sessionUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    status: userStatusSchema,
    /**
     * União achatada dos papéis de plataforma com os de todas as empresas.
     * Mantida porque `RolesGuard` e as telas que filtram por papel já leem daqui;
     * quem precisa saber *em qual empresa* o papel vale lê `access`.
     */
    roles: z.array(roleKeySchema),
    access: userAccessSchema,
  })
  .strict();

export const meResponseSchema = sessionUserSchema;

export const teamMemberSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    status: userStatusSchema,
    roles: z.array(roleKeySchema),
    access: userAccessSchema,
    createdAt: z.string().datetime(),
    /**
     * Se *quem pediu a lista* pode editar o acesso desta pessoa. Vem do servidor
     * porque só ele conhece a regra inteira; a tela usa para não desenhar um
     * botão que a API vai recusar com 403.
     */
    canManage: z.boolean(),
    /** Desativar é sempre da plataforma, nunca do gestor de departamento. */
    canDeactivate: z.boolean(),
  })
  .strict();

/**
 * O alcance de quem está pedindo: que empresas, departamentos e papéis ele pode
 * conceder. É o que o formulário de convite desenha — sem isso a tela teria de
 * reimplementar a regra de escopo do servidor e as duas divergiriam.
 */
export const teamScopeSchema = z
  .object({
    isPlatformAdmin: z.boolean(),
    canInvite: z.boolean(),
    companies: z.array(
      z
        .object({
          companyId: companyKeySchema,
          departmentIds: z.array(departmentIdSchema),
          roles: z.array(companyRoleKeySchema),
          canGrantManager: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export const teamListResponseSchema = z
  .object({
    members: z.array(teamMemberSchema),
    scope: teamScopeSchema,
  })
  .strict();

export const teamListQuerySchema = z
  .object({
    companyId: companyKeySchema.optional(),
    departmentId: departmentIdSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .strict();

// Generic, non-enumerating acknowledgement for flows that must not reveal
// whether an account exists (login failure, reset request).
export const authAcknowledgementSchema = z
  .object({
    ok: z.boolean(),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type InviteRequest = z.infer<typeof inviteRequestSchema>;
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;
export type ResetRequest = z.infer<typeof resetRequestSchema>;
export type ResetConfirmRequest = z.infer<typeof resetConfirmRequestSchema>;
export type AssignAccessRequest = z.infer<typeof assignAccessRequestSchema>;
export type DepartmentAccess = z.infer<typeof departmentAccessSchema>;
export type CompanyAccess = z.infer<typeof companyAccessSchema>;
export type UserAccess = z.infer<typeof userAccessSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type TeamScope = z.infer<typeof teamScopeSchema>;
export type TeamListResponse = z.infer<typeof teamListResponseSchema>;
export type TeamListQuery = z.infer<typeof teamListQuerySchema>;
export type AuthAcknowledgement = z.infer<typeof authAcknowledgementSchema>;

/**
 * Achata o acesso na lista de papéis que `RolesGuard` e as telas já consomem.
 * Um papel concedido em qualquer empresa passa a valer no guard — a
 * granularidade por empresa nas rotas de domínio ainda não existe (as entidades
 * de domínio não têm `companyId`), e fingir que existe seria pior do que dizer
 * onde ela para. O que já é por empresa é a *navegação*, que lê `access`.
 */
export function flattenRoles(access: UserAccess): RoleKey[] {
  const concedidos = new Set<string>([
    ...access.platformRoles,
    ...access.companies.flatMap((company) => company.roles),
  ]);
  return roleKeys.filter((role) => concedidos.has(role));
}

export function isPlatformAdmin(access: UserAccess): boolean {
  return access.platformRoles.includes("admin");
}

/**
 * Empresas que a pessoa enxerga. `access` guarda sempre o que foi concedido,
 * nunca o que é derivado: o admin de plataforma não tem linha de membership
 * nenhuma, e alcançar as duas empresas é regra aplicada na leitura — assim a
 * tela de edição de acesso mostra o que existe no banco, e salvar de volta não
 * materializa acesso que ninguém concedeu.
 */
export function visibleCompanies(access: UserAccess): CompanyKey[] {
  if (isPlatformAdmin(access)) {
    return [...companyKeys];
  }
  return companyKeys.filter((company) =>
    access.companies.some((entry) => entry.companyId === company),
  );
}

/** Departamentos liberados numa empresa. Fora do membership, nenhum. */
export function visibleDepartments(access: UserAccess, company: CompanyKey): DepartmentId[] {
  if (isPlatformAdmin(access)) {
    return [...departmentIdsByCompany[company]];
  }
  const encontrada = access.companies.find((entry) => entry.companyId === company);
  const liberados = new Set(encontrada?.departments.map((entry) => entry.departmentId) ?? []);
  return departmentIdsByCompany[company].filter((department) => liberados.has(department));
}

/** Pares (empresa, departamento) que a pessoa gestiona. */
export function managedDepartments(
  access: UserAccess,
): Array<{ companyId: CompanyKey; departmentId: DepartmentId }> {
  return access.companies.flatMap((company) =>
    company.departments
      .filter((department) => department.isManager)
      .map((department) => ({
        companyId: company.companyId,
        departmentId: department.departmentId,
      })),
  );
}
