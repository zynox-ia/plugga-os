import { Inject, Injectable, Logger } from "@nestjs/common";
import { eventNames, type EntradaDoTelegram, type EstadoDoTelegram, type EventName } from "@plugga/shared";

import { AuditPort } from "../audit/audit.port";
import { cifrar, decifrar } from "../llm/cripto.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { TelegramPort } from "./telegram.port";

/** Uma linha cifrada no cofre com token, chat e quais avisos estão ligados. */
export const CHAVE_TELEGRAM = "integracao.telegram";

export type CredenciaisDoTelegram = EntradaDoTelegram;
export type MaterialCifrado = { valorCifrado: string; iv: string; tag: string };

/**
 * Leitura do material cifrado para o envio. É abstração porque quem avisa pode ser
 * uma requisição qualquer (um lead novo) ou uma rotina, e nenhuma delas alcança a
 * tabela do cofre: recebem só o texto cifrado, por `plugga_security.config_telegram()`.
 */
export abstract class TelegramLeitura {
  abstract lerCifrado(): Promise<MaterialCifrado | null>;
}

/**
 * Telegram conectado pela plataforma: token e chat guardados cifrados no cofre,
 * que vence qualquer ambiente. O token é escrita-apenas; a tela vê os quatro
 * últimos caracteres. Conectar e desconectar viram auditoria, sem o token.
 */
@Injectable()
export class TelegramCofreService {
  private readonly logger = new Logger(TelegramCofreService.name);
  private cache: { valor: CredenciaisDoTelegram | null; expiraEm: number } | null = null;
  /** Curto de propósito: conectar ou desligar um aviso pela tela tem de valer quase na hora. */
  private static readonly VALIDADE_MS = 5_000;

  constructor(
    @Inject(SegredoRepository) private readonly segredos: SegredoRepository,
    @Inject(TelegramLeitura) private readonly leitura: TelegramLeitura,
    @Inject(TelegramPort) private readonly telegram: TelegramPort,
    @Inject(AuditPort) private readonly auditoria: AuditPort,
  ) {}

  /** O que o envio usa agora. Nunca vai para resposta de rota. */
  async credenciais(): Promise<CredenciaisDoTelegram | null> {
    const agora = Date.now();
    if (this.cache && this.cache.expiraEm > agora) return this.cache.valor;

    let valor: CredenciaisDoTelegram | null = null;
    try {
      const linha = await this.leitura.lerCifrado();
      if (linha) valor = lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
    } catch (erro) {
      // Ilegível não pode derrubar quem avisa: sem aviso, e grita no log (sem o conteúdo).
      this.logger.error(`configuração do Telegram guardada não pôde ser lida: ${erro instanceof Error ? erro.message : String(erro)}`);
    }

    this.cache = { valor, expiraEm: agora + TelegramCofreService.VALIDADE_MS };
    return valor;
  }

  async estado(): Promise<EstadoDoTelegram> {
    const linha = await this.segredos.buscar(CHAVE_TELEGRAM);
    const vazio = { chatId: null, avisarNovoLead: false, avisarAtividadeAtrasada: false };
    if (!linha) return { conectado: false, origem: "nenhuma", mascara: null, ...vazio, atualizadoEm: null, atualizadoPor: null };

    const base = { atualizadoEm: linha.atualizadoEm.toISOString(), atualizadoPor: linha.atualizadoPor };
    try {
      const lida = lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
      return {
        conectado: true,
        origem: "cofre",
        mascara: `••••${linha.ultimosQuatro}`,
        chatId: lida.chatId,
        avisarNovoLead: lida.avisarNovoLead,
        avisarAtividadeAtrasada: lida.avisarAtividadeAtrasada,
        ...base,
      };
    } catch {
      // Linha que não abre mais: dizer "conectado" seria mentir onde o admin confere.
      return { conectado: false, origem: "cofre_ilegivel", mascara: null, ...vazio, ...base };
    }
  }

  async gravar(entrada: EntradaDoTelegram, quem: string): Promise<EstadoDoTelegram> {
    const cifrada = cifrar(JSON.stringify(entrada satisfies CredenciaisDoTelegram));
    await this.segredos.gravar({
      chave: CHAVE_TELEGRAM,
      valorCifrado: cifrada.conteudo,
      iv: cifrada.iv,
      tag: cifrada.tag,
      ultimosQuatro: entrada.token.slice(-4),
      atualizadoPor: quem,
    });
    this.cache = null;
    await this.registrar(eventNames.telegramConectado, quem);
    return this.estado();
  }

  async apagar(quem: string): Promise<EstadoDoTelegram> {
    await this.segredos.apagar(CHAVE_TELEGRAM);
    this.cache = null;
    await this.registrar(eventNames.telegramDesconectado, quem);
    return this.estado();
  }

  /** Manda uma mensagem de teste com a conexão atual. Só a pedido do desenvolvedor, pela tela. */
  async enviarTeste(): Promise<void> {
    const credenciais = await this.credenciais();
    if (!credenciais) throw new Error("Telegram não está conectado");
    await this.telegram.enviar(
      credenciais.token,
      credenciais.chatId,
      "<b>Teste de conexão</b>\nSe você recebeu esta mensagem, o Telegram está conectado ao Plugga OS.",
    );
  }

  private async registrar(evento: EventName, quem: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "segredo",
        entityId: CHAVE_TELEGRAM,
        actorType: "user",
        actorId: quem,
        payload: {},
        occurredAt: new Date(),
      });
    } catch (erro) {
      this.logger.error(`troca do Telegram não auditada: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
}

function lerCredenciais(texto: string): CredenciaisDoTelegram {
  const d = JSON.parse(texto) as Partial<CredenciaisDoTelegram>;
  if (!d.token || !d.chatId || typeof d.avisarNovoLead !== "boolean" || typeof d.avisarAtividadeAtrasada !== "boolean") {
    throw new Error("conteúdo do segredo incompleto");
  }
  return { token: d.token, chatId: d.chatId, avisarNovoLead: d.avisarNovoLead, avisarAtividadeAtrasada: d.avisarAtividadeAtrasada };
}
