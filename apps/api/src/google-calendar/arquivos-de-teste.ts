/**
 * Peças de teste da integração com o Google: o Google de mentira e os
 * repositórios em memória. Fora do build de produção (ver `tsconfig.build.json`):
 * nada daqui é ligado na aplicação.
 */
import { vi } from "vitest";

import type { AuditPort } from "../audit/audit.port";
import { SegredoRepository, type GravarSegredo, type SegredoGuardado } from "../llm/segredo.repository.js";
import { ConexaoGoogleCalendarRepository, type ConexaoGuardada, type GravarConexao } from "./conexao-google-calendar.repository";
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
import { GoogleOAuthLeitura, type MaterialCifrado } from "./google-oauth-cofre.service";

/** O que o Google devolveria a um consentimento completo, com valores sintéticos. */
export const TOKENS_SINTETICOS: TokensDoGoogle = {
  accessToken: "access-sintetico-0001",
  refreshToken: "refresh-sintetico-0001",
  expiraEmSegundos: 3_600,
  escopos: ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/calendar.events"],
  email: "pessoa@exemplo.test",
};

/**
 * O Google de mentira: guarda tudo em memória e nunca toca a rede. Cada chamada
 * fica em `chamadas`, para o teste conferir o que sairia para o Google (e que o
 * que não deve sair não saiu).
 */
export class GoogleCalendarFake extends GoogleCalendarPort {
  readonly chamadas: { operacao: string; entrada: unknown }[] = [];
  readonly eventos = new Map<string, EventoDeAgenda>();
  readonly tokensRevogados: string[] = [];

  /** O que a próxima troca de código devolve; um erro faz a troca falhar. */
  respostaDaTroca: TokensDoGoogle | GoogleApiError = TOKENS_SINTETICOS;
  /** Faz a revogação falhar, como numa queda do Google. */
  falhaAoRevogar: GoogleApiError | null = null;
  /** Faz a renovação do acesso falhar, como num token revogado pela pessoa no Google. */
  falhaAoRenovar: GoogleApiError | null = null;

  private sequencia = 0;

  async trocarCodigo(entrada: EntradaDaTroca): Promise<TokensDoGoogle> {
    this.chamadas.push({ operacao: "trocarCodigo", entrada });
    if (this.respostaDaTroca instanceof GoogleApiError) throw this.respostaDaTroca;
    return this.respostaDaTroca;
  }

  async renovarAcesso(entrada: CredenciaisDoApp & { refreshToken: string }): Promise<AcessoRenovado> {
    this.chamadas.push({ operacao: "renovarAcesso", entrada });
    if (this.falhaAoRenovar) throw this.falhaAoRenovar;
    return { accessToken: `access-renovado-${++this.sequencia}`, expiraEmSegundos: 3_600 };
  }

  async revogar(token: string): Promise<void> {
    this.chamadas.push({ operacao: "revogar", entrada: token });
    if (this.falhaAoRevogar) throw this.falhaAoRevogar;
    this.tokensRevogados.push(token);
  }

  async criarEvento(acesso: string, evento: EventoDeAgenda, agenda = AGENDA_PRINCIPAL): Promise<EventoNaAgenda> {
    this.chamadas.push({ operacao: "criarEvento", entrada: { acesso, evento, agenda } });
    const id = evento.id ?? `evento${++this.sequencia}`;
    if (this.eventos.has(id)) throw new GoogleApiError("criação de evento", 409, "duplicate");
    this.eventos.set(id, evento);
    return { id, link: `https://calendar.exemplo.test/evento/${id}` };
  }

  async atualizarEvento(acesso: string, idDoEvento: string, evento: EventoDeAgenda, agenda = AGENDA_PRINCIPAL): Promise<EventoNaAgenda> {
    this.chamadas.push({ operacao: "atualizarEvento", entrada: { acesso, idDoEvento, evento, agenda } });
    if (!this.eventos.has(idDoEvento)) throw new GoogleApiError("atualização de evento", 404, "notFound");
    this.eventos.set(idDoEvento, evento);
    return { id: idDoEvento, link: `https://calendar.exemplo.test/evento/${idDoEvento}` };
  }

  async removerEvento(acesso: string, idDoEvento: string, agenda = AGENDA_PRINCIPAL): Promise<void> {
    this.chamadas.push({ operacao: "removerEvento", entrada: { acesso, idDoEvento, agenda } });
    this.eventos.delete(idDoEvento);
  }
}

/** O cofre de segredos em memória. */
export class SegredosEmMemoria extends SegredoRepository {
  linha: SegredoGuardado | null = null;

  async buscar(): Promise<SegredoGuardado | null> {
    return this.linha;
  }
  async gravar(dados: GravarSegredo): Promise<void> {
    this.linha = { ...dados, atualizadoEm: new Date("2026-11-13T10:00:00Z") };
  }
  async apagar(): Promise<void> {
    this.linha = null;
  }
}

/** A leitura restrita (só o texto cifrado) em memória, sobre o mesmo cofre. */
export class LeituraDeCredenciaisEmMemoria extends GoogleOAuthLeitura {
  constructor(private readonly segredos: SegredosEmMemoria) {
    super();
  }
  async lerCifrado(): Promise<MaterialCifrado | null> {
    const linha = this.segredos.linha;
    return linha ? { valorCifrado: linha.valorCifrado, iv: linha.iv, tag: linha.tag } : null;
  }
}

/** As conexões em memória, uma por pessoa. */
export class ConexoesEmMemoria extends ConexaoGoogleCalendarRepository {
  readonly linhas = new Map<string, ConexaoGuardada>();
  /** Faz a próxima gravação falhar, como numa queda do banco. */
  falhaAoGravar: Error | null = null;

  async buscar(userId: string): Promise<ConexaoGuardada | null> {
    return this.linhas.get(userId) ?? null;
  }
  async gravar(dados: GravarConexao): Promise<void> {
    if (this.falhaAoGravar) throw this.falhaAoGravar;
    this.linhas.set(dados.userId, { ...dados, conectadoEm: new Date("2026-11-13T12:00:00Z") });
  }
  async apagar(userId: string): Promise<void> {
    this.linhas.delete(userId);
  }
}

export type EventoRegistrado = { eventName: string; entityId: string; actorId: string | null; payload: unknown };

/** A auditoria em memória: guarda os eventos para o teste conferir. */
export function auditoriaEmMemoria(): { porta: AuditPort; eventos: EventoRegistrado[] } {
  const eventos: EventoRegistrado[] = [];
  const porta = {
    appendEvent: vi.fn(async (evento: EventoRegistrado) => {
      eventos.push(evento);
    }),
    appendTrail: vi.fn(),
  } as unknown as AuditPort;
  return { porta, eventos };
}
