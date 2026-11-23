/**
 * A marca de uma execução dos e2e. O que um spec cria (fornecedor, pedido, item,
 * lançamento) leva `marcaDaExecucao()` no nome, e o `globalTeardown` apaga só o
 * que tem a marca daquela execução (e2e/support/limpeza-e2e.sql). Os exemplos do
 * QA, que não têm a marca, ficam.
 */
export function marcaDaExecucao(): string {
  const run = process.env.E2E_RUN_ID;
  if (!run) throw new Error("E2E_RUN_ID ausente: o globalSetup do Playwright não rodou");
  return `E2E ${run}`;
}

/** runId aceito pelo SQL da limpeza: ^[A-Za-z0-9_-]{6,40}$. */
export const RUN_ID_VALIDO = /^[A-Za-z0-9_-]{6,40}$/;
