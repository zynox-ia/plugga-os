"use client";

import type { AuditOrigin, AuditSummary, AuditType } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createAudit } from "../lib/energy-client";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

type TabId = "todas" | "abertas" | "resolvidas";

const TABS: { id: TabId; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "abertas", label: "Abertas" },
  { id: "resolvidas", label: "Resolvidas" },
];

const OPEN_STATUSES = new Set(["em_analise", "divergencia_encontrada", "contestacao_aberta"]);
const RESOLVED_STATUSES = new Set(["resolvida", "inconclusiva", "sem_divergencia"]);

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  em_analise: "neutral",
  divergencia_encontrada: "warning",
  contestacao_aberta: "warning",
  resolvida: "success",
  inconclusiva: "neutral",
  sem_divergencia: "success",
};

const ORIGIN_LABEL: Record<AuditOrigin, string> = {
  ciclo_mensal: "Ciclo mensal",
  migracao_ml: "Migração ML",
  avulsa: "Avulsa",
};

const TYPE_LABEL: Record<AuditType, string> = {
  conferencia_fatura: "Conferência de fatura",
  contestacao: "Contestação",
  validacao_migracao: "Validação de migração",
  oportunidade: "Oportunidade",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function matchesTab(item: AuditSummary, tab: TabId): boolean {
  if (tab === "todas") return true;
  if (tab === "abertas") return OPEN_STATUSES.has(item.status);
  return RESOLVED_STATUSES.has(item.status);
}

export function AuditoriasView({ items, isLive }: { items: AuditSummary[]; isLive: boolean }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("abertas");
  const [showCreate, setShowCreate] = useState(false);
  const [origin, setOrigin] = useState<AuditOrigin>("avulsa");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = items.filter((item) => matchesTab(item, activeTab));

  async function handleCreate(formData: FormData) {
    setPending(true);
    setError(null);
    const cycleId = String(formData.get("cycleId") ?? "").trim();
    const marketMigrationId = String(formData.get("marketMigrationId") ?? "").trim();
    const result = await createAudit({
      origin,
      type: String(formData.get("type") ?? ""),
      cycleId: origin === "ciclo_mensal" ? cycleId || undefined : undefined,
      marketMigrationId: origin === "migracao_ml" ? marketMigrationId || undefined : undefined,
      summary: String(formData.get("summary") ?? "").trim() || undefined,
      divergenceBlocksClosing: formData.get("divergenceBlocksClosing") === "on",
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
          <h2>Auditorias</h2>
        </div>
        <div className="row-actions">
          {!isLive ? <StatusPill variant="warning">Dados de exemplo (API indisponível)</StatusPill> : null}
          <button className="button button--accent" type="button" onClick={() => setShowCreate((open) => !open)}>
            + Nova auditoria
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
            Origem
            <select name="origin" value={origin} onChange={(event) => setOrigin(event.target.value as AuditOrigin)}>
              {Object.entries(ORIGIN_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select name="type" defaultValue="conferencia_fatura">
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {origin === "ciclo_mensal" ? (
            <label>
              ID do ciclo
              <input name="cycleId" required placeholder="uuid do ciclo" />
            </label>
          ) : null}
          {origin === "migracao_ml" ? (
            <label>
              ID da migração
              <input name="marketMigrationId" required placeholder="uuid da migração" />
            </label>
          ) : null}
          <label style={{ gridColumn: "1 / -1" }}>
            Resumo
            <input name="summary" maxLength={2000} placeholder="descreva a divergência ou o motivo da auditoria" />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input name="divergenceBlocksClosing" type="checkbox" style={{ width: "auto" }} />
            Divergência impede o fechamento do ciclo
          </label>
          {error ? (
            <p className="auth-error" role="alert" style={{ gridColumn: "1 / -1" }}>
              {error}
            </p>
          ) : null}
          <div className="row-actions" style={{ gridColumn: "1 / -1" }}>
            <button className="button button--accent" type="submit" disabled={pending}>
              {pending ? "Abrindo…" : "Abrir auditoria"}
            </button>
            <button className="button" type="button" onClick={() => setShowCreate(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div role="tablist" aria-label="Filtros de auditorias" className="view-tabs">
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

      <ShellTable caption="Auditorias">
        <thead>
          <tr>
            <th>Origem</th>
            <th>Tipo</th>
            <th>Resumo</th>
            <th>Criada em</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => (
            <tr key={item.id}>
              <td>
                <Link href={`/energia-opm/auditorias/${item.id}`}>{ORIGIN_LABEL[item.origin]}</Link>
              </td>
              <td>{TYPE_LABEL[item.type]}</td>
              <td>{item.summary ?? "—"}</td>
              <td>{formatDate(item.createdAt)}</td>
              <td>
                <StatusPill variant={STATUS_VARIANT[item.status] ?? "neutral"}>{item.status}</StatusPill>
              </td>
            </tr>
          ))}
        </tbody>
      </ShellTable>
      {filtered.length === 0 ? <p className="card-note">Nenhuma auditoria nesta visão.</p> : null}
    </ShellCard>
  );
}
