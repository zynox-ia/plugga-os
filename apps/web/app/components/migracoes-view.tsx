"use client";

import type { MarketMigrationStage, MarketMigrationSummary } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createMarketMigration } from "../lib/energy-client";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

type TabId = "kanban" | "lista" | "ativas" | "canceladas";

const TABS: { id: TabId; label: string }[] = [
  { id: "kanban", label: "Kanban" },
  { id: "lista", label: "Lista" },
  { id: "ativas", label: "Ativadas" },
  { id: "canceladas", label: "Canceladas" },
];

const STAGES: { id: MarketMigrationStage; label: string }[] = [
  { id: "analise", label: "Análise" },
  { id: "contratacao", label: "Contratação" },
  { id: "documentacao", label: "Documentação" },
  { id: "denuncia", label: "Denúncia" },
  { id: "ativacao", label: "Ativação" },
];

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  em_andamento: "neutral",
  ativa: "success",
  cancelada: "danger",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function matchesTab(item: MarketMigrationSummary, tab: TabId): boolean {
  switch (tab) {
    case "kanban":
    case "lista":
      return item.status === "em_andamento";
    case "ativas":
      return item.status === "ativa";
    case "canceladas":
      return item.status === "cancelada";
  }
}

export function MigracoesView({ items, isLive }: { items: MarketMigrationSummary[]; isLive: boolean }) {
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
    const result = await createMarketMigration({
      consumerUnitId: String(formData.get("consumerUnitId") ?? "").trim(),
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
          <span className="eyebrow">Energia & OPM</span>
          <h2>Migrações Mercado Livre</h2>
        </div>
        <div className="row-actions">
          {!isLive ? <StatusPill variant="warning">Dados de exemplo (API indisponível)</StatusPill> : null}
          <button className="button button--accent" type="button" onClick={() => setShowCreate((open) => !open)}>
            + Nova migração
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
            Unidade consumidora (UC)
            <input name="consumerUnitId" required placeholder="uuid da UC" />
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
            <input name="nextActionNote" maxLength={500} placeholder="ex.: confirmar viabilidade" />
          </label>
          {error ? (
            <p className="auth-error" role="alert" style={{ gridColumn: "1 / -1" }}>
              {error}
            </p>
          ) : null}
          <div className="row-actions" style={{ gridColumn: "1 / -1" }}>
            <button className="button button--accent" type="submit" disabled={pending}>
              {pending ? "Criando…" : "Criar migração"}
            </button>
            <button className="button" type="button" onClick={() => setShowCreate(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div role="tablist" aria-label="Filtros de migrações" className="view-tabs">
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
                  <Link className="lead-card" href={`/energia-opm/migracoes/${item.id}`} key={item.id}>
                    <strong>{item.consumerUnitCode}</strong>
                    <span>Responsável: {item.ownerName ?? "sem responsável"}</span>
                    <span>Próxima ação: {formatDate(item.nextActionAt)}</span>
                    {item.nextActionNote ? <span>{item.nextActionNote}</span> : null}
                  </Link>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <ShellTable caption="Migrações Mercado Livre">
          <thead>
            <tr>
              <th>UC</th>
              <th>Cliente</th>
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
                  <Link href={`/energia-opm/migracoes/${item.id}`}>{item.consumerUnitCode}</Link>
                </td>
                <td>{item.clientName ?? "—"}</td>
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
      {filtered.length === 0 ? <p className="card-note">Nenhuma migração nesta visão.</p> : null}
    </ShellCard>
  );
}
