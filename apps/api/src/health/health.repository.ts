export abstract class HealthRepository {
  /** Falha se o banco não responde a `SELECT 1`. */
  abstract pingBanco(): Promise<void>;
}
