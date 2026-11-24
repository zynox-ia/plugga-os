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
  /** Troca de senha pela própria pessoa, logada. Nunca carrega a senha. */
  authPasswordChanged: "auth.password.changed",
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
  // Brevo conectado, trocado ou desconectado pela tela. Quem e quando; nunca a chave.
  emailBrevoConectado: "email.brevo.connected",
  emailBrevoDesconectado: "email.brevo.disconnected",
  // Consulta de CNPJ e CEP ligada ou desligada pela plataforma.
  integracaoCadastroAtivada: "integracao.cadastro.activated",
  integracaoCadastroDesativada: "integracao.cadastro.deactivated",
  // Telegram conectado, trocado ou desconectado pela tela. Quem e quando; nunca o token.
  telegramConectado: "integracao.telegram.connected",
  telegramDesconectado: "integracao.telegram.disconnected",
  // Conta da Autentique de uma empresa conectada ou desconectada pela tela. Quem, quando e qual empresa; nunca o token.
  autentiqueConectada: "integracao.autentique.connected",
  autentiqueDesconectada: "integracao.autentique.disconnected",
  // Conta do OMIE conectada ou desconectada pela tela. Quem e quando; nunca a chave nem o segredo.
  omieConectado: "integracao.omie.connected",
  omieDesconectado: "integracao.omie.disconnected",
  // IA pela assinatura (Claude e Codex): início do login e conta removida. Quem e quando; nunca token.
  iaAssinaturaLoginIniciado: "integracao.ia_assinatura.login_started",
  iaAssinaturaContaRemovida: "integracao.ia_assinatura.account_removed",
  // Credenciais do app OAuth do Google (plataforma) e conexão da agenda de cada pessoa.
  // Quem e quando; nunca o client secret nem token.
  googleOAuthConectado: "google.oauth.connected",
  googleOAuthDesconectado: "google.oauth.disconnected",
  googleCalendarConectado: "google.calendar.connected",
  googleCalendarDesconectado: "google.calendar.disconnected",
} as const;

export type EventName = (typeof eventNames)[keyof typeof eventNames];

/**
 * Catálogo de eventos de auditoria.
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
  "auth.mfa.enabled": evento("Segundo fator ativado", "plataforma"),
  "auth.mfa.rotated": evento("Autenticador trocado", "plataforma"),
  "auth.mfa.disabled": evento("Segundo fator desativado pelo titular", "plataforma"),
  "auth.mfa.removed": evento("Segundo fator removido por desenvolvedor", "plataforma"),
  "auth.mfa.emergency_removed": evento("Segundo fator removido por procedimento emergencial", "plataforma"),
  "auth.mfa.recovery_codes_rotated": evento("Códigos de recuperação substituídos", "plataforma"),
  "auth.mfa.verified": evento("Segundo fator confirmado", "plataforma"),
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
  "commercial.pipeline.created": evento("Pipeline de venda criado", "empresa"),
  "commercial.pipeline.updated": evento("Configuração do pipeline alterada", "empresa"),
  "commercial.pipeline.archived": evento("Pipeline arquivado", "empresa"),
  "commercial.pipeline.restored": evento("Pipeline reativado", "empresa"),
  "commercial.pipeline.solar_activated": evento("Processo Solar ativado no pipeline", "empresa"),
  "commercial.deal.created": evento("Negócio criado", "empresa"),
  "commercial.deal.updated": evento("Dados do lead editados", "empresa"),
  "commercial.deal.stage_changed": evento("Etapa do negócio alterada por uma transição comercial", "empresa"),
  "commercial.deal.won": evento("Negócio ganho", "empresa"),
  "commercial.deal.lost": evento("Negócio perdido", "empresa"),
  "commercial.deal.transferred": evento("Negócio movido para outro pipeline", "empresa"),
  // Sem PII: não grava nome, documento nem contato do cliente, só o vínculo.
  "commercial.deal.client_converted": evento("Lead convertido em cliente", "empresa"),
  // Sem PII: não grava nome de arquivo nem categoria, só que algo mudou.
  "commercial.deal.document_added": evento("Documento do lead enviado", "empresa"),
  "commercial.deal.document_archived": evento("Documento do lead arquivado", "empresa"),
  "clientes.client.created": evento("Cliente criado", "empresa"),
  // Cadastro de cliente não tem empresa dona (ADR-0013): o escopo é a plataforma.
  "clientes.contact.added": evento("Contato do cliente adicionado", "plataforma"),
  "clientes.contact.updated": evento("Contato do cliente alterado", "plataforma"),
  "clientes.contact.removed": evento("Contato do cliente removido", "plataforma"),
  "compras.pedido.created": evento("Pedido numerado", "empresa"),
  // Pedido de compra (PLU-327). Sem PII: payload só com ids, etapas e nomes de campos.
  "compras.pedido.updated": evento("Dados do pedido de compra alterados", "empresa"),
  "compras.pedido.analise_iniciada": evento("Análise de estoque iniciada", "empresa"),
  "compras.pedido.estoque_decidido": evento("Decisão de estoque registrada", "empresa"),
  "compras.pedido.cotacao_selecionada": evento("Cotação escolhida", "empresa"),
  "compras.pedido.enviado_para_aprovacao": evento("Pedido enviado para aprovação", "empresa"),
  "compras.pedido.aprovado": evento("Compra aprovada", "empresa"),
  "compras.pedido.revisado": evento("Compra devolvida para cotações", "empresa"),
  "compras.pedido.pagamento_registrado": evento("Pagamento registrado", "empresa"),
  "compras.pedido.comprovante_enviado": evento("Comprovante de pagamento enviado", "empresa"),
  "compras.pedido.recebimento_confirmado": evento("Recebimento confirmado e pedido concluído", "empresa"),
  "compras.pedido.cancelado": evento("Pedido de compra cancelado", "empresa"),
  "compras.cotacao.created": evento("Cotação registrada", "empresa"),
  "compras.obra.created": evento("Obra cadastrada pelo pedido de compra", "empresa"),
  // Estoque (PLU-332). Sem PII: payload só com ids, tipos e nomes de campos.
  "estoque.item.created": evento("Item de estoque cadastrado", "empresa"),
  "estoque.item.updated": evento("Item de estoque alterado", "empresa"),
  "estoque.item.inactivated": evento("Item de estoque inativado", "empresa"),
  "estoque.item.reactivated": evento("Item de estoque reativado", "empresa"),
  "estoque.movimentacao.created": evento("Movimentação de estoque registrada", "empresa"),
  "estoque.reserva.created": evento("Reserva de estoque para um pedido de compra", "empresa"),
  "estoque.reserva.baixada": evento("Reserva de estoque convertida em saída no recebimento", "empresa"),
  "estoque.reserva.liberada": evento("Reserva de estoque liberada", "empresa"),
  // Financeiro (PLU-336). Sem PII: o motivo do cancelamento e a descrição ficam no lançamento, não no evento.
  "financeiro.lancamento.created": evento("Lançamento financeiro criado", "empresa"),
  // Cadastros do Financeiro (PLU-342, S3b). Payload só com o código, o tipo e os nomes de campos.
  // Conciliação (PLU-339). Só contagens: a descrição dos movimentos é dado bancário e não vai ao evento.
  "financeiro.extrato.importado": evento("Extrato bancário importado", "empresa"),
  "financeiro.categoria.created": evento("Categoria financeira cadastrada", "empresa"),
  "financeiro.categoria.updated": evento("Categoria financeira alterada", "empresa"),
  "financeiro.conta_corrente.created": evento("Conta corrente cadastrada", "empresa"),
  "financeiro.conta_corrente.updated": evento("Conta corrente alterada", "empresa"),
  "financeiro.lancamento.updated": evento("Lançamento financeiro alterado", "empresa"),
  "financeiro.lancamento.aprovado": evento("Conta a pagar aprovada", "empresa"),
  "financeiro.lancamento.cancelado": evento("Lançamento financeiro cancelado", "empresa"),
  // PLU-337. O motivo da correção e a nota da cobrança ficam na linha do tempo do lançamento.
  "financeiro.lancamento.valor_corrigido": evento("Valor do lançamento corrigido", "empresa"),
  "financeiro.lancamento.nf_registrada": evento("NF da cobrança registrada", "empresa"),
  "financeiro.lancamento.boleto_registrado": evento("Boleto da cobrança registrado", "empresa"),
  "financeiro.lancamento.enviado": evento("Cobrança enviada ao cliente", "empresa"),
  "financeiro.lancamento.cobranca_registrada": evento("Contato de cobrança registrado", "empresa"),
  "financeiro.lancamento.pago": evento("Pagamento da conta registrado", "empresa"),
  "financeiro.lancamento.recebido": evento("Recebimento da cobrança registrado", "empresa"),
  "financeiro.anexo.enviado": evento("Anexo do lançamento enviado", "empresa"),
  "financeiro.anexo.substituido": evento("Anexo do lançamento substituído", "empresa"),
  // Ordens de serviço da Engenharia (PLU-345). Sem PII: nunca o nome nem o documento
  // de quem assina o termo; motivos e laudo ficam na O.S. e na linha do tempo dela.
  "engenharia.ordem.created": evento("Ordem de serviço aberta", "empresa"),
  "engenharia.ordem.updated": evento("Dados da ordem de serviço alterados", "empresa"),
  "engenharia.ordem.agendada": evento("Ordem de serviço agendada", "empresa"),
  "engenharia.ordem.remarcada": evento("Ordem de serviço remarcada", "empresa"),
  "engenharia.ordem.checkin_registrado": evento("Chegada do técnico registrada", "empresa"),
  "engenharia.ordem.foto_enviada": evento("Foto da ordem de serviço enviada", "empresa"),
  "engenharia.ordem.laudo_registrado": evento("Laudo da ordem de serviço registrado", "empresa"),
  "engenharia.ordem.termo_assinado": evento("Termo assinado e ordem de serviço concluída", "empresa"),
  "engenharia.ordem.adiada": evento("Ordem de serviço adiada", "empresa"),
  "engenharia.ordem.cancelada": evento("Ordem de serviço cancelada", "empresa"),
  "engenharia.ordem.material_pedido": evento("Material pedido a Compras pela ordem de serviço", "empresa"),
  "engenharia.tipo_de_ordem.configurado": evento("Prazo padrão ou agendador de um tipo de O.S. alterado", "plataforma"),
  // Usinas e monitoramento (PLU-347). Sem o print nem as notas: o print pode mostrar dados de cliente.
  "engenharia.usina.created": evento("Usina cadastrada", "empresa"),
  "engenharia.usina.updated": evento("Dados da usina alterados", "empresa"),
  "engenharia.plataforma.configurada": evento("Plataforma de inversor cadastrada ou alterada", "plataforma"),
  "engenharia.plataforma.conferida": evento("Plataforma conferida no monitoramento do dia", "empresa"),
  // Obras (PLU-350). Sem nome de arquivo nem valores: só ids, marcos e campos.
  "engenharia.obra.created": evento("Obra cadastrada pela Engenharia", "empresa"),
  "engenharia.obra.updated": evento("Dados da obra alterados", "empresa"),
  "engenharia.obra.marco_feito": evento("Marco da obra feito", "empresa"),
  "engenharia.obra.marco_reprogramado": evento("Marco da obra reprogramado", "empresa"),
  "engenharia.obra.documento_enviado": evento("Documento ou cronograma anexado à obra", "empresa"),
  // Protocolos na distribuidora (PLU-348). Sem a nota nem a ação pendente: podem citar dados do cliente.
  "protocolos.protocolo.created": evento("Protocolo na distribuidora cadastrado", "empresa"),
  "protocolos.protocolo.updated": evento("Dados do protocolo na distribuidora alterados", "empresa"),
  "protocolos.protocolo.verificado": evento("Protocolo na distribuidora verificado", "empresa"),
  "protocolos.distribuidora.configurada": evento("Distribuidora cadastrada ou alterada", "plataforma"),
  // Tarefas dos departamentos (PLU-349, PLU-340). Sem PII: o resultado fica na ocorrência, não no evento.
  "tarefas.tarefa.created": evento("Tarefa do departamento criada", "empresa"),
  "tarefas.tarefa.encerrada": evento("Tarefa do departamento encerrada", "empresa"),
  "tarefas.ocorrencia.concluida": evento("Tarefa do dia concluída", "empresa"),
  // OMIE por empresa (PLU-342). Nunca a chave, o segredo nem a resposta do OMIE.
  "integracoes.omie.conectada": evento("Par do OMIE da empresa gravado", "empresa"),
  "integracoes.omie.desconectada": evento("Par do OMIE da empresa removido", "empresa"),
  "integracoes.omie.testada": evento("Conexão do OMIE da empresa testada", "empresa"),
  "integracoes.omie.confirmada": evento("Conexão do OMIE da empresa confirmada", "empresa"),
  // S4: só as contagens (criadas e vinculadas); nada do cadastro do OMIE vai ao evento.
  "integracoes.omie.importada": evento("Cadastros importados do OMIE da empresa", "empresa"),
  "integracoes.omie.bloqueada": evento("Conexão do OMIE da empresa bloqueada pela conferência do CNPJ", "empresa"),
  "integracoes.omie.conta_antiga_movida": evento("Conta única do OMIE movida para a empresa", "empresa"),
  "organizacao.empresa.cnpj_definido": evento("CNPJ da empresa no Plugga OS definido", "empresa"),
  // Fornecedor é cadastro único das duas empresas: o escopo é a plataforma. Sem PII, só os nomes dos campos.
  "suprimentos.fornecedor.created": evento("Fornecedor cadastrado", "plataforma"),
  "suprimentos.fornecedor.updated": evento("Fornecedor alterado", "plataforma"),
  "suprimentos.fornecedor.inactivated": evento("Fornecedor inativado", "plataforma"),
  "suprimentos.fornecedor.reactivated": evento("Fornecedor reativado", "plataforma"),
  // Quem viu os dados de pagamento completos e por quê; nunca o valor.
  "suprimentos.fornecedor.dados_de_pagamento_revelados": evento("Dados de pagamento do fornecedor revelados", "plataforma"),
  "pluggamob.settlement.approved": evento("Fechamento Pluggamob aprovado", "empresa"),
  "auth.access.changed": evento("Acesso de usuário alterado", "plataforma"),
  "auth.user.deactivated": evento("Usuário desativado", "plataforma"),
  "auth.user.removed": evento("Membro removido da equipe", "plataforma"),
  "auth.agent.created": evento("Identidade de IA criada na equipe", "plataforma"),
  "auth.agent.credential_rotated": evento("Credencial de IA emitida ou rotacionada", "plataforma"),
  "auth.agent.credential_revoked": evento("Credencial de IA revogada", "plataforma"),
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
  "email.brevo.connected",
  "email.brevo.disconnected",
  "integracao.cadastro.activated",
  "integracao.cadastro.deactivated",
  "integracao.telegram.connected",
  "integracao.telegram.disconnected",
  "integracao.autentique.connected",
  "integracao.autentique.disconnected",
  "integracao.omie.connected",
  "integracao.omie.disconnected",
  "integracao.ia_assinatura.login_started",
  "integracao.ia_assinatura.account_removed",
  "auth.password.changed",
  "google.oauth.connected",
  "google.oauth.disconnected",
  "google.calendar.connected",
  "google.calendar.disconnected",
];

/** Evento que o `AuditAppender` aceita: do catálogo novo ou legado. */
export type NomeDeEventoAuditavel = NomeDeEventoDoCatalogo | EventName;

export function eventoEstaNoCatalogo(nome: string): boolean {
  return nome in catalogoEventos || eventosLegados.includes(nome);
}
