import { Injectable } from "@nestjs/common";

import {
  AGENDA_PRINCIPAL,
  GoogleApiError,
  GoogleCalendarPort,
  type AcessoRenovado,
  type CredenciaisDoApp,
  type EntradaDaTroca,
  type EventoDeAgenda,
  type EventoNaAgenda,
  type TokensDoGoogle,
} from "./google-calendar.port";

const OAUTH = "https://oauth2.googleapis.com";
const CALENDAR = "https://www.googleapis.com/calendar/v3";
const TEMPO_MAXIMO_MS = 10_000;
const EMISSORES_DO_GOOGLE = new Set(["https://accounts.google.com", "accounts.google.com"]);

/**
 * O Google de verdade, por `fetch` nos endpoints oficiais. Só roda quando a
 * plataforma cadastrou as credenciais do app e uma pessoa conecta ou usa a
 * própria agenda; sem credencial nada chega aqui.
 *
 * O corpo de uma resposta de erro nunca entra na exceção: só o status e um
 * código curto (`invalid_grant`, `notFound`...). Token e segredo não aparecem em
 * mensagem de erro nem em log.
 */
@Injectable()
export class GoogleCalendarHttpAdapter extends GoogleCalendarPort {
  async trocarCodigo(entrada: EntradaDaTroca): Promise<TokensDoGoogle> {
    const resposta = await this.pedir("troca de código", `${OAUTH}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: entrada.code,
        code_verifier: entrada.codeVerifier,
        redirect_uri: entrada.redirectUri,
        client_id: entrada.clientId,
        client_secret: entrada.clientSecret,
      }),
    });
    const dados = await lerJson(resposta, "troca de código");

    const accessToken = texto(dados.access_token);
    if (!accessToken) throw new GoogleApiError("troca de código", resposta.status, "resposta_invalida");
    return {
      accessToken,
      refreshToken: texto(dados.refresh_token) ?? null,
      expiraEmSegundos: numero(dados.expires_in) ?? 3_600,
      escopos: (texto(dados.scope) ?? "").split(/\s+/).filter(Boolean),
      email: emailDoIdToken(texto(dados.id_token), entrada.clientId),
    };
  }

  async renovarAcesso(entrada: CredenciaisDoApp & { refreshToken: string }): Promise<AcessoRenovado> {
    const resposta = await this.pedir("renovação do acesso", `${OAUTH}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: entrada.refreshToken,
        client_id: entrada.clientId,
        client_secret: entrada.clientSecret,
      }),
    });
    const dados = await lerJson(resposta, "renovação do acesso");

    const accessToken = texto(dados.access_token);
    if (!accessToken) throw new GoogleApiError("renovação do acesso", resposta.status, "resposta_invalida");
    return { accessToken, expiraEmSegundos: numero(dados.expires_in) ?? 3_600 };
  }

  async revogar(token: string): Promise<void> {
    try {
      await this.pedir("revogação", `${OAUTH}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch (erro) {
      // O Google responde 400 `invalid_token` para o que já foi revogado: o estado final é o desejado.
      if (erro instanceof GoogleApiError && erro.status === 400 && erro.codigo === "invalid_token") return;
      throw erro;
    }
  }

  async criarEvento(acesso: string, evento: EventoDeAgenda, agenda = AGENDA_PRINCIPAL): Promise<EventoNaAgenda> {
    const resposta = await this.pedir("criação de evento", urlDosEventos(agenda), {
      method: "POST",
      headers: cabecalhosDaAgenda(acesso),
      body: JSON.stringify(corpoDoEvento(evento, true)),
    });
    return eventoCriado(await lerJson(resposta, "criação de evento"), resposta.status, "criação de evento");
  }

  async atualizarEvento(acesso: string, idDoEvento: string, evento: EventoDeAgenda, agenda = AGENDA_PRINCIPAL): Promise<EventoNaAgenda> {
    // PATCH, não PUT: o que a pessoa acrescentou ao evento no Google (convidados, anexos) não é apagado.
    const resposta = await this.pedir("atualização de evento", urlDosEventos(agenda, idDoEvento), {
      method: "PATCH",
      headers: cabecalhosDaAgenda(acesso),
      body: JSON.stringify(corpoDoEvento(evento, false)),
    });
    return eventoCriado(await lerJson(resposta, "atualização de evento"), resposta.status, "atualização de evento");
  }

  async removerEvento(acesso: string, idDoEvento: string, agenda = AGENDA_PRINCIPAL): Promise<void> {
    try {
      await this.pedir("remoção de evento", urlDosEventos(agenda, idDoEvento), {
        method: "DELETE",
        headers: { authorization: `Bearer ${acesso}`, accept: "application/json" },
      });
    } catch (erro) {
      if (erro instanceof GoogleApiError && erro.inexistente) return;
      throw erro;
    }
  }

  private async pedir(operacao: string, url: string, init: RequestInit): Promise<Response> {
    let resposta: Response;
    try {
      // Redirecionamento não é esperado em nenhum destes endpoints: recusar evita levar o token a outro destino.
      resposta = await fetch(url, { ...init, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS), redirect: "error" });
    } catch (erro) {
      const nome = erro instanceof Error ? erro.name : "";
      throw new GoogleApiError(operacao, null, nome === "TimeoutError" || nome === "AbortError" ? "timeout" : "rede");
    }
    if (!resposta.ok) throw new GoogleApiError(operacao, resposta.status, await codigoDoErro(resposta));
    return resposta;
  }
}

function urlDosEventos(agenda: string, idDoEvento?: string): string {
  const base = `${CALENDAR}/calendars/${encodeURIComponent(agenda)}/events`;
  return idDoEvento === undefined ? base : `${base}/${encodeURIComponent(idDoEvento)}`;
}

function cabecalhosDaAgenda(acesso: string): Record<string, string> {
  return { authorization: `Bearer ${acesso}`, "content-type": "application/json", accept: "application/json" };
}

function corpoDoEvento(evento: EventoDeAgenda, comId: boolean): Record<string, unknown> {
  return {
    ...(comId && evento.id ? { id: evento.id } : {}),
    summary: evento.titulo,
    ...(evento.descricao !== undefined ? { description: evento.descricao } : {}),
    ...(evento.local !== undefined ? { location: evento.local } : {}),
    start: { dateTime: evento.inicio.toISOString(), timeZone: evento.fusoHorario },
    end: { dateTime: evento.fim.toISOString(), timeZone: evento.fusoHorario },
    ...(evento.propriedadesPrivadas ? { extendedProperties: { private: evento.propriedadesPrivadas } } : {}),
  };
}

function eventoCriado(dados: Record<string, unknown>, status: number, operacao: string): EventoNaAgenda {
  const id = texto(dados.id);
  if (!id) throw new GoogleApiError(operacao, status, "resposta_invalida");
  return { id, link: texto(dados.htmlLink) ?? null };
}

async function lerJson(resposta: Response, operacao: string): Promise<Record<string, unknown>> {
  try {
    const dados: unknown = await resposta.json();
    if (dados && typeof dados === "object" && !Array.isArray(dados)) return dados as Record<string, unknown>;
  } catch {
    // Corpo que não é JSON cai no erro abaixo, sem o conteúdo.
  }
  throw new GoogleApiError(operacao, resposta.status, "resposta_invalida");
}

/** Só um código curto e seguro do erro do Google; qualquer outra coisa é descartada. */
async function codigoDoErro(resposta: Response): Promise<string | null> {
  try {
    const dados = (await resposta.json()) as { error?: unknown };
    const bruto = typeof dados.error === "string"
      ? dados.error
      : dados.error && typeof dados.error === "object"
        ? (dados.error as { status?: unknown; errors?: { reason?: unknown }[] }).status
          ?? (dados.error as { errors?: { reason?: unknown }[] }).errors?.[0]?.reason
        : undefined;
    return typeof bruto === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(bruto) ? bruto : null;
  } catch {
    return null;
  }
}

/**
 * O e-mail da conta, do id_token recebido DIRETAMENTE do endpoint de tokens do
 * Google, por TLS e em resposta a um código que só o nosso client secret troca.
 * Nesse caminho o OIDC dispensa validar a assinatura; ainda assim conferem-se o
 * emissor e a audiência, e só vale e-mail que o Google marcou como verificado.
 */
function emailDoIdToken(idToken: string | undefined, clientId: string): string | null {
  const partes = idToken?.split(".");
  if (!partes || partes.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(partes[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
    const verificado = claims.email_verified === true || claims.email_verified === "true";
    const audiencia = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (typeof claims.iss !== "string" || !EMISSORES_DO_GOOGLE.has(claims.iss) || !audiencia.includes(clientId)) return null;
    return verificado && typeof claims.email === "string" && claims.email.length > 0 ? claims.email : null;
  } catch {
    return null;
  }
}

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}

function numero(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}
