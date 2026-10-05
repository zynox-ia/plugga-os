import type { CodigoDeErro } from "@plugga/shared";

/**
 * Erros de domínio: a camada de persistência e os serviços lançam estes, sem
 * saber de HTTP. O filtro global (filtro-global.ts) os converte no envelope.
 */
export abstract class ErroDeDominio extends Error {
  abstract readonly codigo: CodigoDeErro;

  constructor(
    readonly mensagemParaUsuario: string,
    readonly detalhes?: { campo: string; problema: string }[],
  ) {
    super(mensagemParaUsuario);
    this.name = new.target.name;
  }
}

/** A transição já foi feita por outra requisição (aprovação duplicada, assinatura repetida). */
export class EstadoInvalido extends ErroDeDominio {
  readonly codigo = "CONFLITO_ESTADO" as const;
}

/** Inexistente, ou de empresa que a pessoa não alcança (não revela existência). */
export class NaoEncontrado extends ErroDeDominio {
  readonly codigo = "NAO_ENCONTRADO" as const;
}

/** Violação de unicidade que não pôde ser repetida. */
export class Conflito extends ErroDeDominio {
  readonly codigo = "CONFLITO_UNICIDADE" as const;
}

/** Limite de taxa ou de tamanho excedido. */
export class LimiteExcedido extends ErroDeDominio {
  constructor(
    mensagemParaUsuario: string,
    readonly codigo: Extract<CodigoDeErro, "MUITAS_TENTATIVAS" | "ARQUIVO_GRANDE_DEMAIS"> = "MUITAS_TENTATIVAS",
    readonly retryAfterSegundos?: number,
  ) {
    super(mensagemParaUsuario);
  }
}
