"use client";

import type { AuditDetail, AuditResolutionStatus, ContestationDetail, ContestationStatus } from "@plugga/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createContestation, resolveAudit, updateContestationStatus } from "../lib/energy-client";
import { ShellCard, StatusPill } from "./plugga-shell";

const AUDIT_STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  em_analise: "neutral",
  divergencia_encontrada: "warning",
  contestacao_aberta: "warning",
  resolvida: "success",
  inconclusiva: "neutral",
  sem_divergencia: "success",
};

const CONTESTATION_STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  rascunho: "neutral",
  aberta: "neutral",
  aguardando_distribuidora: "warning",
  deferida: "success",
  indeferida: "danger",
  parcialmente_deferida: "warning",
  encerrada: "success",
};

const CONTESTATION_NEXT: Record<ContestationStatus, ContestationStatus[]> = {
  rascunho: ["aberta"],
  aberta: ["aguardando_distribuidora"],
  aguardando_distribuidora: ["deferida", "indeferida", "parcialmente_deferida"],
  deferida: ["encerrada"],
  indeferida: ["encerrada"],
  parcialmente_deferida: ["encerrada"],
  encerrada: [],
};

const RESOLUTION_STATUSES: AuditResolutionStatus[] = ["resolvida", "inconclusiva", "sem_divergencia"];
const RESOLVED_AUDIT_STATUSES = new Set(RESOLUTION_STATUSES);

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export function AuditoriaDetailView({
  audit,
  contestation,
}: {
  audit: AuditDetail;
  contestation: ContestationDetail | null;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"resolve" | "contestation" | "transition" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolved = RESOLVED_AUDIT_STATUSES.has(audit.status as AuditResolutionStatus);
  const canOpenContestation = audit.type === "contestacao" && !audit.contestationId && !isResolved;
  const nextContestationStatuses = contestation ? CONTESTATION_NEXT[contestation.status] : [];

  function closePanel() {
    setPanel(null);
    setError(null);
  }

  async function withAction(action: () => Promise<{ ok: boolean; message?: string }>) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "falha inesperada");
      return false;
    }
    return true;
  }

  async function handleResolve(formData: FormData) {
    const ok = await withAction(() =>
      resolveAudit(audit.id, {
        status: String(formData.get("status")),
        summary: String(formData.get("summary") ?? "").trim() || undefined,
      }),
    );
    if (ok) {
      closePanel();
      router.refresh();
    }
  }

  async function handleOpenContestation(formData: FormData) {
    const ok = await withAction(() =>
      createContestation({
        auditId: audit.id,
        distributor: String(formData.get("distributor") ?? "").trim(),
        reason: String(formData.get("reason") ?? "").trim(),
        estimatedAmount: String(formData.get("estimatedAmount") ?? "").trim(),
        protocol: String(formData.get("protocol") ?? "").trim(),
        openedAt: new Date(String(formData.get("openedAt") ?? "")).toISOString(),
        expectedResponseAt: new Date(String(formData.get("expectedResponseAt") ?? "")).toISOString(),
        ownerId: String(formData.get("ownerId") ?? "").trim(),
      }),
    );
    if (ok) {
      closePanel();
      router.refresh();
    }
  }

  async function handleTransition(formData: FormData) {
    if (!contestation) return;
    const status = String(formData.get("status"));
    const financialResult = String(formData.get("financialResult") ?? "").trim();
    const ok = await withAction(() =>
      updateContestationStatus(contestation.id, {
        status,
        financialResult: status === "encerrada" ? financialResult || undefined : undefined,
      }),
    );
    if (ok) {
      closePanel();
      router.refresh();
    }
  }

  return (
    <div className="detail" style={{ display: "grid", gridTemplateColumns: "1.25fr .8fr", gap: 16 }}>
      <section style={{ display: "grid", gap: 16 }}>
        <ShellCard className="table-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Energia &amp; OPM · Auditoria</span>
              <h2>{audit.summary ?? "Auditoria sem resumo"}</h2>
            </div>
            <StatusPill variant={AUDIT_STATUS_VARIANT[audit.status] ?? "neutral"}>{audit.status}</StatusPill>
          </div>
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 10 }}>
            <p>
              Origem: <strong>{audit.origin}</strong> · Tipo: <strong>{audit.type}</strong>
            </p>
            <p>
              Vínculo:{" "}
              <strong>
                {audit.cycleId ? `ciclo ${audit.cycleId.slice(0, 8)}` : audit.marketMigrationId ? `migração ${audit.marketMigrationId.slice(0, 8)}` : "avulsa"}
              </strong>
            </p>
            <p>
              Divergência bloqueia fechamento:{" "}
              <strong>{audit.divergenceBlocksClosing ? "sim" : "não"}</strong>
            </p>
            <p className="card-note" style={{ padding: 0 }}>
              Aberta em {formatDateTime(audit.createdAt)} · atualizada em {formatDateTime(audit.updatedAt)}
            </p>
          </div>
        </ShellCard>

        {contestation ? (
          <ShellCard className="table-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Contestação</span>
                <h2>{contestation.distributor}</h2>
              </div>
              <StatusPill variant={CONTESTATION_STATUS_VARIANT[contestation.status] ?? "neutral"}>
                {contestation.status}
              </StatusPill>
            </div>
            <div style={{ padding: "0 18px 18px", display: "grid", gap: 10 }}>
              <p>
                Motivo: <strong>{contestation.reason}</strong>
              </p>
              <p>
                Valor estimado: <strong>R$ {contestation.estimatedAmount ?? "—"}</strong> · Protocolo:{" "}
                <strong>{contestation.protocol ?? "—"}</strong>
              </p>
              <p>
                Aberta em {formatDateTime(contestation.openedAt)} · prazo esperado{" "}
                {formatDateTime(contestation.expectedResponseAt)}
              </p>
              {contestation.financialResult ? (
                <p>
                  Resultado financeiro: <strong>R$ {contestation.financialResult}</strong>
                </p>
              ) : null}
            </div>
          </ShellCard>
        ) : null}
      </section>

      <aside>
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Ações</span>
              <h2>Trabalhar auditoria</h2>
            </div>
          </div>
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 8 }}>
            {!isResolved ? (
              <button className="button button--accent" type="button" onClick={() => setPanel(panel === "resolve" ? null : "resolve")}>
                Resolver auditoria
              </button>
            ) : null}
            {canOpenContestation ? (
              <button className="button" type="button" onClick={() => setPanel(panel === "contestation" ? null : "contestation")}>
                Abrir contestação
              </button>
            ) : null}
            {contestation && nextContestationStatuses.length > 0 ? (
              <button className="button" type="button" onClick={() => setPanel(panel === "transition" ? null : "transition")}>
                Avançar contestação
              </button>
            ) : null}
            {isResolved && !canOpenContestation && (!contestation || nextContestationStatuses.length === 0) ? (
              <p className="card-note" style={{ padding: 0 }}>
                Nenhuma ação disponível — processo concluído.
              </p>
            ) : null}
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </ShellCard>

        {panel === "resolve" ? (
          <ShellCard className="panel-card">
            <form action={handleResolve} style={{ padding: 16, display: "grid", gap: 8 }}>
              <label>
                Desfecho
                <select name="status" defaultValue="sem_divergencia">
                  {RESOLUTION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Resumo (opcional)
                <input name="summary" maxLength={2000} defaultValue={audit.summary ?? ""} />
              </label>
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Salvar
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}

        {panel === "contestation" ? (
          <ShellCard className="panel-card">
            <form action={handleOpenContestation} style={{ padding: 16, display: "grid", gap: 8 }}>
              <label>
                Distribuidora
                <input name="distributor" required maxLength={200} />
              </label>
              <label>
                Motivo
                <input name="reason" required maxLength={2000} />
              </label>
              <label>
                Valor estimado (R$)
                <input name="estimatedAmount" required placeholder="1240.00" />
              </label>
              <label>
                Protocolo
                <input name="protocol" required maxLength={120} />
              </label>
              <label>
                Data de abertura
                <input name="openedAt" type="datetime-local" required />
              </label>
              <label>
                Prazo esperado
                <input name="expectedResponseAt" type="datetime-local" required />
              </label>
              <label>
                Responsável (ID do usuário)
                <input name="ownerId" required placeholder="uuid do responsável" />
              </label>
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Abrir contestação
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}

        {panel === "transition" && contestation ? (
          <ShellCard className="panel-card">
            <form action={handleTransition} style={{ padding: 16, display: "grid", gap: 8 }}>
              <label>
                Novo status
                <select name="status" defaultValue={nextContestationStatuses[0]}>
                  {nextContestationStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Resultado financeiro (obrigatório ao encerrar)
                <input name="financialResult" placeholder="980.00" />
              </label>
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Salvar
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}
      </aside>
    </div>
  );
}
