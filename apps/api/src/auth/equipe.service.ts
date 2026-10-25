import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  authAcknowledgementSchema,
  departamentos as todosOsDepartamentos,
  eventNames,
  listaDaEquipeSchema,
  membroDaEquipeSchema,
  type Acesso,
  type AuthAcknowledgement,
  type ConsultaDaEquipe,
  type ConviteDaEquipe,
  type Departamento,
  type EscopoDaEquipe,
  type ListaDaEquipe,
  type MembroDaEquipe,
  type PapelDaEquipe,
} from "@plugga/shared";

import { AuditPort } from "../audit/audit.port";
import { Conflito, EstadoInvalido, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { SessionCache } from "../core/auth/session-cache";
import { AuthTokenIssuer } from "./auth-token-issuer.service";
import { AuthRepository, type TeamMemberRecord } from "./auth.repository";
import { SessionService } from "./session.service";

/** Quem está agindo, relido do banco a cada chamada. */
interface Ator {
  id: string;
  papel: PapelDaEquipe;
  /** Departamentos em que o ator é gerente. Vazio para admin e desenvolvedor. */
  gerencia: Set<Departamento>;
}

const CONCEDIVEIS: Record<PapelDaEquipe, PapelDaEquipe[]> = {
  desenvolvedor: ["desenvolvedor", "admin", "gerente", "membro"],
  admin: ["admin", "gerente", "membro"],
  gerente: ["membro"],
  membro: [],
};

/** O degrau mais alto do acesso. */
export function papelDoAcesso(acesso: Acesso): PapelDaEquipe {
  if (acesso.plataforma !== null) return acesso.plataforma;
  return acesso.departamentos.some((entrada) => entrada.nivel === "gerente") ? "gerente" : "membro";
}

/**
 * Equipe e acessos no modelo de 4 papéis. A escada:
 *
 * - desenvolvedor vê, convida e edita qualquer pessoa, com qualquer papel;
 * - admin vê e edita todo mundo menos desenvolvedores, e dá admin, gerente e
 *   membro em qualquer departamento;
 * - gerente vê quem está nos departamentos que gere, convida e edita só
 *   membros desses departamentos, e não desativa ninguém;
 * - membro não gere equipe.
 *
 * Ninguém edita o próprio acesso: subir de degrau sozinho é escalar privilégio,
 * e descer sozinho pode deixar a plataforma sem admin. O escopo é sempre relido
 * do banco, nunca da sessão: um acesso revogado vale na requisição seguinte.
 */
@Injectable()
export class EquipeService {
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(AuthTokenIssuer) private readonly tokens: AuthTokenIssuer,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(SessionCache) private readonly cache: SessionCache,
  ) {}

  async listar(principal: AuthPrincipal, consulta: ConsultaDaEquipe): Promise<ListaDaEquipe> {
    const ator = await this.ator(principal);
    this.exigeGestao(ator);
    const membros = await this.repository.listMembers(consulta);
    return listaDaEquipeSchema.parse({
      membros: membros.filter((membro) => this.enxerga(ator, membro)).map((membro) => this.paraMembro(ator, membro)),
      escopo: this.escopo(ator),
    });
  }

  async convidar(principal: AuthPrincipal, convite: ConviteDaEquipe): Promise<MembroDaEquipe> {
    const ator = await this.ator(principal);
    this.exigeGestao(ator);
    this.exigeConcedivel(ator, convite.acesso);

    if (await this.repository.findUserByEmail(convite.email)) {
      throw new Conflito("Já existe uma pessoa com este e-mail.");
    }
    const criado = await this.repository.createInvitedMember({
      email: convite.email,
      name: convite.name,
      acesso: convite.acesso,
    });
    await this.tokens.sendInvite(criado);
    await this.audit.appendEvent({
      eventName: eventNames.authInviteCreated,
      entityType: "user",
      entityId: criado.id,
      actorType: "user",
      actorId: ator.id,
      payload: { acesso: convite.acesso },
      occurredAt: new Date(),
    });
    return this.paraMembro(ator, criado);
  }

  async editarAcesso(principal: AuthPrincipal, userId: string, acesso: Acesso): Promise<MembroDaEquipe> {
    const ator = await this.ator(principal);
    this.exigeGestao(ator);
    const alvo = await this.alvoEditavel(ator, userId);
    this.exigeConcedivel(ator, acesso);

    // O último admin é conferido no repositório, na mesma transação (FR-029).
    const atualizado = await this.repository.replaceAcesso(alvo.id, acesso, ator.id);
    if (!atualizado) {
      throw new NaoEncontrado("Pessoa não encontrada.");
    }
    // Sem isto o acesso antigo continuaria valendo pelo TTL do cache de sessão.
    await this.cache.invalidateAllForUser(alvo.id);
    return this.paraMembro(ator, atualizado);
  }

  async desativar(principal: AuthPrincipal, userId: string): Promise<AuthAcknowledgement> {
    const ator = await this.ator(principal);
    const alvo = await this.repository.findUserById(userId);
    if (!alvo || !this.enxerga(ator, alvo)) {
      throw new NaoEncontrado("Pessoa não encontrada.");
    }
    if (!this.podeDesativar(ator, alvo)) {
      throw new ForbiddenException("only an admin or developer can deactivate someone else");
    }
    // Último admin: regra no repositório, na mesma transação (FR-029).
    const desativado = await this.repository.deactivateUser(userId, ator.id);
    if (!desativado) {
      throw new NaoEncontrado("Pessoa não encontrada.");
    }
    await this.sessions.revokeAllForUser(userId);
    return authAcknowledgementSchema.parse({ ok: true });
  }

  async reenviarConvite(principal: AuthPrincipal, userId: string): Promise<AuthAcknowledgement> {
    const ator = await this.ator(principal);
    this.exigeGestao(ator);
    const alvo = await this.alvoEditavel(ator, userId);
    // Reenviar para quem já aceitou seria redefinir a senha de uma conta ativa
    // a partir da lista da equipe; isso sai só por pedido da própria pessoa.
    if (alvo.status !== "invited") {
      throw new EstadoInvalido("Só é possível reenviar um convite pendente.");
    }
    await this.tokens.sendInvite(alvo);
    await this.audit.appendEvent({
      eventName: eventNames.authInviteResent,
      entityType: "user",
      entityId: userId,
      actorType: "user",
      actorId: ator.id,
      payload: {},
      occurredAt: new Date(),
    });
    return authAcknowledgementSchema.parse({ ok: true });
  }

  private async ator(principal: AuthPrincipal): Promise<Ator> {
    const registro = await this.repository.findUserById(principal.id);
    if (!registro) {
      throw new ForbiddenException("principal is not a known user");
    }
    const papel = papelDoAcesso(registro.acesso);
    return {
      id: registro.id,
      papel,
      gerencia: new Set(
        papel === "gerente"
          ? registro.acesso.departamentos.filter((entrada) => entrada.nivel === "gerente").map((entrada) => entrada.departamento)
          : [],
      ),
    };
  }

  private exigeGestao(ator: Ator): void {
    if (ator.papel === "membro") {
      throw new ForbiddenException("principal does not manage a team");
    }
  }

  /** Quem aparece na lista do ator. O gerente vê quem divide departamento com ele. */
  private enxerga(ator: Ator, alvo: TeamMemberRecord): boolean {
    if (alvo.id === ator.id) return true;
    switch (ator.papel) {
      case "desenvolvedor":
        return true;
      case "admin":
        return alvo.acesso.plataforma !== "desenvolvedor";
      case "gerente":
        return (
          alvo.acesso.plataforma === null &&
          alvo.acesso.departamentos.some((entrada) => ator.gerencia.has(entrada.departamento))
        );
      default:
        return false;
    }
  }

  /**
   * Editar substitui o acesso inteiro, então o gerente só edita quem cabe todo
   * no que ele gere e é membro em tudo: mexer em alguém que também está em
   * outro departamento apagaria uma concessão que ele não pode refazer, e
   * mexer em outro gerente seria rebaixá-lo.
   */
  private podeEditar(ator: Ator, alvo: TeamMemberRecord): boolean {
    if (alvo.id === ator.id) return false;
    switch (ator.papel) {
      case "desenvolvedor":
        return true;
      case "admin":
        return alvo.acesso.plataforma !== "desenvolvedor";
      case "gerente":
        return (
          alvo.acesso.plataforma === null &&
          alvo.acesso.departamentos.length > 0 &&
          alvo.acesso.departamentos.every(
            (entrada) => entrada.nivel === "membro" && ator.gerencia.has(entrada.departamento),
          )
        );
      default:
        return false;
    }
  }

  private podeDesativar(ator: Ator, alvo: TeamMemberRecord): boolean {
    if (alvo.id === ator.id || alvo.status === "disabled") return false;
    if (ator.papel === "desenvolvedor") return true;
    return ator.papel === "admin" && alvo.acesso.plataforma !== "desenvolvedor";
  }

  private async alvoEditavel(ator: Ator, userId: string): Promise<TeamMemberRecord> {
    const alvo = await this.repository.findUserById(userId);
    // Quem o ator não enxerga responde como inexistente: o admin não descobre
    // desenvolvedores, nem o gerente pessoas de outros departamentos.
    if (!alvo || !this.enxerga(ator, alvo)) {
      throw new NaoEncontrado("Pessoa não encontrada.");
    }
    if (!this.podeEditar(ator, alvo)) {
      throw new ForbiddenException(
        alvo.id === ator.id ? "no one edits their own access" : "member is outside the actor's scope",
      );
    }
    return alvo;
  }

  private exigeConcedivel(ator: Ator, acesso: Acesso): void {
    if (!CONCEDIVEIS[ator.papel].includes(papelDoAcesso(acesso))) {
      throw new ForbiddenException(`role ${papelDoAcesso(acesso)} is above what the actor can grant`);
    }
    if (ator.papel === "gerente") {
      const fora = acesso.departamentos.find(
        (entrada) => entrada.nivel !== "membro" || !ator.gerencia.has(entrada.departamento),
      );
      if (fora) {
        throw new ForbiddenException(`department ${fora.departamento} is outside the manager's scope`);
      }
    }
  }

  private escopo(ator: Ator): EscopoDaEquipe {
    return {
      papel: ator.papel,
      podeConvidar: ator.papel !== "membro",
      papeisConcediveis: CONCEDIVEIS[ator.papel],
      departamentos:
        ator.papel === "gerente"
          ? todosOsDepartamentos.filter((departamento) => ator.gerencia.has(departamento))
          : ator.papel === "membro"
            ? []
            : [...todosOsDepartamentos],
    };
  }

  private paraMembro(ator: Ator, registro: TeamMemberRecord): MembroDaEquipe {
    const podeEditar = this.podeEditar(ator, registro);
    return membroDaEquipeSchema.parse({
      id: registro.id,
      email: registro.email,
      name: registro.name,
      status: registro.status,
      acesso: registro.acesso,
      createdAt: registro.createdAt.toISOString(),
      podeEditar,
      podeDesativar: this.podeDesativar(ator, registro),
      podeReenviarConvite: podeEditar && registro.status === "invited",
    });
  }
}
