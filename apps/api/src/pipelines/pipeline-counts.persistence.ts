import { Prisma } from "@prisma/client";

/** A mesma sessão/RLS da leitura; uma agregação para todos os pipelines e etapas. */
export async function contarNegociosDosPipelines(tx: Prisma.TransactionClient, pipelineIds: readonly string[]) {
  const pipelines = new Map<string, number>();
  const stages = new Map<string, number>();
  if (!pipelineIds.length) return { pipelines, stages };
  const rows = await tx.$queryRaw<{ pipeline_id: string; stage_id: string; count: number }[]>(Prisma.sql`
    SELECT pipeline_id, stage_id, count(*)::int AS count FROM deals
    WHERE pipeline_id IN (${Prisma.join(pipelineIds.map((id) => Prisma.sql`${id}::uuid`))})
    GROUP BY pipeline_id, stage_id`);
  for (const row of rows) {
    pipelines.set(row.pipeline_id, (pipelines.get(row.pipeline_id) ?? 0) + row.count);
    stages.set(row.stage_id, row.count);
  }
  return { pipelines, stages };
}
