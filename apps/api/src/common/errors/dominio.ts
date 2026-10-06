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

/** O conteúdo do arquivo não é de um tipo aceito, ou não bate com o tipo declarado (415 TIPO_NAO_PERMITIDO). */
export class TipoNaoPermitido extends ErroDeDominio {
  readonly codigo = "TIPO_NAO_PERMITIDO" as const;
}

/** Arquivo do tipo certo, mas corrompido, truncado ou acima dos limites de páginas/dimensão (422 ARQUIVO_RECUSADO). */
export class ArquivoRecusado extends ErroDeDominio {
  readonly codigo = "ARQUIVO_RECUSADO" as const;
}

/**
 * Dependência fora do ar ou sem capacidade (503 SERVICO_INDISPONIVEL).
 *
 * `causa` é o detalhe interno (mensagem do SDK, caminho, endpoint): nunca vai
 * para a resposta, só para o log do servidor, junto do requestId.
 */
export class ServicoIndisponivel extends ErroDeDominio {
  readonly codigo = "SERVICO_INDISPONIVEL" as const;

  constructor(
    mensagemParaUsuario = "O serviço está indisponível no momento. Tente novamente em instantes.",
    readonly causa?: unknown,
  ) {
    super(mensagemParaUsuario);
  }
}

/** Dado de entrada que a regra de negócio recusa (400 REQUISICAO_INVALIDA), sem depender de HTTP. */
export class RequisicaoInvalida extends ErroDeDominio {
  readonly codigo = "REQUISICAO_INVALIDA" as const;
}
