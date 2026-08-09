"use client";

import type { CycleReportsResponse } from "@plugga/shared";
import Link from "next/link";
import { useState } from "react";

import { CYCLE_STATUS_LABEL, CYCLE_STATUS_VARIANT } from "./ciclos-view";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function RelatoriosView({ report, isLive }: { report: CycleReportsResponse; isLive: boolean }) {
  const [clientFilter, setClientFilter] = useState("");
  const [ucFilter, setUcFilter] = useState("");

  const filtered = report.items.filter(
    (item) =>
      (!clientFilter || item.clientName.toLowerCase().includes(clientFilter.toLowerCase())) &&
      (!ucFilter || item.consumerUnitCode.toLowerCase().includes(ucFilter.toLowerCase())),
  );

  // As pílulas seguem o recorte dos filtros: total geral ao lado da lista
  // filtrada leria como se a soma fosse do que está na tela.
  const totals = {
    count: filtered.length,
    estimatedSavings: filtered.reduce((soma, item) => soma + Number(item.estimatedSavings ?? 0), 0),
    realizedSavings: filtered.reduce((soma, item) => soma + Number(item.realizedSavings ?? 0), 0),
  };

  return (
    <ShellCard className="table-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Energia &amp; OPM</span>
          <h2>Relatórios</h2>
          <span className="card-note" style={{ padding: 0 }}>
            Histórico por cliente, UC e competência · economia acumulada.
          </span>
        </div>
        {!isLive ? <StatusPill variant="warning">Dados de exemplo (API indisponível)</StatusPill> : null}
      </div>

      <div style={{ padding: "0 18px 18px", display: "grid", gap: 10, gridTemplateColumns: "repeat(2, 1fr)" }}>
        <label>
          Filtrar por cliente
          <input value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} placeholder="nome do cliente" />
        </label>
        <label>
          Filtrar por UC
          <input value={ucFilter} onChange={(event) => setUcFilter(event.target.value)} placeholder="código da UC" />
        </label>
      </div>

      <div style={{ padding: "0 18px 18px", display: "flex", gap: 16 }}>
        <StatusPill variant="neutral">{totals.count} ciclos</StatusPill>
        <StatusPill variant="neutral">Economia estimada: R$ {totals.estimatedSavings.toFixed(2)}</StatusPill>
        <StatusPill variant="success">Economia realizada: R$ {totals.realizedSavings.toFixed(2)}</StatusPill>
      </div>

      <ShellTable caption="Histórico de relatórios">
        <thead>
          <tr>
            <th>Cliente / UC</th>
            <th>Competência</th>
            <th>Status</th>
            <th>Enviado em</th>
            <th>Economia estimada</th>
            <th>Economia realizada</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => (
            <tr key={item.id}>
              <td>
                <Link href={`/energia-opm/ciclos/${item.id}`}>
                  {item.clientName} · {item.consumerUnitCode}
                </Link>
              </td>
              <td>
                {String(item.competenceMonth).padStart(2, "0")}/{item.competenceYear}
              </td>
              <td>
                <StatusPill variant={CYCLE_STATUS_VARIANT[item.status]}>{CYCLE_STATUS_LABEL[item.status]}</StatusPill>
              </td>
              <td>{formatDate(item.reportSentAt)}</td>
              <td>{item.estimatedSavings ?? "—"}</td>
              <td>{item.realizedSavings ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </ShellTable>
      {filtered.length === 0 ? <p className="card-note">Nenhum relatório para os filtros aplicados.</p> : null}
    </ShellCard>
  );
}
