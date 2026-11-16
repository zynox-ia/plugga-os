import type { Activity } from "@plugga/shared";

export function proximaAtividade(atividades: readonly Activity[]): Activity | null {
  return atividades.filter((atividade) => atividade.currentRound.status !== "done")
    .sort((a, b) => a.currentRound.dueAt.localeCompare(b.currentRound.dueAt) || a.id.localeCompare(b.id))[0] ?? null;
}
