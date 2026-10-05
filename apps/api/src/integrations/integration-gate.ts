import { Inject, Injectable } from "@nestjs/common";
import type { IntegrationMode } from "@plugga/shared";

import { ErroDeDominio } from "../common/errors/dominio";
import { IntegrationsRepository } from "./integrations.repository";

/**
 * Do mais fechado ao mais aberto. `mock` nunca sai para a rede; `read_only` lê
 * do sistema externo; `bridge` e `write` podem escrever (ADR-0005/0009).
 */
const ORDEM_DE_MODO: Readonly<Record<IntegrationMode, number>> = {
  mock: 0,
  read_only: 1,
  bridge: 2,
  write: 3,
};

/** O modo da integração não permite a operação pedida. É estado, não permissão de pessoa. */
export class ModoNaoPermitido extends ErroDeDominio {
  readonly codigo = "CONFLITO_ESTADO" as const;

  constructor(
    readonly chave: string,
    readonly modoAtual: IntegrationMode,
    readonly modoMinimo: IntegrationMode,
  ) {
    super(
      `A integração "${chave}" está em modo ${modoAtual}; esta operação exige ${modoMinimo} ou mais aberto.`,
    );
  }
}

/**
 * O ponto único onde o modo declarado de uma integração vale de verdade.
 *
 * Quem fala com um serviço externo pergunta aqui antes de abrir a conexão, em
 * vez de ler `integrations.mode` por conta própria: assim o modo não é só um
 * rótulo na tela de Integrações, é o que impede a chamada de rede.
 *
 * Falha fechada: integração sem registro no banco conta como `mock`.
 */
@Injectable()
export class IntegrationGate {
  constructor(
    @Inject(IntegrationsRepository)
    private readonly repository: IntegrationsRepository,
  ) {}

  async modoDe(chave: string): Promise<IntegrationMode> {
    return (await this.repository.findModeByKey(chave)) ?? "mock";
  }

  /** `true` se o modo atual é o mínimo pedido ou mais aberto. */
  async permite(chave: string, modoMinimo: IntegrationMode): Promise<boolean> {
    const atual = await this.modoDe(chave);
    return ORDEM_DE_MODO[atual] >= ORDEM_DE_MODO[modoMinimo];
  }

  /** Lança `ModoNaoPermitido` se o modo atual for mais fechado que o mínimo pedido. */
  async assertMode(chave: string, modoMinimo: IntegrationMode): Promise<void> {
    const atual = await this.modoDe(chave);
    if (ORDEM_DE_MODO[atual] < ORDEM_DE_MODO[modoMinimo]) {
      throw new ModoNaoPermitido(chave, atual, modoMinimo);
    }
  }
}
