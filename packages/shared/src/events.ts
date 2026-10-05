export const eventNames = {
  agentActionRecorded: "agent.action.recorded",
  whatsappSendBlocked: "channel.whatsapp.send.blocked",
  whatsappSendMocked: "channel.whatsapp.send.mocked",
  whatsappSendPendingApproval: "channel.whatsapp.send.pending_approval",
  authLoginSucceeded: "auth.login.succeeded",
  authLoginFailed: "auth.login.failed",
  authLogout: "auth.logout",
  authInviteCreated: "auth.invite.created",
  authInviteAccepted: "auth.invite.accepted",
  authResetRequested: "auth.reset.requested",
  authResetCompleted: "auth.reset.completed",
  authInviteResent: "auth.invite.resent",
  /**
   * Primeiro vínculo entre um usuário local e uma conta Google. Fica separado de
   * `auth.login.succeeded` porque é o evento que muda quem pode entrar na conta
   * daqui em diante — é o que se procura quando alguém pergunta "desde quando
   * essa pessoa entra pelo Google?". Nunca carrega o `sub` nem o ID token.
   */
  authGoogleIdentityLinked: "auth.google_identity.linked",
  userAccessUpdated: "user.access.updated",
  userDeactivated: "user.deactivated",
  pluggamobSeeded: "pluggamob.seeded",
  // Troca de credencial de LLM. Quem trocou e quando é a primeira pergunta
  // quando a conta do mês surpreende; o valor nunca entra no registro.
  llmChaveGravada: "llm.chave.gravada",
  llmChaveApagada: "llm.chave.apagada",
} as const;

export type EventName = (typeof eventNames)[keyof typeof eventNames];

/**
 * Catálogo de eventos de auditoria (contrato:
 * specs/002-fundacao-solida/contracts/catalogo-eventos.md).
 *
 * Nome novo: `<dominio>.<entidade>.<acao_no_passado>`, minúsculas, ASCII.
 * `escopo: "empresa"` grava `company_id`; `pii` é sempre `false` (um `true`
 * é erro de catálogo, impedido pelo tipo).
 */
export interface DefinicaoDeEvento {
  readonly descricao: string;
  readonly escopo: "empresa" | "plataforma";
  readonly pii: false;
}

const evento = (descricao: string, escopo: DefinicaoDeEvento["escopo"]): DefinicaoDeEvento => ({
  descricao,
  escopo,
  pii: false,
});

export const catalogoEventos = {
  "energy_efficiency.study.approved": evento("Estudo de eficiência energética aprovado", "empresa"),
  "energy_efficiency.study.sent": evento("Estudo enviado ao cliente", "empresa"),
  "energy.invoice_type.approved": evento("Tipo de fatura aprovado", "empresa"),
  "obras.apr.signed": evento("APR assinada", "empresa"),
  "obras.epi.checked": evento("EPI conferido", "empresa"),
  "obras.release.recorded": evento("Liberação registrada", "empresa"),
  "obras.release.revoked": evento("Liberação revogada", "empresa"),
  "obras.pendency.recorded": evento("Pendência lançada", "empresa"),
  "obras.measurement.recorded": evento("Medição lançada", "empresa"),
  "obras.project_version.created": evento("Versão de projeto criada", "empresa"),
  "commercial.opportunity.won": evento("Oportunidade ganha", "empresa"),
  "clientes.client.created": evento("Cliente criado", "empresa"),
  "compras.pedido.created": evento("Pedido numerado", "empresa"),
  "pluggamob.settlement.approved": evento("Fechamento Pluggamob aprovado", "empresa"),
  "auth.access.changed": evento("Acesso de usuário alterado", "plataforma"),
  "auth.user.deactivated": evento("Usuário desativado", "plataforma"),
  "integrations.mode.changed": evento("Modo de integração alterado", "plataforma"),
  "llm.chave.updated": evento("Chave de LLM trocada", "plataforma"),
} as const satisfies Record<string, DefinicaoDeEvento>;

export type NomeDeEventoDoCatalogo = keyof typeof catalogoEventos;

/** `<dominio>.<entidade>.<acao_no_passado>`, tudo em minúsculas, ASCII. */
export const padraoNomeDeEvento = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/**
 * Nomes que já existem em produção e nos testes, fora do padrão. Continuam
 * aceitos por uma versão para não quebrar telas e consultas. Nenhum nome novo
 * entra aqui: um teste compara esta lista com o que o código usa.
 */
export const eventosLegados: readonly string[] = [
  ...Object.values(eventNames),
  "clientes.client_created",
  "clientes.client_updated",
  "clientes.client_inactivated",
  "clientes.client_activated",
  "commercial.client_created_from_opportunity",
  "commercial.contract_created",
  "commercial.contract_status_updated",
  "commercial.opportunity_contact_registered",
  "commercial.opportunity_created",
  "commercial.opportunity_lost",
  "commercial.opportunity_revisit_scheduled",
  "commercial.opportunity_stage_updated",
  "commercial.opportunity_won",
  "compras.compra_aprovada",
  "compras.compra_em_revisao",
  "compras.cotacao_selecionada",
  "compras.estoque_decidido",
  "compras.etapa_movida",
  "compras.fornecedor_cadastrado",
  "compras.necessidade_validada",
  "compras.obra_cadastrada",
  "compras.pagamento_registrado",
  "compras.pedido_criado",
  "compras.prazo_renegociado",
  "compras.recebimento_confirmado",
  "compras.segregacao_dispensada",
  "energy.audit_created",
  "energy.audit_resolved",
  "energy.client_created_from_market_migration",
  "energy.consumer_unit_created_from_market_migration",
  "energy.contestation_created",
  "energy.contestation_status_updated",
  "energy.cycle_closed",
  "energy.cycle_documents_received",
  "energy.cycle_opened",
  "energy.cycle_report_approved",
  "energy.cycle_report_generated",
  "energy.cycle_report_sent",
  "energy.market_migration_activated",
  "energy.market_migration_cancelled",
  "energy.market_migration_created",
  "energy.market_migration_stage_advanced",
  "pluggamob.contact_recorded",
  "pluggamob.incident_created",
  "pluggamob.settlement_approval_requested",
  "pluggamob.settlement_approved",
  "pluggamob.settlement_blocker_resolved",
  "pluggamob.user_opted_out",
  "llm.chave.gravada",
  "llm.chave.apagada",
];

/** Evento que o `AuditAppender` aceita: do catálogo novo ou legado. */
export type NomeDeEventoAuditavel = NomeDeEventoDoCatalogo | EventName;

export function eventoEstaNoCatalogo(nome: string): boolean {
  return nome in catalogoEventos || eventosLegados.includes(nome);
}
