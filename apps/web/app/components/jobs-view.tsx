import type { JobRunInventoryItem, JobRunStatus } from "@plugga/shared";

import { ShellCard, StatusPill, ShellTable } from "./plugga-shell";

const STATUS_VARIANT: Record<JobRunStatus, "neutral" | "success" | "warning" | "danger"> = {
  queued: "neutral",
  running: "neutral",
  success: "success",
  failed: "danger",
  skipped: "warning",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Manaus" });
}

export function JobsView({ items, isLive }: { items: JobRunInventoryItem[]; isLive: boolean }) {
  return (
    <div className="stack">
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Plataforma</span>
            <h2>GET /jobs</h2>
          </div>
          {isLive ? (
            <StatusPill variant="success">Dados reais</StatusPill>
          ) : (
            <StatusPill variant="warning">Mock local</StatusPill>
          )}
        </div>
        <p className="card-note">
          {isLive
            ? "Inventário de execuções vindo da API — somente leitura (inventoryOnly)."
            : "API indisponível agora — exibindo o seed local de referência do Bloco A."}{" "}
          Sem pausar, reprocessar ou migrar jobs neste bloco (ADR-0007).
        </p>
      </ShellCard>

      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Observabilidade</span>
            <h2>Execuções recentes</h2>
          </div>
          <StatusPill variant="neutral">{items.length} itens</StatusPill>
        </div>
        <ShellTable caption="Inventário de jobs e integrações">
          <thead>
            <tr>
              <th>Job</th>
              <th>Integração</th>
              <th>Status</th>
              <th>Agendado para</th>
              <th>Concluído em</th>
              <th>Tentativa</th>
              <th>Disparado por</th>
              <th>Erro</th>
            </tr>
          </thead>
          <tbody>
            {items.map((run) => (
              <tr key={run.id}>
                <td>{run.jobKey}</td>
                <td>{run.integrationKey ?? "—"}</td>
                <td>
                  <StatusPill variant={STATUS_VARIANT[run.status]}>{run.status}</StatusPill>
                </td>
                <td>{formatDate(run.scheduledFor)}</td>
                <td>{formatDate(run.finishedAt)}</td>
                <td>{run.attempt}</td>
                <td>{run.triggeredBy}</td>
                <td>{run.error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </ShellTable>
      </ShellCard>
    </div>
  );
}
