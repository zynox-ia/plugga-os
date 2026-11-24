/**
 * A porta para o Google: OAuth 2.0 da agenda e eventos do Google Calendar.
 *
 * Existe para que nada fora do adaptador real fale com o Google. Os serviços
 * dependem desta classe; o teste usa o adaptador falso (`GoogleCalendarFake`) e
 * a aplicação usa o adaptador HTTP (`GoogleCalendarHttpAdapter`). Nenhum método
 * recebe nem devolve o que não precisa: token só entra e sai por aqui, e quem
 * chama nunca o registra nem o devolve numa resposta.
 */

/** O que o Google devolve ao trocar o código de autorização por tokens. */
export type TokensDoGoogle = {
  accessToken: string;
  /** Vem no primeiro consentimento ou quando se força `prompt=consent`; sem ele não há conexão permanente. */
  refreshToken: string | null;
  expiraEmSegundos: number;
  /** Escopos de fato concedidos: a pessoa pode desmarcar a agenda no consentimento. */
  escopos: string[];
  /** E-mail verificado da conta, lido do id_token; `null` se o Google não o confirmou. */
  email: string | null;
};

export type AcessoRenovado = { accessToken: string; expiraEmSegundos: number };

export type CredenciaisDoApp = { clientId: string; clientSecret: string };

export type EntradaDaTroca = CredenciaisDoApp & {
  code: string;
  /** O segredo do PKCE, guardado no state selado desde o início do consentimento. */
  codeVerifier: string;
  redirectUri: string;
};

/** Um compromisso na agenda. Só o que a sincronização vai precisar. */
export type EventoDeAgenda = {
  /**
   * Identificador estável no Google (letras a-v minúsculas e dígitos, de 5 a 1024
   * caracteres). Com ele a criação é idempotente: repetir devolve conflito, não
   * um segundo evento.
   */
  id?: string;
  titulo: string;
  descricao?: string;
  local?: string;
  inicio: Date;
  fim: Date;
  /** Fuso IANA para exibir o horário, ex.: `America/Manaus`. */
  fusoHorario: string;
  /** Propriedades privadas do evento, para o sistema reencontrá-lo (ex.: a identidade da atividade). */
  propriedadesPrivadas?: Record<string, string>;
};

export type EventoNaAgenda = { id: string; link: string | null };

/** Falha de uma chamada ao Google. Carrega só o status e o código curto do erro, nunca o corpo da resposta. */
export class GoogleApiError extends Error {
  constructor(
    readonly operacao: string,
    /** `null` quando nem houve resposta (rede, tempo esgotado). */
    readonly status: number | null,
    readonly codigo: string | null,
  ) {
    super(`google ${operacao} falhou (${status === null ? "sem resposta" : `HTTP ${status}`}${codigo ? `, ${codigo}` : ""})`);
    this.name = "GoogleApiError";
  }

  /** O token de renovação foi revogado ou expirou: só uma nova autorização resolve. */
  get autorizacaoPerdida(): boolean {
    return this.codigo === "invalid_grant";
  }

  /** O evento já não existe na agenda. */
  get inexistente(): boolean {
    return this.status === 404 || this.status === 410;
  }
}

export abstract class GoogleCalendarPort {
  /** Troca o código do consentimento (com o verificador do PKCE) por tokens. */
  abstract trocarCodigo(entrada: EntradaDaTroca): Promise<TokensDoGoogle>;

  /** Obtém um access token novo a partir do token de renovação. */
  abstract renovarAcesso(entrada: CredenciaisDoApp & { refreshToken: string }): Promise<AcessoRenovado>;

  /** Revoga um token (de renovação ou de acesso). Revogar o que já foi revogado não é erro. */
  abstract revogar(token: string): Promise<void>;

  // A seguir, a interface para a sincronização de atividades. Ainda sem uso.

  abstract criarEvento(acesso: string, evento: EventoDeAgenda, agenda?: string): Promise<EventoNaAgenda>;

  abstract atualizarEvento(acesso: string, idDoEvento: string, evento: EventoDeAgenda, agenda?: string): Promise<EventoNaAgenda>;

  /** Remover um evento que já não existe não é erro. */
  abstract removerEvento(acesso: string, idDoEvento: string, agenda?: string): Promise<void>;
}

/** A agenda principal da conta conectada. */
export const AGENDA_PRINCIPAL = "primary";
