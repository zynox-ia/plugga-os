/** A ficha usa a API persistente nos três ambientes suportados pela aplicação. */
export function tarefasHabilitadas(nodeEnv: string | undefined): boolean {
  return nodeEnv === "development" || nodeEnv === "test" || nodeEnv === "production";
}
