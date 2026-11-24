export interface EnqueueOptions {
  /**
   * Idempotency key. A second enqueue with the same key does not create a
   * duplicate while the job is waiting/active; once the job completes or fails,
   * the key is released and a new enqueue runs again. The `deduped` flag on the
   * result is best-effort under concurrent enqueues (label only, never lost work).
   */
  dedupeKey?: string;
  /** Max attempts before the job is considered failed (default 3). */
  attempts?: number;
  /** Base delay for exponential backoff between retries, ms (default 5000). */
  backoffMs?: number;
  /** Delay before the job becomes eligible to run, ms. */
  delayMs?: number;
  /** Who requested the job; recorded on job_runs.triggered_by. */
  triggeredBy?: string;
}

export interface EnqueueResult {
  jobId: string;
  jobKey: string;
  /** True when an existing job with the same dedupeKey was already queued. */
  deduped: boolean;
}

/**
 * Producer port for OS-owned jobs. Consumers depend on this abstraction, never
 * on BullMQ directly, so the queue technology stays swappable and testable.
 */
/** Um job que roda todo dia no mesmo horário. */
export interface AgendamentoDiario {
  /** Id estável do agendamento: agendar de novo com o mesmo id só atualiza. */
  id: string;
  /** HH:mm, 24 h. */
  horario: string;
  /** Fuso do horário (ex.: America/Manaus). */
  fuso: string;
}

export abstract class JobsQueue {
  abstract enqueue<Payload>(
    jobKey: string,
    payload: Payload,
    options?: EnqueueOptions,
  ): Promise<EnqueueResult>;

  /**
   * Agenda o job para todo dia no horário, de forma idempotente pelo id. Sem a
   * fila (JOBS_ENABLED desligado) não há o que agendar: devolve `agendado: false`.
   */
  // Os parâmetros são o contrato que a fila real implementa; aqui, sem fila, não são usados.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async agendarDiario<Payload>(_jobKey: string, _payload: Payload, _agendamento: AgendamentoDiario): Promise<{ agendado: boolean }> {
    return { agendado: false };
  }

  /**
   * Agenda o job para rodar a cada `intervaloMs`, de forma idempotente pelo id (ex.:
   * um despacho a cada 30 min). Sem a fila, devolve `agendado: false`.
   */
  // Os parâmetros são o contrato que a fila real implementa; aqui, sem fila, não são usados.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async agendarACada<Payload>(_jobKey: string, _payload: Payload, _agendamento: AgendamentoPeriodico): Promise<{ agendado: boolean }> {
    return { agendado: false };
  }
}

/** Um job que roda a cada intervalo fixo. */
export interface AgendamentoPeriodico {
  /** Id estável e próprio do agendamento: dois agendamentos com o mesmo id se sobrescrevem. */
  id: string;
  /** Entre 1 minuto e 24 horas. */
  intervaloMs: number;
}

/** Confere o intervalo antes de agendar: inteiro, de 1 minuto a 24 horas. */
export function intervaloValido(intervaloMs: number): number {
  if (!Number.isInteger(intervaloMs) || intervaloMs < 60_000 || intervaloMs > 86_400_000) {
    throw new Error(`intervalo inválido: ${intervaloMs} ms`);
  }
  return intervaloMs;
}

/** "08:00" → "0 8 * * *". */
export function cronDiario(horario: string): string {
  const encontrado = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(horario);
  if (!encontrado) throw new Error(`horário inválido: ${horario}`);
  return `${Number(encontrado[2])} ${Number(encontrado[1])} * * *`;
}
