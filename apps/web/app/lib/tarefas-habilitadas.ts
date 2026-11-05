/** As tarefas temporárias ainda não persistem; não podem aparecer em produção. */
export function tarefasHabilitadas(nodeEnv: string | undefined): boolean {
  return nodeEnv === "development" || nodeEnv === "test";
}
