"use client";

import type { OpportunitySummary, OpportunityStage } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createOpportunity } from "../lib/commercial-client";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

type TabId = "kanban" | "lista" | "revisitar" | "ganhas" | "perdidas";

const TABS: { id: TabId; label: string }[] = [
  { id: "kanban", label: "Kanban" },
  { id: "lista", label: "Lista" },
  { id: "revisitar", label: "Revisitadas" },
  { id: "ganhas", label: "Ganhos" },
  { id: "perdidas", label: "Perdidas" },
];

const STAGES: { id: OpportunityStage; label: string }[] = [
  { id: "leads", label: "Leads" },
  { id: "qualificacao", label: "Qualificação" },
  { id: "proposta", label: "Proposta" },
  { id: "decisao", label: "Decisão" },
];

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  aberta: "neutral",
  ganha: "success",
  perdida: "danger",
  revisitar: "warning",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function matchesTab(item: OpportunitySummary, tab: TabId): boolean {
  switch (tab) {
    case "kanban":
    case "lista":
      return item.status === "aberta";
    case "revisitar":
      return item.status === "revisitar";
    case "ganhas":
      return item.status === "ganha";
    case "perdidas":
      return item.status === "perdida";
  }
}

export function OportunidadesView({ items, isLive }: { items: OpportunitySummary[]; isLive: boolean }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("kanban");
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = items.filter((item) => matchesTab(item, activeTab));

  async function handleCreate(formData: FormData) {
    setPending(true);
    setError(null);
    const nextActionAtLocal = String(formData.get("nextActionAt") ?? "");
    const result = await createOpportunity({
      title: String(formData.get("title") ?? "").trim(),
      product: String(formData.get("product") ?? "").trim(),
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
          <span className="eyebrow">Comercial</span>
          <h2>Oportunidades</h2>
        </div>
        <div className="row-actions">
          {!isLive ? <StatusPill variant="warning">Dados de exemplo (API indisponível)</StatusPill> : null}
          <button className="button button--accent" type="button" onClick={() => setShowCreate((open) => !open)}>
            + Nova oportunidade
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
            Título
            <input name="title" required maxLength={200} />
          </label>
          <label>
            Produto
            <input name="product" required maxLength={120} placeholder="OPM, PluggaMob, GD..." />
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
            <input name="nextActionNote" maxLength={500} placeholder="ex.: ligar para qualificar consumo" />
          </label>
          {error ? (
            <p className="auth-error" role="alert" style={{ gridColumn: "1 / -1" }}>
              {error}
            </p>
          ) : null}
          <div className="row-actions" style={{ gridColumn: "1 / -1" }}>
            <button className="button button--accent" type="submit" disabled={pending}>
              {pending ? "Criando…" : "Criar oportunidade"}
            </button>
            <button className="button" type="button" onClick={() => setShowCreate(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div role="tablist" aria-label="Filtros de oportunidades" className="view-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={`view-tab${tab.id === activeTab ? " view-tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "kanban" ? (
        <div className="kanban">
          {STAGES.map((stage) => (
            <div className="kanban-column" key={stage.id}>
              <div className="column-heading">
                <span>{stage.label}</span>
                <span className="count-pill">{filtered.filter((item) => item.stage === stage.id).length}</span>
              </div>
              {filtered
                .filter((item) => item.stage === stage.id)
                .map((item) => (
                  <Link className="lead-card" href={`/comercial/oportunidades/${item.id}`} key={item.id}>
                    <strong>{item.title}</strong>
                    <span>Responsável: {item.ownerName ?? "sem responsável"}</span>
                    <span>Próxima ação: {formatDate(item.nextActionAt)}</span>
                    {item.nextActionNote ? <span>{item.nextActionNote}</span> : null}
                  </Link>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <ShellTable caption="Oportunidades">
          <thead>
            <tr>
              <th>Título</th>
              <th>Etapa</th>
              <th>Responsável</th>
              <th>Próxima ação</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/comercial/oportunidades/${item.id}`}>{item.title}</Link>
                </td>
                <td>{STAGES.find((stage) => stage.id === item.stage)?.label ?? item.stage}</td>
                <td>{item.ownerName ?? "—"}</td>
                <td>
                  {formatDate(item.nextActionAt)}
                  {item.nextActionNote ? ` · ${item.nextActionNote}` : ""}
                </td>
                <td>
                  <StatusPill variant={STATUS_VARIANT[item.status] ?? "neutral"}>{item.status}</StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </ShellTable>
      )}
      {filtered.length === 0 ? <p className="card-note">Nenhuma oportunidade nesta visão.</p> : null}
    </ShellCard>
  );
}
