import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  ESCOPO_AGENDA_DO_GOOGLE,
  ESCOPOS_DO_GOOGLE_CALENDAR,
  eventNames,
  type AutorizacaoDoGoogleCalendar,
  type EntradaDeRetornoDoGoogle,
  type EstadoDoGoogleCalendar,
  type EventName,
} from "@plugga/shared";

import { AuditPort } from "../audit/audit.port";
import { EstadoInvalido, RequisicaoInvalida, ServicoIndisponivel } from "../common/errors/dominio";
import { cifrar, decifrar } from "../llm/cripto.js";
import { ConexaoGoogleCalendarRepository, type ConexaoGuardada } from "./conexao-google-calendar.repository";
import { GoogleApiError, GoogleCalendarPort, type TokensDoGoogle } from "./google-calendar.port";
import { GoogleOAuthCofreService } from "./google-oauth-cofre.service";
import { abrirState, novoPkce, selarState } from "./google-oauth-state";

/** Onde o navegador da pessoa autoriza. É um endereço de navegação, não uma chamada do servidor. */
const URL_DE_AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";

/** Resposta única para qualquer state recusado: não diz se foi adulterado, expirado ou de outra pessoa. */
const PEDIDO_INVALIDO = "O pedido de conexão expirou ou não é válido. Comece de novo.";

/** Quem pede: a pessoa e a sessão que a autentica (para amarrar o state a esta sessão). */
export type PedidoDaSessao = { userId: string; sessaoHash: string };

/**
 * A agenda do Google de cada pessoa: iniciar o consentimento, concluí-lo e
 * desconectar. Tudo é da própria pessoa; o banco (RLS) também só entrega a ela a
 * própria conexão.
 *
 * O token de renovação fica cifrado e nunca volta numa resposta, nem entra em
 * log ou em mensagem de erro.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    @Inject(ConexaoGoogleCalendarRepository) private readonly conexoes: ConexaoGoogleCalendarRepository,
    @Inject(GoogleOAuthCofreService) private readonly cofre: GoogleOAuthCofreService,
    @Inject(GoogleCalendarPort) private readonly google: GoogleCalendarPort,
    @Inject(AuditPort) private readonly auditoria: AuditPort,
  ) {}

  async estado(userId: string): Promise<EstadoDoGoogleCalendar> {
    const [credenciais, conexao] = await Promise.all([this.cofre.credenciais(), this.conexoes.buscar(userId)]);
    const disponivel = credenciais !== null;

    // Uma conexão cujo token já não abre (chave-mestra trocada) não é conexão: dizer
    // "conectado" esconderia o problema. Conectar de novo a substitui.
    if (conexao && tokenLegivel(conexao)) {
      return { disponivel, conectado: true, email: conexao.googleEmail, conectadoEm: conexao.conectadoEm.toISOString() };
    }
    return { disponivel, conectado: false, email: null, conectadoEm: null };
  }

  /** Monta o endereço do consentimento do Google: PKCE, state selado e acesso offline. */
  async iniciar(pedido: PedidoDaSessao): Promise<AutorizacaoDoGoogleCalendar> {
    const credenciais = await this.cofre.credenciais();
    if (!credenciais) throw new EstadoInvalido("A conexão com o Google ainda não foi habilitada pela plataforma.");

    const { codeVerifier, codeChallenge } = novoPkce();
    const url = new URL(URL_DE_AUTORIZACAO);
    url.search = new URLSearchParams({
      client_id: credenciais.clientId,
      redirect_uri: this.cofre.urlDeRetorno(),
      response_type: "code",
      scope: ESCOPOS_DO_GOOGLE_CALENDAR.join(" "),
      state: selarState({ userId: pedido.userId, sessaoHash: pedido.sessaoHash, codeVerifier }),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      // Sem `offline` não há token de renovação; sem `consent` o Google só o entrega na primeira vez.
      access_type: "offline",
      prompt: "consent",
    }).toString();
    return { url: url.toString() };
  }

  /** O retorno do Google: confere o state, troca o código por tokens e guarda o de renovação, cifrado. */
  async concluir(pedido: PedidoDaSessao, entrada: EntradaDeRetornoDoGoogle): Promise<EstadoDoGoogleCalendar> {
    const credenciais = await this.cofre.credenciais();
    if (!credenciais) throw new EstadoInvalido("A conexão com o Google ainda não foi habilitada pela plataforma.");

    const state = abrirState(entrada.state, pedido);
    if (!state) throw new RequisicaoInvalida(PEDIDO_INVALIDO);

    let tokens: TokensDoGoogle;
    try {
      tokens = await this.google.trocarCodigo({
        ...credenciais,
        code: entrada.code,
        codeVerifier: state.codeVerifier,
        redirectUri: this.cofre.urlDeRetorno(),
      });
    } catch (erro) {
      throw this.erroDaTroca(erro);
    }

    const recusa = this.motivoDeRecusa(tokens);
    if (recusa) {
      // O Google já emitiu o que emitiu: não deixar uma autorização que o sistema não vai usar.
      await this.revogarSemFalhar(tokens.refreshToken ?? tokens.accessToken);
      throw new RequisicaoInvalida(recusa);
    }
    const refreshToken = tokens.refreshToken as string;
    const email = tokens.email as string;

    const cifrado = cifrar(JSON.stringify({ u: pedido.userId, t: refreshToken }));
    try {
      await this.conexoes.gravar({
        userId: pedido.userId,
        googleEmail: email,
        escopos: tokens.escopos.join(" "),
        refreshTokenCifrado: cifrado.conteudo,
        iv: cifrado.iv,
        tag: cifrado.tag,
      });
    } catch (erro) {
      await this.revogarSemFalhar(refreshToken);
      throw erro;
    }

    await this.registrar(eventNames.googleCalendarConectado, pedido.userId);
    return this.estado(pedido.userId);
  }

  /**
   * Desconecta: revoga o token no Google e apaga o daqui. A conexão some mesmo se
   * a revogação falhar (Google fora do ar, token já revogado): o que a pessoa pediu
   * é parar de ter a agenda ligada, e manter o token guardado seria o oposto.
   */
  async desconectar(userId: string): Promise<EstadoDoGoogleCalendar> {
    const conexao = await this.conexoes.buscar(userId);
    if (conexao) {
      try {
        await this.google.revogar(lerToken(conexao));
      } catch (erro) {
        // Só o status e o código curto; o token nunca entra na mensagem.
        this.logger.warn(`revogação no Google não concluída ao desconectar: ${descricaoDoErro(erro)}`);
      }
      await this.conexoes.apagar(userId);
      await this.registrar(eventNames.googleCalendarDesconectado, userId);
    }
    return this.estado(userId);
  }

  private motivoDeRecusa(tokens: { refreshToken: string | null; escopos: string[]; email: string | null }): string | null {
    if (!tokens.escopos.includes(ESCOPO_AGENDA_DO_GOOGLE)) {
      return "O acesso à agenda não foi permitido. Conecte de novo e marque a permissão da agenda.";
    }
    if (!tokens.refreshToken) {
      return "O Google não concedeu a autorização permanente. Conecte de novo e aceite todas as permissões.";
    }
    if (!tokens.email) return "Não foi possível identificar a conta Google. Conecte de novo.";
    return null;
  }

  private erroDaTroca(erro: unknown): Error {
    if (erro instanceof GoogleApiError) {
      // Código vencido, repetido ou de outro redirecionamento: é do pedido, não do Google.
      if (erro.autorizacaoPerdida) return new RequisicaoInvalida(PEDIDO_INVALIDO);
      if (erro.codigo === "invalid_client" || erro.codigo === "unauthorized_client") {
        return new ServicoIndisponivel("O Google recusou as credenciais do app. Avise o desenvolvedor.", erro);
      }
    }
    return new ServicoIndisponivel("Não foi possível falar com o Google agora. Tente de novo em instantes.", erro);
  }

  private async revogarSemFalhar(token: string): Promise<void> {
    try {
      await this.google.revogar(token);
    } catch (erro) {
      this.logger.warn(`revogação no Google não concluída: ${descricaoDoErro(erro)}`);
    }
  }

  /** Conectar e desconectar são auditoria: quem e quando. Token e e-mail nunca entram. */
  private async registrar(evento: EventName, userId: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "conexao_google_calendar",
        entityId: userId,
        actorType: "user",
        actorId: userId,
        payload: {},
        occurredAt: new Date(),
      });
    } catch (erro) {
      this.logger.error(`conexão do Google Calendar não auditada: ${descricaoDoErro(erro)}`);
    }
  }
}

/** Decifra o token de renovação e confere que ele é desta pessoa (defesa contra linha trocada no banco). */
function lerToken(conexao: ConexaoGuardada): string {
  const dados = JSON.parse(decifrar({ conteudo: conexao.refreshTokenCifrado, iv: conexao.iv, tag: conexao.tag })) as {
    u?: unknown;
    t?: unknown;
  };
  if (dados.u !== conexao.userId || typeof dados.t !== "string" || dados.t.length === 0) {
    throw new Error("conteúdo da conexão incompleto ou de outra pessoa");
  }
  return dados.t;
}

function tokenLegivel(conexao: ConexaoGuardada): boolean {
  try {
    lerToken(conexao);
    return true;
  } catch {
    return false;
  }
}

/** Texto seguro para log: o `GoogleApiError` já só carrega status e código curto. */
function descricaoDoErro(erro: unknown): string {
  return erro instanceof GoogleApiError ? erro.message : erro instanceof Error ? erro.name : "erro desconhecido";
}
