"use client";

import type { CycleDetail } from "@plugga/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  approveCycleReport,
  closeCycle,
  generateCycleReport,
  markCycleDocumentsReceived,
  sendCycleReport,
} from "../lib/energy-client";
import { CYCLE_STATUS_LABEL, CYCLE_STATUS_VARIANT } from "./ciclos-view";
import { ShellCard, StatusPill } from "./plugga-shell";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export function CicloDetailView({ cycle }: { cycle: CycleDetail }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(call: () => ReturnType<typeof markCycleDocumentsReceived>) {
    setPending(true);
    setError(null);
    const result = await call();
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  const canReceiveDocuments = cycle.status === "aguardando_documentos";
  // Reprocessar (e reaprovar) com o ciclo já fechado é deliberado na API — o
  // e2e de energy-cycles cobre exatamente esse fluxo, com reportVersion
  // subindo e o status permanecendo fechado. A tela segue o contrato; se isso
  // deve exigir reabertura, é decisão de produto (handoff 2026-08-09, item 7).
  const canGenerateReport = cycle.status !== "aguardando_documentos";
  const canApproveReport = cycle.reportVersion > 0 && cycle.reportStatus !== "aprovado";
  const canSend = cycle.reportStatus === "aprovado";
  const canClose = cycle.closeBlockers.length === 0 && cycle.status !== "fechado";

  return (
    <div className="detail" style={{ display: "grid", gridTemplateColumns: "1.25fr .8fr", gap: 16 }}>
      <section>
        <ShellCard className="table-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Energia &amp; OPM · Ciclo</span>
              <h2>
                {cycle.clientName} · {cycle.consumerUnitCode}
              </h2>
              <span className="card-note" style={{ padding: 0 }}>
                Competência {String(cycle.competenceMonth).padStart(2, "0")}/{cycle.competenceYear}
              </span>
            </div>
            <StatusPill variant={CYCLE_STATUS_VARIANT[cycle.status]}>{CYCLE_STATUS_LABEL[cycle.status]}</StatusPill>
          </div>
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 10 }}>
            <p>
              Responsável: <strong>{cycle.ownerName ?? "sem responsável"}</strong>
            </p>
            <div className="box" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
              <strong>Próxima ação</strong>
              <p style={{ margin: "6px 0 0" }}>
                {cycle.nextActionNote ?? "sem nota registrada"} — {formatDateTime(cycle.nextActionAt)}
              </p>
            </div>
            <div className="box" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
              <strong>Relatório (versão {cycle.reportVersion})</strong>
              <p style={{ margin: "6px 0 0" }}>
                Status: {cycle.reportStatus} · Gerado: {formatDateTime(cycle.reportGeneratedAt)} · Aprovado:{" "}
                {formatDateTime(cycle.reportApprovedAt)} · Enviado: {formatDateTime(cycle.reportSentAt)}
              </p>
              <p style={{ margin: "6px 0 0" }}>
                Economia estimada: {cycle.estimatedSavings ?? "—"} · Economia realizada: {cycle.realizedSavings ?? "—"}
              </p>
            </div>
            {cycle.audits.length > 0 ? (
              <div className="box" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
                <strong>Auditorias vinculadas</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {cycle.audits.map((audit) => (
                    <li key={audit.id}>
                      {audit.type} · {audit.status}
                      {audit.divergenceBlocksClosing ? " · bloqueia fechamento" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </ShellCard>
      </section>

      <aside>
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Fluxo do ciclo</span>
              <h2>Ações</h2>
            </div>
          </div>
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 8 }}>
            <button
              className="button button--accent"
              type="button"
              disabled={!canReceiveDocuments || pending}
              onClick={() => run(() => markCycleDocumentsReceived(cycle.id))}
            >
              Documentos recebidos
            </button>
            <button
              className="button button--accent"
              type="button"
              disabled={!canGenerateReport || pending}
              onClick={() => run(() => generateCycleReport(cycle.id))}
            >
              {cycle.reportVersion > 0 ? "Reprocessar relatório" : "Gerar relatório"}
            </button>
            <button
              className="button button--accent"
              type="button"
              disabled={!canApproveReport || pending}
              onClick={() => run(() => approveCycleReport(cycle.id))}
            >
              Aprovar relatório
            </button>
            <button
              className="button button--accent"
              type="button"
              disabled={!canSend || pending}
              onClick={() => run(() => sendCycleReport(cycle.id))}
            >
              Marcar como enviado
            </button>
            <button
              className="button button--accent"
              type="button"
              disabled={!canClose || pending}
              onClick={() => run(() => closeCycle(cycle.id))}
            >
              Fechar ciclo
            </button>
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </ShellCard>

        {cycle.status !== "fechado" && cycle.closeBlockers.length > 0 ? (
          <ShellCard className="panel-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Pode fechar?</span>
                <h2>Bloqueadores</h2>
              </div>
            </div>
            <div style={{ padding: "0 18px 18px" }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {cycle.closeBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          </ShellCard>
        ) : null}
      </aside>
    </div>
  );
}
