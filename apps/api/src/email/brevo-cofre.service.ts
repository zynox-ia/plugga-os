import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eventNames, type EntradaDoBrevo, type EstadoDoBrevo, type EventName } from "@plugga/shared";

import { AuditPort } from "../audit/audit.port";
import { cifrar, decifrar } from "../llm/cripto.js";
import { SegredoRepository } from "../llm/segredo.repository.js";

/** Identificador lógico do segredo; uma linha no banco com chave, remetente e nome. */
export const CHAVE_BREVO = "email.brevo";

export type CredenciaisDoBrevo = { chave: string; remetenteNome: string; remetenteEmail: string };
export type MaterialCifrado = { valorCifrado: string; iv: string; tag: string };

/**
 * Leitura do material cifrado para o envio. É abstração porque o envio roda no
 * pool de autenticação (sem principal, sem tabelas de negócio) e só alcança o
 * cofre pela função `plugga_security.config_brevo()`, que devolve texto cifrado.
 */
export abstract class BrevoLeitura {
  abstract lerCifrado(): Promise<MaterialCifrado | null>;
}

/**
 * Brevo conectado pela tela: chave e remetente guardados cifrados no cofre.
 *
 * O cofre vem primeiro e o ambiente é reserva (mesma regra da chave de IA): quem
 * conecta pela tela espera que valha, e um `.env` esquecido não pode vencê-la.
 * A chave nunca volta numa resposta; a tela vê só os quatro últimos caracteres.
 */
@Injectable()
export class BrevoCofreService {
  private readonly logger = new Logger(BrevoCofreService.name);
  private cache: { valor: CredenciaisDoBrevo | null; expiraEm: number } | null = null;
  /** Curto de propósito: conectar ou trocar pela tela tem de valer quase na hora. */
  private static readonly VALIDADE_MS = 5_000;

  constructor(
    @Inject(SegredoRepository) private readonly segredos: SegredoRepository,
    @Inject(BrevoLeitura) private readonly leitura: BrevoLeitura,
    @Inject(AuditPort) private readonly auditoria: AuditPort,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /** O que o envio usa agora. Nunca vai para resposta de rota. */
  async credenciais(): Promise<CredenciaisDoBrevo | null> {
    const agora = Date.now();
    if (this.cache && this.cache.expiraEm > agora) return this.cache.valor;

    let valor: CredenciaisDoBrevo | null = null;
    try {
      const linha = await this.leitura.lerCifrado();
      if (linha) valor = lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
    } catch (erro) {
      // Ilegível não derruba convite nem redefinição: cai para o ambiente e grita no log.
      this.logger.error(
        `configuração do Brevo guardada não pôde ser lida: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }

    this.cache = { valor, expiraEm: agora + BrevoCofreService.VALIDADE_MS };
    return valor;
  }

  /** O que a tela pode ver: existência, procedência, remetente e os quatro últimos dígitos. */
  async estado(): Promise<EstadoDoBrevo> {
    const linha = await this.segredos.buscar(CHAVE_BREVO);
    const chaveDoAmbiente = this.config.get<string>("BREVO_API_KEY");
    const ambienteAtivo = this.config.get<string>("EMAIL_PROVIDER", "noop") === "brevo" && Boolean(chaveDoAmbiente);

    if (linha) {
      let lida: CredenciaisDoBrevo | null = null;
      try {
        lida = lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
      } catch {
        // Linha que não abre mais: dizer "em uso" seria mentir exatamente onde o admin confere.
      }
      const base = { atualizadoEm: linha.atualizadoEm.toISOString(), atualizadoPor: linha.atualizadoPor };
      if (lida) {
        return {
          conectado: true,
          origem: "cofre",
          mascara: `••••${linha.ultimosQuatro}`,
          remetente: { nome: lida.remetenteNome, email: lida.remetenteEmail },
          ...base,
        };
      }
      return { conectado: ambienteAtivo, origem: "cofre_ilegivel", mascara: null, remetente: null, ...base };
    }

    if (ambienteAtivo) {
      return {
        conectado: true,
        origem: "ambiente",
        mascara: null,
        remetente: {
          nome: this.config.get<string>("EMAIL_FROM_NAME", "plugga-os"),
          email: this.config.get<string>("EMAIL_FROM_ADDRESS", "no-reply@plugga.local"),
        },
        atualizadoEm: null,
        atualizadoPor: null,
      };
    }

    return { conectado: false, origem: "nenhuma", mascara: null, remetente: null, atualizadoEm: null, atualizadoPor: null };
  }

  async gravar(entrada: EntradaDoBrevo, quem: string): Promise<EstadoDoBrevo> {
    const chave = entrada.chave.trim();
    const cifrada = cifrar(JSON.stringify({
      chave,
      remetenteNome: entrada.remetenteNome.trim(),
      remetenteEmail: entrada.remetenteEmail.trim(),
    } satisfies CredenciaisDoBrevo));

    await this.segredos.gravar({
      chave: CHAVE_BREVO,
      valorCifrado: cifrada.conteudo,
      iv: cifrada.iv,
      tag: cifrada.tag,
      ultimosQuatro: chave.slice(-4),
      atualizadoPor: quem,
    });

    this.cache = null;
    await this.registrar(eventNames.emailBrevoConectado, quem);
    return this.estado();
  }

  async apagar(quem: string): Promise<EstadoDoBrevo> {
    await this.segredos.apagar(CHAVE_BREVO);
    this.cache = null;
    await this.registrar(eventNames.emailBrevoDesconectado, quem);
    return this.estado();
  }

  /** Troca de credencial é auditoria: quem e quando. O valor nunca entra, nem cifrado. */
  private async registrar(evento: EventName, quem: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "segredo",
        entityId: CHAVE_BREVO,
        actorType: "user",
        actorId: quem,
        payload: {},
        occurredAt: new Date(),
      });
    } catch (erro) {
      this.logger.error(`troca do Brevo não auditada: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
}

function lerCredenciais(texto: string): CredenciaisDoBrevo {
  const dados = JSON.parse(texto) as Partial<CredenciaisDoBrevo>;
  if (!dados.chave || !dados.remetenteEmail || !dados.remetenteNome) throw new Error("conteúdo do segredo incompleto");
  return { chave: dados.chave, remetenteNome: dados.remetenteNome, remetenteEmail: dados.remetenteEmail };
}
