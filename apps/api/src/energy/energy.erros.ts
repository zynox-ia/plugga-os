import { ErroDeDominio } from "../common/errors/dominio";

/**
 * Pré-condição de negócio do módulo de energia não atendida (vínculo errado,
 * etapa que ainda não chegou). Vira 400 REQUISICAO_INVALIDA no envelope.
 * Disputa de estado entre duas requisições é `EstadoInvalido`, não este erro.
 */
export class RegraDeEnergiaViolada extends ErroDeDominio {
  readonly codigo = "REQUISICAO_INVALIDA" as const;
}
