import { LimiteExcedido, ServicoIndisponivel } from "../errors/dominio";

export const MAX_UPLOADS_EM_ANDAMENTO = 8;
export const MAX_UPLOADS_POR_USUARIO = 2;

/**
 * Teto de envios simultâneos (FR-045): no máximo `maxTotal` no processo todo e
 * `maxPorUsuario` por pessoa. Quem passa do teto recebe a recusa na hora, sem
 * fila, e os envios em andamento terminam normalmente.
 *
 * Tem de existir uma única instância por processo (vem do `UploadModule`).
 */
export class LimitadorDeUploads {
  private total = 0;
  private readonly porUsuario = new Map<string, number>();

  constructor(
    private readonly maxTotal: number = MAX_UPLOADS_EM_ANDAMENTO,
    private readonly maxPorUsuario: number = MAX_UPLOADS_POR_USUARIO,
  ) {}

  /** Reserva uma vaga. Devolve a função que a libera (idempotente). */
  adquirir(usuario: string): () => void {
    const doUsuario = this.porUsuario.get(usuario) ?? 0;
    if (doUsuario >= this.maxPorUsuario) {
      throw new LimiteExcedido(
        "Você já tem envios em andamento. Aguarde terminarem e tente novamente.",
        "MUITAS_TENTATIVAS",
        5,
      );
    }
    if (this.total >= this.maxTotal) {
      throw new ServicoIndisponivel("Há muitos envios em andamento no momento. Tente novamente em instantes.");
    }
    this.total += 1;
    this.porUsuario.set(usuario, doUsuario + 1);

    let liberado = false;
    return () => {
      if (liberado) return;
      liberado = true;
      this.total -= 1;
      const restante = (this.porUsuario.get(usuario) ?? 1) - 1;
      if (restante <= 0) this.porUsuario.delete(usuario);
      else this.porUsuario.set(usuario, restante);
    };
  }

  /** Para diagnóstico e testes. */
  get emAndamento(): number {
    return this.total;
  }
}
