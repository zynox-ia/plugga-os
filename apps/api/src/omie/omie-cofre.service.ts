import { Inject, Injectable, Logger } from "@nestjs/common";
import { eventNames, type EmpresaDoOmie, type EntradaDoOmie, type EstadoDoOmie, type EventName } from "@plugga/shared";

import { AuditPort } from "../audit/audit.port";
import { cifrar, decifrar } from "../llm/cripto.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { OmiePort, type CredenciaisDoOmie } from "./omie.port";

/** Uma linha cifrada no cofre: a conta do OMIE é uma só para a plataforma. */
export const CHAVE_OMIE = "integracao.omie";

export type MaterialCifrado = { valorCifrado: string; iv: string; tag: string };

/**
 * Leitura do material cifrado para o uso da conta. É abstração porque quem usa o
 * OMIE (um pedido a faturar, uma nota a emitir) não alcança a tabela do cofre:
 * recebe só o texto cifrado, por `plugga_security.config_omie()`.
 */
export abstract class OmieLeitura {
  abstract lerCifrado(): Promise<MaterialCifrado | null>;
}

/**
 * OMIE conectado pela tela: chave e segredo do app guardados cifrados no cofre. O
 * segredo é escrita-apenas (a tela vê os quatro últimos caracteres da chave), e
 * conectar ou desconectar viram auditoria sem o segredo.
 */
@Injectable()
export class OmieCofreService {
  private readonly logger = new Logger(OmieCofreService.name);
  private cache: { valor: CredenciaisDoOmie | null; expiraEm: number } | null = null;
  /** Curto de propósito: trocar a chave pela tela tem de valer quase na hora. */
  private static readonly VALIDADE_MS = 5_000;

  constructor(
    @Inject(SegredoRepository) private readonly segredos: SegredoRepository,
    @Inject(OmieLeitura) private readonly leitura: OmieLeitura,
    @Inject(OmiePort) private readonly omie: OmiePort,
    @Inject(AuditPort) private readonly auditoria: AuditPort,
  ) {}

  /** O que o uso da conta recebe agora. Nunca vai para resposta de rota. */
  async credenciais(): Promise<CredenciaisDoOmie | null> {
    const agora = Date.now();
    if (this.cache && this.cache.expiraEm > agora) return this.cache.valor;

    let valor: CredenciaisDoOmie | null = null;
    try {
      const linha = await this.leitura.lerCifrado();
      if (linha) valor = lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
    } catch (erro) {
      // Ilegível não derruba quem usa a conta: sem credencial, e grita no log (sem o conteúdo).
      this.logger.error(`conta do OMIE guardada não pôde ser lida: ${erro instanceof Error ? erro.message : String(erro)}`);
    }

    this.cache = { valor, expiraEm: agora + OmieCofreService.VALIDADE_MS };
    return valor;
  }

  async estado(): Promise<EstadoDoOmie> {
    const linha = await this.segredos.buscar(CHAVE_OMIE);
    if (!linha) return { conectado: false, origem: "nenhuma", mascara: null, atualizadoEm: null, atualizadoPor: null };

    const base = { atualizadoEm: linha.atualizadoEm.toISOString(), atualizadoPor: linha.atualizadoPor };
    try {
      lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
      return { conectado: true, origem: "cofre", mascara: `••••${linha.ultimosQuatro}`, ...base };
    } catch {
      // Linha que não abre mais: dizer "conectado" seria mentir onde o desenvolvedor confere.
      return { conectado: false, origem: "cofre_ilegivel", mascara: null, ...base };
    }
  }

  async gravar(entrada: EntradaDoOmie, quem: string): Promise<EstadoDoOmie> {
    const cifrada = cifrar(JSON.stringify(entrada satisfies CredenciaisDoOmie));
    await this.segredos.gravar({
      chave: CHAVE_OMIE,
      valorCifrado: cifrada.conteudo,
      iv: cifrada.iv,
      tag: cifrada.tag,
      ultimosQuatro: entrada.appKey.slice(-4),
      atualizadoPor: quem,
    });
    this.cache = null;
    await this.registrar(eventNames.omieConectado, quem);
    return this.estado();
  }

  async apagar(quem: string): Promise<EstadoDoOmie> {
    await this.segredos.apagar(CHAVE_OMIE);
    this.cache = null;
    await this.registrar(eventNames.omieDesconectado, quem);
    return this.estado();
  }

  /** Confirma no OMIE de quem é a conta. Só a pedido do desenvolvedor, pela tela. */
  async testar(): Promise<EmpresaDoOmie> {
    const credenciais = await this.credenciais();
    if (!credenciais) throw new Error("conta do OMIE não está conectada");
    return this.omie.consultarEmpresa(credenciais);
  }

  private async registrar(evento: EventName, quem: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "segredo",
        entityId: CHAVE_OMIE,
        actorType: "user",
        actorId: quem,
        payload: {},
        occurredAt: new Date(),
      });
    } catch (erro) {
      this.logger.error(`troca do OMIE não auditada: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
}

function lerCredenciais(texto: string): CredenciaisDoOmie {
  const d = JSON.parse(texto) as Partial<CredenciaisDoOmie>;
  if (!d.appKey || !d.appSecret) throw new Error("conteúdo do segredo incompleto");
  return { appKey: d.appKey, appSecret: d.appSecret };
}
