"use client";

import { useState } from "react";
import { ShellCard, StatusPill, ShellTable } from "./plugga-shell";
import type { HealthCheck } from "../lib/api";
import {
  AUTOMATION_RUNS,
  DASHBOARD_TABS,
  type DashboardTabId,
} from "../lib/mock/dashboard";

export function DashboardView({ health }: { health: HealthCheck | null }) {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("hoje");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [activeMonthBar, setActiveMonthBar] = useState<string>("Abr");

  // Currency converter state
  const [usdVal, setUsdVal] = useState("1.200");
  const [eurVal, setEurVal] = useState("1.028");

  const currentTab = DASHBOARD_TABS.find((tab) => tab.id === activeTab) ?? DASHBOARD_TABS[0];

  const handleAiPromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setAiResponse(`Analisando "${aiPrompt}"... Previsão atualizada com sucesso.`);
  };

  const handleSwapCurrencies = () => {
    const temp = usdVal;
    setUsdVal(eurVal);
    setEurVal(temp);
  };

  return (
    <div className="dashboard-view" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Top Greeting & Action Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ fontSize: "26px", fontWeight: 500, color: "#fff", margin: "0 0 6px", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
            Olá, Operações Plugga!
          </h2>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "15px", fontWeight: 400, fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
            Bom dia, hoje é o melhor dia para gerenciar suas finanças e processos.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button className="button" type="button" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            18 Abr - 18 Mai | Mensal ▾
          </button>
          <button className="button button--secondary" type="button" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16" />
              <path d="M7 12h10" />
              <path d="M10 18h4" />
            </svg>
            Filtros
          </button>
          <button className="button button--primary" type="button" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Exportar
          </button>
        </div>
      </div>

      {/* Top Row: AI Assistant + KPI Financial Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
        {/* AI Assistant Glass Card */}
        <ShellCard className="ai-assistant-card">
          <div className="ai-assistant-header">
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="status-dot" style={{ background: "#cbd5e1", boxShadow: "0 0 8px #cbd5e1" }} /> Painel de Operações
            </span>
            <span style={{ cursor: "pointer", opacity: 0.7 }}>?</span>
          </div>

          <div className="ai-assistant-character">
            <div className="ai-avatar-floating" style={{ animation: "none" }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: "16px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                display: "grid",
                placeItems: "center",
                color: "#f1f5f9",
                fontSize: 20
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
            </div>
            <h3 className="ai-assistant-title">
              Consultas e Operações Rápidas
            </h3>
          </div>

          <div className="ai-prompt-pills">
            <button
              className="ai-prompt-pill"
              type="button"
              onClick={() => setAiPrompt("Revisar principais fornecedores")}
            >
              Revisar fornecedores
            </button>
            <button
              className="ai-prompt-pill"
              type="button"
              onClick={() => setAiPrompt("Previsão de saldo de caixa")}
            >
              Previsão de saldo
            </button>
            <button
              className="ai-prompt-pill"
              type="button"
              onClick={() => setAiPrompt("Planejar orçamento mensal")}
            >
              Orçamento mensal
            </button>
          </div>

          <form className="ai-input-bar" onSubmit={handleAiPromptSubmit}>
            <input
              type="text"
              placeholder="Digite um comando ou busca..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <button className="ai-send-btn" type="submit" aria-label="Enviar pergunta">
              ➔
            </button>
          </form>

          {aiResponse && (
            <div style={{ padding: "8px 12px", background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "10px", color: "#fff", fontSize: "12.5px" }}>
              {aiResponse}
            </div>
          )}
        </ShellCard>

        {/* Financial KPI Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
          <ShellCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat-label">Receita Mensal</span>
              <span className="status-pill status-pill--success">+8.4%</span>
            </div>
            <strong className="stat-value">R$ 351.840</strong>
            <span className="stat-note">vs. mês anterior</span>
          </ShellCard>

          <ShellCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat-label">Lucro Líquido</span>
              <span className="status-pill status-pill--danger">-6.2%</span>
            </div>
            <strong className="stat-value">R$ 137.550</strong>
            <span className="stat-note">Para este ano</span>
          </ShellCard>

          <ShellCard style={{ gridColumn: "span 2" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat-label">Despesas Totais</span>
              <span className="status-pill status-pill--success">-3.1%</span>
            </div>
            <strong className="stat-value">R$ 214.290</strong>
            <span className="stat-note">vs. mês anterior</span>
          </ShellCard>
        </div>
      </div>

      {/* Middle Row: Sales Impact Dual-Wave Chart + Quick Exchange Converter */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(320px, 1fr)", gap: "16px" }}>
        {/* Sales Impact Glowing Wave Chart */}
        <ShellCard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div>
              <span className="eyebrow">Desempenho</span>
              <h2 style={{ fontSize: "18px", margin: 0 }}>Impacto nas Vendas</h2>
            </div>
            <div style={{ display: "flex", gap: "16px", fontSize: "12.5px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ffffff" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ffffff" }} /> Novas Vendas
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94a3b8" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#94a3b8" }} /> Recompra
              </span>
            </div>
          </div>

          {/* SVG Glowing Curve Chart */}
          <div style={{ position: "relative", width: "100%", height: "220px" }}>
            <svg viewBox="0 0 700 200" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
              <defs>
                <linearGradient id="whiteGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="slateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#94a3b8" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Area Fill Slate */}
              <path
                d="M 0 160 Q 70 120 140 150 T 280 130 T 420 110 T 560 140 T 700 120 L 700 200 L 0 200 Z"
                fill="url(#slateGrad)"
              />
              {/* Stroke Slate */}
              <path
                d="M 0 160 Q 70 120 140 150 T 280 130 T 420 110 T 560 140 T 700 120"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="3"
                style={{ filter: "drop-shadow(0 0 6px rgba(255, 255, 255, 0.2))" }}
              />

              {/* Area Fill White */}
              <path
                d="M 0 100 Q 70 60 140 80 T 280 50 T 420 80 T 560 40 T 700 70 L 700 200 L 0 200 Z"
                fill="url(#whiteGrad)"
              />
              {/* Stroke White */}
              <path
                d="M 0 100 Q 70 60 140 80 T 280 50 T 420 80 T 560 40 T 700 70"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3"
                style={{ filter: "drop-shadow(0 0 8px rgba(255, 255, 255, 0.4))" }}
              />

              {/* Vertical Crosshair Marker */}
              <line x1="420" y1="10" x2="420" y2="190" stroke="rgba(255, 255, 255, 0.25)" strokeDasharray="4 4" />
              <circle cx="420" cy="80" r="5" fill="#ffffff" stroke="#000" strokeWidth="2" />
              <circle cx="420" cy="110" r="5" fill="#94a3b8" stroke="#000" strokeWidth="2" />
            </svg>

            {/* Interactive Data Tooltip */}
            <div className="chart-tooltip" style={{ top: "35px", left: "55%" }}>
              <div style={{ fontWeight: 600, fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>Maio 2026</div>
              <div style={{ color: "#ffffff", fontWeight: 600 }}>• R$ 19.040</div>
              <div style={{ color: "#cbd5e1", fontWeight: 600 }}>• R$ 14.803</div>
            </div>
          </div>

          {/* Month Labels */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 10px 0", color: "var(--muted)", fontSize: "12px" }}>
            <span>Jan</span><span>Fev</span><span>Mar</span><span>Abr</span><span style={{ color: "#fff", fontWeight: 600 }}>Mai</span><span>Jun</span><span>Jul</span><span>Ago</span><span>Set</span><span>Out</span><span>Nov</span><span>Dez</span>
          </div>
        </ShellCard>

        {/* Exchange & Quick Action Currency Card */}
        <ShellCard className="exchange-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className="eyebrow">Câmbio Rápido</span>
              <h2 style={{ fontSize: "18px", margin: 0 }}>Conversão</h2>
            </div>
            <StatusPill variant="success">+2.8%</StatusPill>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "6px 0" }}>
            <div className="exchange-row">
              <div className="exchange-flag-wrap">
                <span className="exchange-flag">🇺🇸</span>
                <span>USD</span>
              </div>
              <span className="exchange-val">$ {usdVal}</span>
            </div>

            <button
              className="exchange-swap-btn"
              type="button"
              onClick={handleSwapCurrencies}
              title="Inverter moedas"
            >
              ⇅
            </button>

            <div className="exchange-row">
              <div className="exchange-flag-wrap">
                <span className="exchange-flag">🇪🇺</span>
                <span>EUR</span>
              </div>
              <span className="exchange-val">€ {eurVal}</span>
            </div>
          </div>

          <button className="button button--primary" type="button" style={{ width: "100%", padding: "11px", textAlign: "center" }}>
            Executar Câmbio
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)" }}>
            <span>1.00 USD = 0.92 EUR</span>
            <span>Taxa: $4.04</span>
          </div>
        </ShellCard>
      </div>

      {/* Bottom Row: Expense Breakdown + Monthly Bar Income + System Health */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
        {/* Expense Breakdown Columns */}
        <ShellCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <span className="eyebrow">Categorias</span>
              <h2 style={{ fontSize: "17px", margin: 0 }}>Detalhamento de Gastos</h2>
            </div>
          </div>

          <div className="bar-chart-container">
            <div className="bar-col">
              <span style={{ fontSize: "11px", color: "#fff" }}>R$ 6.500</span>
              <div className="bar-col-fill" style={{ height: "75%" }} />
              <span className="bar-col-label">Marketing</span>
            </div>
            <div className="bar-col">
              <span style={{ fontSize: "11px", color: "#fff" }}>R$ 4.320</span>
              <div className="bar-col-fill" style={{ height: "55%" }} />
              <span className="bar-col-label">Salários</span>
            </div>
            <div className="bar-col bar-col--active">
              <span style={{ fontSize: "11px", color: "#ffffff", fontWeight: 600 }}>R$ 8.900</span>
              <div className="bar-col-fill" style={{ height: "95%", background: "linear-gradient(180deg, #ffffff, #475569)" }} />
              <span className="bar-col-label" style={{ color: "#ffffff" }}>P&D</span>
            </div>
            <div className="bar-col">
              <span style={{ fontSize: "11px", color: "#fff" }}>R$ 3.700</span>
              <div className="bar-col-fill" style={{ height: "45%" }} />
              <span className="bar-col-label">Operação</span>
            </div>
          </div>
        </ShellCard>

        {/* Monthly Income Distribution Bar Chart */}
        <ShellCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <span className="eyebrow">Faturamento</span>
              <h2 style={{ fontSize: "17px", margin: 0 }}>Renda Mensal</h2>
            </div>
            <span style={{ font: "600 18px Anybody, sans-serif", color: "#fff" }}>R$ 12.480 <span style={{ fontSize: "12px", color: "#cbd5e1" }}>+8.4%</span></span>
          </div>

          <div className="bar-chart-container">
            {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul"].map((m, idx) => {
              const heights = [35, 45, 60, 90, 50, 65, 40];
              const isSelected = m === activeMonthBar;
              return (
                <div
                  key={m}
                  className={`bar-col ${isSelected ? "bar-col--active" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setActiveMonthBar(m)}
                >
                  <div
                    className="bar-col-fill"
                    style={{
                      height: `${heights[idx]}%`,
                      background: isSelected ? "linear-gradient(180deg, #ffffff 0%, #475569 100%)" : undefined,
                    }}
                  />
                  <span className="bar-col-label">{m}</span>
                </div>
              );
            })}
          </div>
        </ShellCard>

        {/* API Health Check Container */}
        <ShellCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div>
              <span className="eyebrow">Plataforma</span>
              <h2 style={{ fontSize: "17px", margin: 0 }}>API & Servidores</h2>
            </div>
            {health ? (
              <StatusPill variant="success">Online · {health.service}</StatusPill>
            ) : (
              <StatusPill variant="danger">API Indisponível</StatusPill>
            )}
          </div>
          <p style={{ color: "var(--muted)", fontSize: "12.5px", lineHeight: "1.5", margin: 0 }}>
            {health
              ? `Status verificado via GET /health em ${new Date(health.timestamp).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}.`
              : "Sem resposta no momento. Sistema operando em modo resiliente."}
          </p>
        </ShellCard>
      </div>

      {/* Tables Section: Attention & Automation Runs */}
      <div className="content-grid content-grid--wide">
        <ShellCard className="table-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Atenção Agora</span>
              <h2>Central de Tarefas</h2>
            </div>
            <a className="button" href="/pendencias">
              Ver Central de Pendências
            </a>
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
                  <td style={{ fontWeight: 500, color: "#fff" }}>{item.title}</td>
                  <td style={{ color: "var(--muted)" }}>{item.area}</td>
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
              <h2>Execuções Recentes</h2>
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
                  <td style={{ fontWeight: 500, color: "#fff" }}>{run.job}</td>
                  <td>
                    <StatusPill variant="success">{run.result}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </ShellTable>
          <p className="card-note">
            Jobs e automações executados em segundo plano.
          </p>
        </ShellCard>
      </div>
    </div>
  );
}
