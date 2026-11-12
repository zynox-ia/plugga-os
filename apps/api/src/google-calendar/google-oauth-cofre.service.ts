import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ESCOPOS_DO_GOOGLE_CALENDAR,
  eventNames,
  type EntradaDoGoogleOAuth,
  type EstadoDoGoogleOAuth,
  type EventName,
} from "@plugga/shared";

import { AuditPort } from "../audit/audit.port";
import { cifrar, decifrar } from "../llm/cripto.js";
import { SegredoRepository } from "../llm/segredo.repository.js";

/** Identificador lógico do segredo; uma linha com o client id e o client secret. */
export const CHAVE_GOOGLE_OAUTH = "google.oauth";

/** Caminho do retorno do consentimento no app web. Tem de bater, letra a letra, com o cadastrado no Google Cloud. */
export const CAMINHO_DE_RETORNO_DO_GOOGLE = "/api/google/calendar/callback";

export type CredenciaisDoGoogleOAuth = { clientId: string; clientSecret: string };
export type MaterialCifrado = { valorCifrado: string; iv: string; tag: string };

/**
 * Leitura do material cifrado para o fluxo de consentimento. É abstração porque
 * quem conecta a agenda é qualquer pessoa logada, que não alcança a tabela do
 * cofre: só recebe o texto cifrado, pela função `plugga_security.credenciais_google_oauth()`.
 */
export abstract class GoogleOAuthLeitura {
  abstract lerCifrado(): Promise<MaterialCifrado | null>;
}

/**
 * As credenciais do app OAuth do Google, guardadas cifradas no cofre.
 *
 * Só existe cofre: sem ambiente de reserva, porque a ausência de credencial é o
 * que mantém a conexão desligada para todo mundo. O client secret nunca volta
 * numa resposta; a tela vê o client id (público por natureza) e os quatro
 * últimos caracteres do secret.
 */
@Injectable()
export class GoogleOAuthCofreService {
  private readonly logger = new Logger(GoogleOAuthCofreService.name);
  private cache: { valor: CredenciaisDoGoogleOAuth | null; expiraEm: number } | null = null;
  /** Curto de propósito: cadastrar ou trocar pela tela tem de valer quase na hora. */
  private static readonly VALIDADE_MS = 5_000;

  constructor(
    @Inject(SegredoRepository) private readonly segredos: SegredoRepository,
    @Inject(GoogleOAuthLeitura) private readonly leitura: GoogleOAuthLeitura,
    @Inject(AuditPort) private readonly auditoria: AuditPort,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /** A URI de redirecionamento que o app OAuth precisa ter cadastrada. */
  urlDeRetorno(): string {
    const base = this.config.get<string>("AUTH_APP_BASE_URL", "http://localhost:3000").replace(/\/+$/, "");
    return `${base}${CAMINHO_DE_RETORNO_DO_GOOGLE}`;
  }

  /** O que o consentimento usa agora. Nunca vai para resposta de rota. */
  async credenciais(): Promise<CredenciaisDoGoogleOAuth | null> {
    const agora = Date.now();
    if (this.cache && this.cache.expiraEm > agora) return this.cache.valor;

    let valor: CredenciaisDoGoogleOAuth | null = null;
    try {
      const linha = await this.leitura.lerCifrado();
      if (linha) valor = lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
    } catch (erro) {
      // Ilegível ou sem chave-mestra: a conexão fica indisponível e o log avisa quem opera.
      this.logger.error(
        `credenciais do Google guardadas não puderam ser lidas: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }

    this.cache = { valor, expiraEm: agora + GoogleOAuthCofreService.VALIDADE_MS };
    return valor;
  }

  /** O que a tela do desenvolvedor pode ver. */
  async estado(): Promise<EstadoDoGoogleOAuth> {
    const linha = await this.segredos.buscar(CHAVE_GOOGLE_OAUTH);
    const base = { urlDeRetorno: this.urlDeRetorno(), escopos: ESCOPOS_DO_GOOGLE_CALENDAR };

    if (!linha) {
      return { conectado: false, origem: "nenhuma", clientId: null, mascara: null, atualizadoEm: null, atualizadoPor: null, ...base };
    }

    const auditado = { atualizadoEm: linha.atualizadoEm.toISOString(), atualizadoPor: linha.atualizadoPor };
    try {
      const lida = lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
      return { conectado: true, origem: "cofre", clientId: lida.clientId, mascara: `••••${linha.ultimosQuatro}`, ...auditado, ...base };
    } catch {
      // Linha que não abre mais: dizer "conectado" seria mentir exatamente onde o desenvolvedor confere.
      return { conectado: false, origem: "cofre_ilegivel", clientId: null, mascara: null, ...auditado, ...base };
    }
  }

  async gravar(entrada: EntradaDoGoogleOAuth, quem: string): Promise<EstadoDoGoogleOAuth> {
    const clientSecret = entrada.clientSecret.trim();
    const cifrada = cifrar(JSON.stringify({
      clientId: entrada.clientId.trim(),
      clientSecret,
    } satisfies CredenciaisDoGoogleOAuth));

    await this.segredos.gravar({
      chave: CHAVE_GOOGLE_OAUTH,
      valorCifrado: cifrada.conteudo,
      iv: cifrada.iv,
      tag: cifrada.tag,
      ultimosQuatro: clientSecret.slice(-4),
      atualizadoPor: quem,
    });

    this.cache = null;
    await this.registrar(eventNames.googleOAuthConectado, quem);
    return this.estado();
  }

  async apagar(quem: string): Promise<EstadoDoGoogleOAuth> {
    await this.segredos.apagar(CHAVE_GOOGLE_OAUTH);
    this.cache = null;
    await this.registrar(eventNames.googleOAuthDesconectado, quem);
    return this.estado();
  }

  /** Troca de credencial é auditoria: quem e quando. O valor nunca entra, nem cifrado. */
  private async registrar(evento: EventName, quem: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "segredo",
        entityId: CHAVE_GOOGLE_OAUTH,
        actorType: "user",
        actorId: quem,
        payload: {},
        occurredAt: new Date(),
      });
    } catch (erro) {
      this.logger.error(`troca das credenciais do Google não auditada: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
}

function lerCredenciais(texto: string): CredenciaisDoGoogleOAuth {
  const dados = JSON.parse(texto) as Partial<CredenciaisDoGoogleOAuth>;
  if (!dados.clientId || !dados.clientSecret) throw new Error("conteúdo do segredo incompleto");
  return { clientId: dados.clientId, clientSecret: dados.clientSecret };
}
