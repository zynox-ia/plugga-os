"use client";

import { useState } from "react";
import Link from "next/link";

import { ShellCard, StatusPill, ShellTable } from "./plugga-shell";
import type { HealthCheck } from "../lib/api";
import {
  AUTOMATION_RUNS,
  DASHBOARD_KPIS,
  DASHBOARD_TABS,
  type DashboardTabId,
} from "../lib/mock/dashboard";

export function DashboardView({ health }: { health: HealthCheck | null }) {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("hoje");
  const currentTab = DASHBOARD_TABS.find((tab) => tab.id === activeTab) ?? DASHBOARD_TABS[0];

  return (
    <>
      <div className="dashboard-status">
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Plataforma</span>
              <h2>Conectividade com a API</h2>
            </div>
            {health ? (
              <StatusPill variant="success">Online · {health.service}</StatusPill>
            ) : (
              <StatusPill variant="danger">API indisponível</StatusPill>
            )}
          </div>
          <p className="card-note">
            {health
              ? `Última verificação de GET /health: ${new Date(health.timestamp).toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (America/Manaus).`
              : "Não foi possível confirmar GET /health agora. Os dados abaixo são mock de front-end."}
          </p>
        </ShellCard>
      </div>

      <div className="stat-grid" aria-label="Indicadores operacionais">
        {DASHBOARD_KPIS.map((kpi) => (
          <ShellCard key={kpi.id} tone={kpi.tone}>
            <span className="stat-label">{kpi.label}</span>
            <strong className="stat-value">{kpi.value}</strong>
            <span className="stat-note">{kpi.note}</span>
          </ShellCard>
        ))}
      </div>

      <div className="content-grid content-grid--wide">
        <ShellCard className="table-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Atenção agora</span>
              <h2>Precisa de você</h2>
            </div>
            <Link className="button" href="/pendencias">
              Ver Central de Pendências
            </Link>
          </div>

          <div role="tablist" aria-label="Filtros do dashboard" className="view-tabs">
            {DASHBOARD_TABS.map((tab) => (
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

          <ShellTable caption={`Itens que precisam de atenção · ${currentTab?.label ?? ""}`}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Área</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {currentTab?.attention.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.area}</td>
                  <td>
                    <StatusPill variant={item.variant}>{item.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </ShellTable>
        </ShellCard>

        <ShellCard className="table-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Automação</span>
              <h2>Rodou sozinho</h2>
            </div>
            <StatusPill variant="success">{AUTOMATION_RUNS.length} OK</StatusPill>
          </div>
          <ShellTable caption="Últimas automações executadas">
            <thead>
              <tr>
                <th>Job</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {AUTOMATION_RUNS.map((run) => (
                <tr key={run.id}>
                  <td>{run.job}</td>
                  <td>
                    <StatusPill variant="success">{run.result}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </ShellTable>
          <p className="card-note">
            Jobs e Automações fica em modo inventário (mock) até a fundação de backend do P2-6 ser liberada.
          </p>
        </ShellCard>
      </div>
    </>
  );
}
