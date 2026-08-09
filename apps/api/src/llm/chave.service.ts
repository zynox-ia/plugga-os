import { Inject, Injectable, Logger } from "@nestjs/common";

import { eventNames, type EventName } from "@plugga/shared";

import { AuditRepository } from "../audit/audit.repository";
import { cifrar, decifrar, mascarar, SegredoCorrompidoError } from "./cripto.js";
import { SegredoRepository } from "./segredo.repository.js";

/** Identificador lógico do segredo; uma linha por chave no banco. */
const CHAVE_OPENROUTER = "openrouter.api_key";

export type EstadoDaChave = {
  /** Se há chave utilizável agora, venha do banco ou do ambiente. */
  configurada: boolean;
  /** De onde a chave em uso veio — o banco tem precedência sobre o ambiente. */
  origem: "banco" | "ambiente" | "nenhuma";
  /** Só os últimos quatro caracteres; a chave nunca sai daqui. */
  mascara: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/**
 * Guarda e entrega a chave da OpenRouter.
 *
 * O banco vem primeiro e o ambiente é reserva. A ordem não é arbitrária: quem
 * troca a chave pela tela espera que ela passe a valer, e um `.env` esquecido
 * com valor antigo silenciosamente vencendo a tela seria a pior falha possível
 * — tudo continuaria funcionando, com a credencial errada, sem sinal nenhum.
 *
 * O ambiente continua servindo para dois casos legítimos: o primeiro arranque,
 * antes de existir tela e usuário; e o resgate, quando alguém grava uma chave
 * inválida e precisa de um caminho que não dependa do sistema estar de pé.
 */
@Injectable()
export class ChaveDeLlmService {
  private readonly logger = new Logger(ChaveDeLlmService.name);

  /**
   * Guardado em memória por um instante para não decifrar a cada fatura lida.
   * Curto de propósito: trocar a chave pela tela tem de valer quase na hora, e
   * cinco segundos é o que separa "não bate no banco toda chamada" de "a troca
   * demora a fazer efeito".
   */
  private cache: { valor: string | null; expiraEm: number } | null = null;
  private static readonly VALIDADE_MS = 5_000;

  constructor(
    @Inject(SegredoRepository) private readonly segredos: SegredoRepository,
    @Inject(AuditRepository) private readonly auditoria: AuditRepository,
  ) {}

  /** A chave em uso, para o gateway. Nunca vai para resposta de rota. */
  async valor(): Promise<string | null> {
    const agora = Date.now();
    if (this.cache && this.cache.expiraEm > agora) return this.cache.valor;

    let valor: string | null = null;
    try {
      const linha = await this.segredos.buscar(CHAVE_OPENROUTER);
      if (linha) {
        valor = decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag });
      }
    } catch (erro) {
      // Segredo ilegível não pode derrubar a leitura de fatura: cai para o
      // ambiente e grita no log, que é onde alguém vai procurar.
      this.logger.error(
        erro instanceof SegredoCorrompidoError
          ? "chave da OpenRouter guardada não pôde ser decifrada; usando a do ambiente, se houver"
          : `falha ao ler a chave guardada: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }

    const efetiva = valor ?? process.env.OPENROUTER_API_KEY ?? null;
    this.cache = { valor: efetiva, expiraEm: agora + ChaveDeLlmService.VALIDADE_MS };
    return efetiva;
  }

  /** O que a tela pode ver: existência, procedência e os quatro últimos dígitos. */
  async estado(): Promise<EstadoDaChave> {
    const linha = await this.segredos.buscar(CHAVE_OPENROUTER);

    if (linha) {
      return {
        configurada: true,
        origem: "banco",
        mascara: `••••${linha.ultimosQuatro}`,
        atualizadoEm: linha.atualizadoEm.toISOString(),
        atualizadoPor: linha.atualizadoPor,
      };
    }

    if (process.env.OPENROUTER_API_KEY) {
      return {
        configurada: true,
        origem: "ambiente",
        mascara: mascarar(process.env.OPENROUTER_API_KEY),
        atualizadoEm: null,
        atualizadoPor: null,
      };
    }

    return { configurada: false, origem: "nenhuma", mascara: null, atualizadoEm: null, atualizadoPor: null };
  }

  async gravar(chave: string, quem: string): Promise<EstadoDaChave> {
    const limpa = chave.trim();
    const cifrada = cifrar(limpa);

    await this.segredos.gravar({
      chave: CHAVE_OPENROUTER,
      valorCifrado: cifrada.conteudo,
      iv: cifrada.iv,
      tag: cifrada.tag,
      ultimosQuatro: limpa.slice(-4),
      atualizadoPor: quem,
    });

    this.cache = null;
    await this.registrarNaAuditoria(eventNames.llmChaveGravada, quem);
    return this.estado();
  }

  async apagar(quem: string): Promise<EstadoDaChave> {
    await this.segredos.apagar(CHAVE_OPENROUTER);
    this.cache = null;
    await this.registrarNaAuditoria(eventNames.llmChaveApagada, quem);
    return this.estado();
  }

  /**
   * Troca de credencial é evento de auditoria, não detalhe de configuração:
   * quem trocou e quando é a primeira pergunta quando a conta do mês surpreende.
   * O valor nunca entra no registro — nem cifrado.
   */
  private async registrarNaAuditoria(evento: EventName, quem: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "segredo",
        entityId: CHAVE_OPENROUTER,
        actorType: "user",
        actorId: quem,
        payload: {},
        occurredAt: new Date(),
      });
    } catch (erro) {
      this.logger.error(
        `troca de chave não auditada: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }
}
