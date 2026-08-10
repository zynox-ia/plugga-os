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
