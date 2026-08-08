import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  authAcknowledgementSchema,
  companyKeys,
  companyRoleKeys,
  departmentIdsByCompany,
  eventNames,
  flattenRoles,
  isPlatformAdmin,
  managedDepartments,
  teamListResponseSchema,
  teamMemberSchema,
  type AuthAcknowledgement,
  type CompanyKey,
  type CompanyRoleKey,
  type DepartmentId,
  type InviteRequest,
  type TeamListQuery,
  type TeamListResponse,
  type TeamMember,
  type UserAccess,
} from "@plugga/shared";

import { AuditRepository } from "../audit/audit.repository";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { AuthTokenIssuer } from "./auth-token-issuer.service";
import { AuthRepository, type TeamMemberRecord } from "./auth.repository";
import { SessionService } from "./session.service";

/**
 * O alcance de quem está agindo, já resolvido. `managed` é o par (empresa,
 * departamento) que a pessoa gestiona — a unidade de escopo de tudo aqui.
 */
interface ActorScope {
  id: string;
  access: UserAccess;
  isAdmin: boolean;
  managed: Map<CompanyKey, Set<DepartmentId>>;
}

/**
 * Gestão de equipe: quem entra, o que alcança e quem sai.
 *
 * Duas autoridades, deliberadamente diferentes:
 *
 * - **Admin de plataforma** governa as duas empresas. Convida, edita e desativa.
 * - **Gestor de departamento** governa o que gestiona. Convida e edita acesso
 *   *contido no próprio escopo*; não promove a admin, não alcança empresa ou
 *   departamento que não gestiona, e não desativa ninguém — desativar revoga a
 *   sessão na plataforma inteira, inclusive em empresas que o gestor nem
 *   enxerga, então é ato de plataforma.
 *
 * O escopo é sempre relido do banco, nunca do principal da sessão: um acesso
 * revogado tem de valer na requisição seguinte, não no próximo login.
 */
@Injectable()
export class TeamService {
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(AuthTokenIssuer) private readonly tokens: AuthTokenIssuer,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditRepository) private readonly audit: AuditRepository,
  ) {}

  async list(principal: AuthPrincipal, query: TeamListQuery): Promise<TeamListResponse> {
    const actor = await this.actorScope(principal);
    // A lista é gestão de equipe, não diretório: quem não administra nem
    // gestiona departamento nenhum não tem o que fazer aqui.
    this.assertCanManageTeam(actor);
    const members = await this.repository.listTeam(query);

    const visiveis = actor.isAdmin
      ? members
      : members.filter((member) => member.id === actor.id || this.inScope(actor, member.access));

    return teamListResponseSchema.parse({
      members: visiveis.map((member) => this.toTeamMember(member, actor)),
      scope: this.scopeResponse(actor),
    });
  }

  async invite(principal: AuthPrincipal, input: InviteRequest): Promise<TeamMember> {
    const actor = await this.actorScope(principal);
    this.assertCanManageTeam(actor);
    this.assertGrantable(actor, input.access);

    const existing = await this.repository.findUserByEmail(input.email);
    if (existing) {
      throw new BadRequestException("a user with this email already exists");
    }

    const user = await this.repository.createInvitedUser({
      email: input.email,
      name: input.name,
      access: input.access,
    });

    await this.tokens.sendInvite(user);

    await this.audit.appendEvent({
      eventName: eventNames.authInviteCreated,
      entityType: "user",
      entityId: user.id,
      actorType: "user",
      actorId: actor.id,
      payload: { access: input.access },
      occurredAt: new Date(),
    });

    return this.toTeamMember(user, actor);
  }

  async updateAccess(
    principal: AuthPrincipal,
    userId: string,
    access: UserAccess,
  ): Promise<TeamMember> {
    const actor = await this.actorScope(principal);
    this.assertCanManageTeam(actor);

    const target = await this.repository.findUserById(userId);
    if (!target) {
      throw new BadRequestException("user not found");
    }

    this.assertCanEdit(actor, target.id, target.access);
    this.assertGrantable(actor, access);

    // Um admin que se rebaixa sozinho pode deixar o sistema sem ninguém capaz
    // de conceder acesso. Perder o próprio admin exige outro admin fazendo.
    if (
      actor.id === target.id &&
      isPlatformAdmin(target.access) &&
      !isPlatformAdmin(access)
    ) {
      throw new ForbiddenException("an admin cannot remove their own platform role");
    }

    if (isPlatformAdmin(target.access) && !isPlatformAdmin(access)) {
      await this.assertNotLastAdmin(target.id);
    }

    const updated = await this.repository.replaceAccess(userId, access);
    if (!updated) {
      throw new BadRequestException("user not found");
    }

    await this.audit.appendEvent({
      eventName: eventNames.userAccessUpdated,
      entityType: "user",
      entityId: userId,
      actorType: "user",
      actorId: actor.id,
      payload: { access },
      occurredAt: new Date(),
    });

    return this.toTeamMember(updated, actor);
  }

  async deactivate(principal: AuthPrincipal, userId: string): Promise<AuthAcknowledgement> {
    const actor = await this.actorScope(principal);
    if (!actor.isAdmin) {
      throw new ForbiddenException("only a platform admin can deactivate a member");
    }
    if (actor.id === userId) {
      throw new ForbiddenException("an admin cannot deactivate themselves");
    }

    const target = await this.repository.findUserById(userId);
    if (!target) {
      throw new BadRequestException("user not found");
    }
    if (isPlatformAdmin(target.access)) {
      await this.assertNotLastAdmin(userId);
    }

    const user = await this.repository.deactivateUser(userId);
    if (!user) {
      throw new BadRequestException("user not found");
    }
    await this.sessions.revokeAllForUser(userId);
    await this.audit.appendEvent({
      eventName: eventNames.userDeactivated,
      entityType: "user",
      entityId: userId,
      actorType: "user",
      actorId: actor.id,
      payload: {},
      occurredAt: new Date(),
    });
    return authAcknowledgementSchema.parse({ ok: true });
  }

  async resendInvite(principal: AuthPrincipal, userId: string): Promise<AuthAcknowledgement> {
    const actor = await this.actorScope(principal);
    this.assertCanManageTeam(actor);

    const target = await this.repository.findUserById(userId);
    if (!target) {
      throw new BadRequestException("user not found");
    }
    this.assertCanEdit(actor, target.id, target.access);

    // Reenviar para quem já aceitou emitiria um token capaz de trocar a senha
    // de uma conta ativa a partir da lista da equipe: isso é redefinição de
    // senha, e ela sai por pedido da própria pessoa.
    if (target.status !== "invited") {
      throw new BadRequestException("only a pending invite can be resent");
    }

    await this.tokens.sendInvite(target);
    await this.audit.appendEvent({
      eventName: eventNames.authInviteResent,
      entityType: "user",
      entityId: userId,
      actorType: "user",
      actorId: actor.id,
      payload: {},
      occurredAt: new Date(),
    });
    return authAcknowledgementSchema.parse({ ok: true });
  }

  private async actorScope(principal: AuthPrincipal): Promise<ActorScope> {
    const user = await this.repository.findUserById(principal.id);
    if (!user) {
      throw new ForbiddenException("principal is not a known user");
    }

    const managed = new Map<CompanyKey, Set<DepartmentId>>();
    for (const entry of managedDepartments(user.access)) {
      const departamentos = managed.get(entry.companyId) ?? new Set<DepartmentId>();
      departamentos.add(entry.departmentId);
      managed.set(entry.companyId, departamentos);
    }

    return {
      id: user.id,
      access: user.access,
      isAdmin: isPlatformAdmin(user.access),
      managed,
    };
  }

  private assertCanManageTeam(actor: ActorScope): void {
    if (!actor.isAdmin && actor.managed.size === 0) {
      throw new ForbiddenException("principal does not manage any department");
    }
  }

  /** Todo o acesso da pessoa cabe dentro do que o gestor gestiona. */
  private inScope(actor: ActorScope, access: UserAccess): boolean {
    if (access.platformRoles.length > 0) {
      return false;
    }
    if (access.companies.length === 0) {
      return false;
    }
    return access.companies.every((company) => {
      const gestionados = actor.managed.get(company.companyId);
      if (!gestionados) {
        return false;
      }
      return company.departments.every((department) =>
        gestionados.has(department.departmentId),
      );
    });
  }

  /**
   * Quem o ator pode editar. Para o gestor, o acesso *atual* da pessoa também
   * precisa caber no escopo: editar substitui o acesso inteiro, então mexer em
   * alguém que também trabalha na Waze apagaria uma concessão que o gestor não
   * enxerga nem poderia refazer.
   */
  private assertCanEdit(actor: ActorScope, targetId: string, targetAccess: UserAccess): void {
    if (actor.isAdmin) {
      return;
    }
    if (actor.id === targetId) {
      throw new ForbiddenException("a manager cannot edit their own access");
    }
    if (!this.inScope(actor, targetAccess)) {
      throw new ForbiddenException("member has access outside the manager's scope");
    }
  }

  /** O acesso concedido cabe no que o ator pode conceder. */
  private assertGrantable(actor: ActorScope, access: UserAccess): void {
    if (actor.isAdmin) {
      return;
    }

    if (access.platformRoles.length > 0) {
      throw new ForbiddenException("only a platform admin can grant platform roles");
    }

    for (const company of access.companies) {
      const gestionados = actor.managed.get(company.companyId);
      if (!gestionados) {
        throw new ForbiddenException(`company ${company.companyId} is outside the manager's scope`);
      }

      for (const department of company.departments) {
        if (!gestionados.has(department.departmentId)) {
          throw new ForbiddenException(
            `department ${department.departmentId} is outside the manager's scope`,
          );
        }
      }

      // Conceder papel que não se tem é escalar privilégio pela porta lateral:
      // um gestor comercial não vira concessor de `tech` só por gerir gente.
      const concedeveis = this.grantableRoles(actor, company.companyId);
      for (const role of company.roles) {
        if (!concedeveis.includes(role)) {
          throw new ForbiddenException(
            `role ${role} is outside the manager's scope in ${company.companyId}`,
          );
        }
      }
    }
  }

  private grantableRoles(actor: ActorScope, company: CompanyKey): CompanyRoleKey[] {
    if (actor.isAdmin) {
      return [...companyRoleKeys];
    }
    const proprios = actor.access.companies.find((entry) => entry.companyId === company);
    // `viewer` é o piso: negar acesso de leitura a quem o gestor já pode
    // convidar não protege nada e só empurra o convite para o admin.
    const concedeveis = new Set<CompanyRoleKey>(["viewer", ...(proprios?.roles ?? [])]);
    return companyRoleKeys.filter((role) => concedeveis.has(role));
  }

  /** Impede que a última pessoa capaz de administrar a plataforma deixe de ser. */
  private async assertNotLastAdmin(userId: string): Promise<void> {
    const membros = await this.repository.listTeam({});
    const outros = membros.filter(
      (member) =>
        member.id !== userId && member.status === "active" && isPlatformAdmin(member.access),
    );
    if (outros.length === 0) {
      throw new BadRequestException("the last platform admin cannot be removed");
    }
  }

  private scopeResponse(actor: ActorScope): TeamListResponse["scope"] {
    if (actor.isAdmin) {
      return {
        isPlatformAdmin: true,
        canInvite: true,
        companies: companyKeys.map((companyId) => ({
          companyId,
          departmentIds: [...departmentIdsByCompany[companyId]],
          roles: [...companyRoleKeys],
          canGrantManager: true,
        })),
      };
    }

    return {
      isPlatformAdmin: false,
      canInvite: actor.managed.size > 0,
      companies: [...actor.managed.entries()].map(([companyId, departamentos]) => ({
        companyId,
        departmentIds: departmentIdsByCompany[companyId].filter((department) =>
          departamentos.has(department),
        ),
        roles: this.grantableRoles(actor, companyId),
        canGrantManager: true,
      })),
    };
  }

  private toTeamMember(record: TeamMemberRecord, actor: ActorScope): TeamMember {
    const podeEditar = actor.isAdmin
      ? true
      : actor.id !== record.id && this.inScope(actor, record.access);

    return teamMemberSchema.parse({
      id: record.id,
      email: record.email,
      name: record.name,
      status: record.status,
      roles: flattenRoles(record.access),
      access: record.access,
      createdAt: record.createdAt.toISOString(),
      canManage: podeEditar,
      canDeactivate: actor.isAdmin && actor.id !== record.id && record.status !== "disabled",
    });
  }
}
