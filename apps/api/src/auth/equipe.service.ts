import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  authAcknowledgementSchema,
  alcancaTela,
  telasPorDepartamento,
  departamentos as todosOsDepartamentos,
  eventNames,
  listaDaEquipeSchema,
  membroDaEquipeSchema,
  papelDoAcesso,
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
import { Conflito, EstadoInvalido, NaoEncontrado, ServicoIndisponivel } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { SessionCache } from "../core/auth/session-cache";
import { AuthTokenIssuer } from "./auth-token-issuer.service";
import { AuthRepository, type TeamMemberRecord } from "./auth.repository";
import { SessionService } from "./session.service";

/** Quem está agindo, relido do banco a cada chamada. */
interface Ator {
  acesso: Acesso;
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

    const existente = await this.repository.findUserByEmail(convite.email);
    if (existente && existente.status !== "removed") {
      throw new Conflito("Já existe uma pessoa com este e-mail.");
    }
    const criado = await this.repository.createInvitedMember({
      email: convite.email,
      name: convite.name,
      acesso: convite.acesso,
    }, ator.id);
    await this.enviarLink(criado);
    return this.paraMembro(ator, criado);
  }

  async editarAcesso(principal: AuthPrincipal, userId: string, acesso: Acesso): Promise<MembroDaEquipe> {
    const ator = await this.ator(principal);
    this.exigeGestao(ator);
    const alvo = await this.alvoEditavel(ator, userId);
    acesso = { ...acesso, departamentos: acesso.departamentos.map((entrada) => ({
      ...entrada, telas: entrada.telas ?? alvo.acesso.departamentos.find((anterior) => anterior.departamento === entrada.departamento)?.telas ?? [],
    })) };
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
    if (alvo.status !== "invited" && alvo.status !== "active") {
      throw new EstadoInvalido("A conta precisa estar ativa ou com convite pendente.");
    }
    await this.enviarLink(alvo);
    await this.audit.appendEvent({
      eventName: alvo.status === "invited" ? eventNames.authInviteResent : eventNames.authResetRequested,
      entityType: "user",
      entityId: userId,
      actorType: "user",
      actorId: ator.id,
      payload: {},
      occurredAt: new Date(),
    });
    return authAcknowledgementSchema.parse({ ok: true });
  }

  private async enviarLink(alvo: TeamMemberRecord): Promise<void> {
    try {
      if (alvo.status === "invited") await this.tokens.sendInvite(alvo);
      else await this.tokens.sendReset(alvo);
    } catch {
      throw new ServicoIndisponivel("Cadastro preservado. Não foi possível enviar o e-mail; tente Enviar link de acesso na lista.");
    }
  }

  async remover(principal: AuthPrincipal, userId: string): Promise<AuthAcknowledgement> {
    const ator = await this.ator(principal);
    const alvo = await this.repository.findUserById(userId);
    if (!alvo || !this.enxerga(ator, alvo)) throw new NaoEncontrado("Pessoa não encontrada.");
    if (!this.podeRemover(ator, alvo)) throw new ForbiddenException("member is outside the actor's scope");
    await this.repository.removeUser(userId, ator.id);
    await this.sessions.revokeAllForUser(userId);
    return authAcknowledgementSchema.parse({ ok: true });
  }

  private async ator(principal: AuthPrincipal): Promise<Ator> {
    const registro = await this.repository.findUserById(principal.id);
    if (!registro) {
      throw new ForbiddenException("principal is not a known user");
    }
    const papel = papelDoAcesso(registro.acesso);
    return {
      acesso: registro.acesso,
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
    if (alvo.status === "removed") return false;
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
            (entrada) => entrada.nivel === "membro" && ator.gerencia.has(entrada.departamento) &&
              (entrada.telas ?? telasPorDepartamento[entrada.departamento]).every((tela) => alcancaTela(ator.acesso, tela)),
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

  private podeRemover(ator: Ator, alvo: TeamMemberRecord): boolean {
    return alvo.id !== ator.id && alvo.status !== "removed" &&
      (ator.papel === "desenvolvedor" || (ator.papel === "admin" && alvo.acesso.plataforma !== "desenvolvedor"));
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
      if (acesso.departamentos.some((entrada) => entrada.telas?.some((tela) => !alcancaTela(ator.acesso, tela)))) {
        throw new ForbiddenException("screen is outside the manager's scope");
      }
    }
  }

  private escopo(ator: Ator): EscopoDaEquipe {
    return {
      telasConcediveis: Object.values(telasPorDepartamento).flat().filter((tela) => alcancaTela(ator.acesso, tela)),
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
      podeRemover: this.podeRemover(ator, registro),
      podeReenviarConvite: podeEditar && (registro.status === "invited" || registro.status === "active"),
    });
  }
}
