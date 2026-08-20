"use client";

import { useState } from "react";
import { ShellCard, StatusPill, ShellTable } from "./plugga-shell";
import {
  CURRENT_USER,
  CURRENT_USER_AREAS,
  INITIAL_PENDING_ITEMS,
  STATUS_LABEL,
  type Criticality,
  type PendingItem,
  type PendingStatus,
} from "../lib/mock/pendencias";

const TODAY = new Date().toISOString().slice(0, 10);

type TabId = "todas" | "minhas" | "da-minha-area" | "atrasadas" | "sem-dono" | "sem-area" | "aguardando-aprovacao";

const TABS: { id: TabId; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "minhas", label: "Minhas" },
  { id: "da-minha-area", label: "Da minha área" },
  { id: "atrasadas", label: "Atrasadas" },
  { id: "sem-dono", label: "Sem dono" },
  { id: "sem-area", label: "Sem área" },
  { id: "aguardando-aprovacao", label: "Aguardando aprovação" },
];

function matchesTab(item: PendingItem, tab: TabId): boolean {
  switch (tab) {
    case "todas":
      return true;
    case "minhas":
      return item.owner === CURRENT_USER;
    case "da-minha-area":
      return item.area !== null && CURRENT_USER_AREAS.includes(item.area);
    case "atrasadas":
      return item.dueDate !== null && item.dueDate < TODAY && item.status !== "concluida";
    case "sem-dono":
      return item.owner === null;
    case "sem-area":
      return item.area === null;
    case "aguardando-aprovacao":
      return item.status === "aguardando_aprovacao";
  }
}

const CRITICALITY_VARIANT: Record<Criticality, "neutral" | "warning" | "danger"> = {
  P0: "danger",
  P1: "warning",
  P2: "neutral",
};

const STATUS_VARIANT: Record<PendingStatus, "neutral" | "success" | "warning" | "danger"> = {
  aberta: "neutral",
  em_andamento: "neutral",
  aguardando_aprovacao: "warning",
  concluida: "success",
  escalada: "danger",
};

function isIncomplete(item: PendingItem): boolean {
  return item.criticality === "P0" && (!item.area || !item.owner || !item.dueDate);
}

export function PendenciasView() {
  const [items, setItems] = useState<PendingItem[]>(INITIAL_PENDING_ITEMS);
  const [activeTab, setActiveTab] = useState<TabId>("todas");

  const filtered = items.filter((item) => matchesTab(item, activeTab));

  const totalActive = items.filter((i) => i.status !== "concluida").length;
  const totalMinhas = items.filter((i) => i.owner === CURRENT_USER && i.status !== "concluida").length;
  const totalOverdue = items.filter((i) => i.dueDate !== null && i.dueDate < TODAY && i.status !== "concluida").length;
  const totalCriticalP0 = items.filter((i) => i.criticality === "P0" && i.status !== "concluida").length;

  function updateItem(id: string, patch: Partial<PendingItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function assignToMe(id: string) {
    updateItem(id, { owner: CURRENT_USER });
  }

  function conclude(id: string) {
    const resultado = window.prompt("Resultado da conclusão:");
    if (!resultado) return;
    updateItem(id, { status: "concluida", comments: (items.find((i) => i.id === id)?.comments ?? 0) + 1 });
  }

  function escalate(id: string) {
    if (!window.confirm("Escalar esta pendência para o gestor da área?")) return;
    updateItem(id, { status: "escalada" });
  }

  function addComment(id: string) {
    const text = window.prompt("Comentário:");
    if (!text) return;
    const current = items.find((i) => i.id === id);
    updateItem(id, { comments: (current?.comments ?? 0) + 1 });
  }

  function reschedule(id: string) {
    const current = items.find((i) => i.id === id);
    const newDate = window.prompt("Nova data (AAAA-MM-DD):", current?.dueDate ?? "");
    if (!newDate) return;
    const reason = window.prompt("Justificativa para a mudança de prazo:");
    if (!reason) return;
    updateItem(id, { dueDate: newDate, comments: (current?.comments ?? 0) + 1 });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 500, color: "#fff", margin: "0 0 4px", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
            Central de Pendências
          </h2>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "13.5px", fontWeight: 400, fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
            Triagem, atribuição de responsável e resolução de gargalos operacionais.
          </p>
        </div>
      </div>

      {/* Overview Stat Cards Grid */}
      <div className="stat-grid">
        <ShellCard>
          <span className="stat-label">Pendências Ativas</span>
          <span className="stat-value">{totalActive}</span>
          <span className="stat-note">Itens em acompanhamento</span>
        </ShellCard>

        <ShellCard tone="accent">
          <span className="stat-label">Minhas Atribuições</span>
          <span className="stat-value">{totalMinhas}</span>
          <span className="stat-note">Designadas a você</span>
        </ShellCard>

        <ShellCard tone={totalOverdue > 0 ? "warm" : undefined}>
          <span className="stat-label">Atrasadas</span>
          <span className="stat-value" style={{ color: totalOverdue > 0 ? "var(--laranja)" : "#fff" }}>
            {totalOverdue}
          </span>
          <span className="stat-note">Exigem reprogramação</span>
        </ShellCard>

        <ShellCard>
          <span className="stat-label">Críticas (P0)</span>
          <span className="stat-value" style={{ color: totalCriticalP0 > 0 ? "#f87171" : "#fff" }}>
            {totalCriticalP0}
          </span>
          <span className="stat-note">Prioridade máxima</span>
        </ShellCard>
      </div>

      {/* Main Table Glass Card */}
      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Operação</span>
            <h2>Fila de Execução</h2>
          </div>
          <StatusPill variant="neutral">{filtered.length} itens listados</StatusPill>
        </div>

        <div role="tablist" aria-label="Filtros de pendências" className="view-tabs">
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

        <ShellTable caption="Pendências operacionais">
          <thead>
            <tr>
              <th>Título</th>
              <th>Área</th>
              <th>Dono</th>
              <th>Prazo</th>
              <th>Criticidade</th>
              <th>Origem</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td style={{ fontWeight: 500 }}>
                  {item.title}
                  {isIncomplete(item) ? (
                    <>
                      {" "}
                      <StatusPill variant="danger">Dados incompletos</StatusPill>
                    </>
                  ) : null}
                </td>
                <td>{item.area ?? "—"}</td>
                <td>{item.owner ?? "—"}</td>
                <td>{item.dueDate ?? "—"}</td>
                <td>
                  <StatusPill variant={CRITICALITY_VARIANT[item.criticality]}>{item.criticality}</StatusPill>
                </td>
                <td>{item.origin}</td>
                <td>
                  <StatusPill variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</StatusPill>
                </td>
                <td>
                  <div className="row-actions">
                    {item.owner === null ? (
                      <button className="button button--small" type="button" onClick={() => assignToMe(item.id)}>
                        Atribuir a mim
                      </button>
                    ) : null}
                    {item.status !== "concluida" && item.status !== "escalada" ? (
                      <>
                        <button className="button button--small" type="button" onClick={() => reschedule(item.id)}>
                          Alterar prazo
                        </button>
                        <button className="button button--small" type="button" onClick={() => conclude(item.id)}>
                          Concluir
                        </button>
                        <button className="button button--small" type="button" onClick={() => escalate(item.id)}>
                          Escalar
                        </button>
                      </>
                    ) : null}
                    <button className="button button--small" type="button" onClick={() => addComment(item.id)}>
                      Comentar ({item.comments})
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </ShellTable>
        <p className="card-note">
          Dados de front-end (mock). Integrado ao pipeline de eventos operacionais da Plugga.
        </p>
      </ShellCard>
    </div>
  );
}
