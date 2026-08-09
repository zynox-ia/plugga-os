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
  userAccessUpdated: "user.access.updated",
  userDeactivated: "user.deactivated",
  pluggamobSeeded: "pluggamob.seeded",
  // Troca de credencial de LLM. Quem trocou e quando é a primeira pergunta
  // quando a conta do mês surpreende; o valor nunca entra no registro.
  llmChaveGravada: "llm.chave.gravada",
  llmChaveApagada: "llm.chave.apagada",
} as const;

export type EventName = (typeof eventNames)[keyof typeof eventNames];
