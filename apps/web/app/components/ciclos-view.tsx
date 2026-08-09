"use client";

import type { CycleStatus, CycleSummary } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createCycle } from "../lib/energy-client";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

const KANBAN_STATUSES: { id: CycleStatus; label: string }[] = [
  { id: "aguardando_documentos", label: "Aguardando fatura" },
  { id: "documentos_recebidos", label: "Documentos recebidos" },
  { id: "em_auditoria", label: "Em auditoria" },
  { id: "relatorio_pronto", label: "Relatório pronto" },
  { id: "validado_internamente", label: "Validado internamente" },
  { id: "enviado", label: "Enviado" },
];

export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  aguardando_documentos: "Aguardando fatura",
  documentos_recebidos: "Documentos recebidos",
  em_auditoria: "Em auditoria",
  relatorio_pronto: "Relatório pronto",
  validado_internamente: "Validado internamente",
  enviado: "Enviado",
  fechado: "Fechado",
};

export const CYCLE_STATUS_VARIANT: Record<CycleStatus, "neutral" | "success" | "warning" | "danger"> = {
  aguardando_documentos: "warning",
  documentos_recebidos: "neutral",
  em_auditoria: "warning",
  relatorio_pronto: "neutral",
  validado_internamente: "neutral",
  enviado: "success",
  fechado: "success",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function CiclosView({ items, isLive }: { items: CycleSummary[]; isLive: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = items.filter((item) => item.status !== "fechado");
  const closed = items.filter((item) => item.status === "fechado");
  const visible = view === "kanban" ? open : items;

  async function handleCreate(formData: FormData) {
    setPending(true);
    setError(null);
    const nextActionAtLocal = String(formData.get("nextActionAt") ?? "");
    const result = await createCycle({
      clientId: String(formData.get("clientId") ?? "").trim(),
      consumerUnitId: String(formData.get("consumerUnitId") ?? "").trim(),
      competenceMonth: Number(formData.get("competenceMonth")),
      competenceYear: Number(formData.get("competenceYear")),
      ownerId: String(formData.get("ownerId") ?? "").trim(),
      nextActionAt: nextActionAtLocal ? new Date(nextActionAtLocal).toISOString() : undefined,
      nextActionNote: String(formData.get("nextActionNote") ?? "").trim() || undefined,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setShowCreate(false);
    router.refresh();
  }

  return (
    <ShellCard className="table-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Energia &amp; OPM</span>
          <h2>Ciclos Mensais</h2>
        </div>
        <div className="row-actions">
          {!isLive ? <StatusPill variant="warning">Dados de exemplo (API indisponível)</StatusPill> : null}
          <button className="button button--accent" type="button" onClick={() => setShowCreate((show) => !show)}>
            + Novo ciclo
          </button>
        </div>
      </div>

      {showCreate ? (
        <form
          action={handleCreate}
          className="auth-form"
          style={{ padding: "0 18px 18px", display: "grid", gap: 10, gridTemplateColumns: "repeat(2, 1fr)" }}
        >
          <label>
            Cliente (ID)
            <input name="clientId" required placeholder="uuid do cliente" />
          </label>
          <label>
            Unidade consumidora (ID)
            <input name="consumerUnitId" required placeholder="uuid da UC" />
          </label>
          <label>
            Mês de competência
            <input name="competenceMonth" type="number" min={1} max={12} required />
          </label>
          <label>
            Ano de competência
            <input name="competenceYear" type="number" min={2000} required />
          </label>
          <label>
            Responsável (ID do usuário)
            <input name="ownerId" required placeholder="uuid do responsável" />
          </label>
          <label>
            Próxima ação (data)
            <input name="nextActionAt" type="datetime-local" required />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Nota da próxima ação
            <input name="nextActionNote" maxLength={500} placeholder="ex.: cobrar fatura da distribuidora" />
          </label>
          {error ? (
            <p className="auth-error" role="alert" style={{ gridColumn: "1 / -1" }}>
              {error}
            </p>
          ) : null}
          <div className="row-actions" style={{ gridColumn: "1 / -1" }}>
            <button className="button button--accent" type="submit" disabled={pending}>
              {pending ? "Abrindo…" : "Abrir ciclo"}
            </button>
            <button className="button" type="button" onClick={() => setShowCreate(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div role="tablist" aria-label="Visão dos ciclos" className="view-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={view === "kanban"}
          className={`view-tab${view === "kanban" ? " view-tab--active" : ""}`}
          onClick={() => setView("kanban")}
        >
          Kanban
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "lista"}
          className={`view-tab${view === "lista" ? " view-tab--active" : ""}`}
          onClick={() => setView("lista")}
        >
          Lista
        </button>
      </div>

      {view === "kanban" ? (
        <div className="kanban">
          {KANBAN_STATUSES.map((column) => (
            <div className="kanban-column" key={column.id}>
              <div className="column-heading">
                <span>{column.label}</span>
                <span className="count-pill">{visible.filter((item) => item.status === column.id).length}</span>
              </div>
              {visible
                .filter((item) => item.status === column.id)
                .map((item) => (
                  <Link className="lead-card" href={`/energia-opm/ciclos/${item.id}`} key={item.id}>
                    <strong>{item.clientName}</strong>
                    <span>
                      {item.consumerUnitCode} · {String(item.competenceMonth).padStart(2, "0")}/{item.competenceYear}
                    </span>
                    <span>Responsável: {item.ownerName ?? "sem responsável"}</span>
                    {item.nextActionNote ? <span>{item.nextActionNote}</span> : null}
                  </Link>
                ))}
            </div>
          ))}
          <div className="kanban-column">
            <div className="column-heading">
              <span>Fechado</span>
              <span className="count-pill">{closed.length}</span>
            </div>
            {closed.map((item) => (
              <Link className="lead-card" href={`/energia-opm/ciclos/${item.id}`} key={item.id}>
                <strong>{item.clientName}</strong>
                <span>
                  {item.consumerUnitCode} · {String(item.competenceMonth).padStart(2, "0")}/{item.competenceYear}
                </span>
                <span>Enviado ao cliente</span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <ShellTable caption="Ciclos mensais">
          <thead>
            <tr>
              <th>Cliente / UC</th>
              <th>Competência</th>
              <th>Responsável</th>
              <th>Próxima ação</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/energia-opm/ciclos/${item.id}`}>
                    {item.clientName} · {item.consumerUnitCode}
                  </Link>
                </td>
                <td>
                  {String(item.competenceMonth).padStart(2, "0")}/{item.competenceYear}
                </td>
                <td>{item.ownerName ?? "—"}</td>
                <td>
                  {formatDate(item.nextActionAt)}
                  {item.nextActionNote ? ` · ${item.nextActionNote}` : ""}
                </td>
                <td>
                  <StatusPill variant={CYCLE_STATUS_VARIANT[item.status]}>{CYCLE_STATUS_LABEL[item.status]}</StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </ShellTable>
      )}
      {/* No kanban os fechados moram fora de `visible`: sem contá-los, tudo
          fechado mostrava cartões e "nenhum ciclo" ao mesmo tempo. */}
      {visible.length === 0 && closed.length === 0 ? <p className="card-note">Nenhum ciclo nesta visão.</p> : null}
    </ShellCard>
  );
}
