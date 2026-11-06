import type { Prisma } from "@prisma/client";

/** Membros operam negócios sem UPDATE em pipelines; a trava não depende da política de escrita da tabela. */
export async function travarPipelines(tx: Pick<Prisma.TransactionClient, "$executeRaw">, ids: readonly string[]): Promise<void> {
  for (const id of [...new Set(ids.map((id) => id.toLowerCase()))].sort()) {
    const chave = `plugga:pipeline:${id}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`;
  }
}
