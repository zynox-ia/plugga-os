import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  companyKeys,
  eventNames,
  type CompanyKey,
  type ContaConsultadaDaAutentique,
  type ContaDaAutentique,
  type EntradaDaAutentique,
  type EstadoDaAutentique,
  type EventName,
} from "@plugga/shared";

import { AuditPort } from "../audit/audit.port";
import { cifrar, decifrar } from "../llm/cripto.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { AutentiquePort } from "./autentique.port";

/** Uma linha cifrada no cofre por empresa: `integracao.autentique.<empresa>`. */
export const chaveDaAutentique = (empresa: CompanyKey): string => `integracao.autentique.${empresa}`;

export type CredenciaisDaAutentique = EntradaDaAutentique;
export type MaterialCifrado = { valorCifrado: string; iv: string; tag: string };

/**
 * Leitura do material cifrado de UMA empresa. É abstração porque quem usa a conta
 * (um contrato a assinar, o retorno de um webhook) não alcança a tabela do cofre:
 * recebe só o texto cifrado, por `plugga_security.config_autentique(empresa)`.
 */
export abstract class AutentiqueLeitura {
  abstract lerCifrado(empresa: CompanyKey): Promise<MaterialCifrado | null>;
}

/**
 * Autentique com uma conta por empresa. O token é escrita-apenas (a tela vê os
 * quatro últimos caracteres), cada empresa tem o seu, e conectar ou desconectar
 * viram auditoria com a empresa e sem o token.
 */
@Injectable()
export class AutentiqueCofreService {
  private readonly logger = new Logger(AutentiqueCofreService.name);
  private readonly cache = new Map<CompanyKey, { valor: CredenciaisDaAutentique | null; expiraEm: number }>();
  /** Curto de propósito: trocar o token pela tela tem de valer quase na hora. */
  private static readonly VALIDADE_MS = 5_000;

  constructor(
    @Inject(SegredoRepository) private readonly segredos: SegredoRepository,
    @Inject(AutentiqueLeitura) private readonly leitura: AutentiqueLeitura,
    @Inject(AutentiquePort) private readonly autentique: AutentiquePort,
    @Inject(AuditPort) private readonly auditoria: AuditPort,
  ) {}

  /** O que o uso da conta recebe agora. Nunca vai para resposta de rota. */
  async credenciais(empresa: CompanyKey): Promise<CredenciaisDaAutentique | null> {
    const agora = Date.now();
    const guardado = this.cache.get(empresa);
    if (guardado && guardado.expiraEm > agora) return guardado.valor;

    let valor: CredenciaisDaAutentique | null = null;
    try {
      const linha = await this.leitura.lerCifrado(empresa);
      if (linha) valor = lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
    } catch (erro) {
      // Ilegível não derruba quem usa a conta: sem credencial, e grita no log (sem o conteúdo).
      this.logger.error(`conta da Autentique (${empresa}) guardada não pôde ser lida: ${erro instanceof Error ? erro.message : String(erro)}`);
    }

    this.cache.set(empresa, { valor, expiraEm: agora + AutentiqueCofreService.VALIDADE_MS });
    return valor;
  }

  async estado(): Promise<EstadoDaAutentique> {
    return { contas: await Promise.all(companyKeys.map((empresa) => this.conta(empresa))) };
  }

  async gravar(empresa: CompanyKey, entrada: EntradaDaAutentique, quem: string): Promise<EstadoDaAutentique> {
    const cifrada = cifrar(JSON.stringify(entrada satisfies CredenciaisDaAutentique));
    await this.segredos.gravar({
      chave: chaveDaAutentique(empresa),
      valorCifrado: cifrada.conteudo,
      iv: cifrada.iv,
      tag: cifrada.tag,
      ultimosQuatro: entrada.token.slice(-4),
      atualizadoPor: quem,
    });
    this.cache.delete(empresa);
    await this.registrar(eventNames.autentiqueConectada, empresa, quem);
    return this.estado();
  }

  async apagar(empresa: CompanyKey, quem: string): Promise<EstadoDaAutentique> {
    await this.segredos.apagar(chaveDaAutentique(empresa));
    this.cache.delete(empresa);
    await this.registrar(eventNames.autentiqueDesconectada, empresa, quem);
    return this.estado();
  }

  /** Confirma na Autentique de quem é a conta desta empresa. Só a pedido do desenvolvedor, pela tela. */
  async testar(empresa: CompanyKey): Promise<ContaConsultadaDaAutentique> {
    const credenciais = await this.credenciais(empresa);
    if (!credenciais) throw new Error("conta da Autentique não está conectada");
    return this.autentique.consultarConta(credenciais.token);
  }

  private async conta(empresa: CompanyKey): Promise<ContaDaAutentique> {
    const linha = await this.segredos.buscar(chaveDaAutentique(empresa));
    const vazia = { empresa, conectada: false, mascara: null, sandbox: false, atualizadoEm: null, atualizadoPor: null };
    if (!linha) return { ...vazia, origem: "nenhuma" };

    const base = { atualizadoEm: linha.atualizadoEm.toISOString(), atualizadoPor: linha.atualizadoPor };
    try {
      const lida = lerCredenciais(decifrar({ conteudo: linha.valorCifrado, iv: linha.iv, tag: linha.tag }));
      return { empresa, conectada: true, origem: "cofre", mascara: `••••${linha.ultimosQuatro}`, sandbox: lida.sandbox, ...base };
    } catch {
      // Linha que não abre mais: dizer "conectada" seria mentir onde o desenvolvedor confere.
      return { ...vazia, origem: "cofre_ilegivel", ...base };
    }
  }

  private async registrar(evento: EventName, empresa: CompanyKey, quem: string): Promise<void> {
    try {
      await this.auditoria.appendEvent({
        eventName: evento,
        entityType: "segredo",
        entityId: chaveDaAutentique(empresa),
        actorType: "user",
        actorId: quem,
        payload: { empresa },
        occurredAt: new Date(),
      });
    } catch (erro) {
      this.logger.error(`troca da Autentique (${empresa}) não auditada: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
}

function lerCredenciais(texto: string): CredenciaisDaAutentique {
  const d = JSON.parse(texto) as Partial<CredenciaisDaAutentique>;
  if (!d.token || typeof d.sandbox !== "boolean") throw new Error("conteúdo do segredo incompleto");
  return { token: d.token, sandbox: d.sandbox };
}
