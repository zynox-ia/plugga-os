"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShellCard, ShellTable } from "./plugga-shell";
import type { HealthCheck } from "../lib/api";

type DashboardTab = "overview" | "operacoes" | "metricas" | "relatorios";

// Dados Fictícios de Clientes e Transações OPM para a Plugga
const PLUGGA_CLIENT_TRANSACTIONS = [
  {
    id: "tx-p1",
    activity: "Hospital São Lucas • Gestão de Fatura & GD",
    user: "HSL",
    role: "Cliente Corporativo",
    price: "R$ 48.500,00",
    date: "18 Abr 2026",
    status: "active",
    statusLabel: "Economia Ativa",
  },
  {
    id: "tx-p2",
    activity: "Grupo Alvorada • Geração Distribuída Compensada",
    user: "GA",
    role: "Contrato OPM Premium",
    price: "R$ 112.300,00",
    date: "17 Abr 2026",
    status: "active",
    statusLabel: "Economia Ativa",
  },
  {
    id: "tx-p3",
    activity: "Indústria Matarazzo • Auditoria Tarifária & Erros",
    user: "IM",
    role: "Auditoria Contínua",
    price: "R$ 24.620,00",
    date: "15 Abr 2026",
    status: "pending",
    statusLabel: "Em Contestação",
  },
  {
    id: "tx-p4",
    activity: "Rede Supermercados Viva • OPM de Energia & Relatório",
    user: "SV",
    role: "Cliente Multiusina",
    price: "R$ 67.800,00",
    date: "14 Abr 2026",
    status: "active",
    statusLabel: "Economia Ativa",
  },
];

const WAZE_TRANSACTIONS = [
  {
    id: "tx-w1",
    activity: "Usina Solar Park 1 • Repasse de Crédito",
    user: "USP",
    role: "Geradora GD",
    price: "R$ 85.400,00",
    date: "18 Abr 2026",
    status: "active",
    statusLabel: "Ativo",
  },
  {
    id: "tx-w2",
    activity: "Consórcio Verde • Rateio de Energia",
    user: "CV",
    role: "Consorciado",
    price: "R$ 42.100,00",
    date: "16 Abr 2026",
    status: "active",
    statusLabel: "Ativo",
  },
];

function DashboardContent({ health }: { health: HealthCheck | null }) {
  void health;
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get("empresa");
  const isPlugga = empresaParam !== "waze";

  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [selectedDay, setSelectedDay] = useState<string>("Dom");
  const [checkedTxs, setCheckedTxs] = useState<Record<string, boolean>>({ "tx-p1": true, "tx-p2": true });

  const toggleCheck = (id: string) => {
    setCheckedTxs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const transactions = isPlugga ? PLUGGA_CLIENT_TRANSACTIONS : WAZE_TRANSACTIONS;

  return (
    <div className="dashboard-view" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      {/* 1. Cabeçalho de Boas-Vindas & Filtros */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <h1
            style={{
              fontSize: "30px",
              fontWeight: 400,
              color: "#0F294A",
              margin: "0 0 4px 0",
              fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif',
              letterSpacing: "-0.01em",
            }}
          >
            {isPlugga ? (
              <>
                Plugga • <strong style={{ fontWeight: 500, color: "#0F294A" }}>Gestão de Energia & Operação OPM</strong>
              </>
            ) : (
              <>
                Waze Energia • <strong style={{ fontWeight: 500, color: "#0F294A" }}>Consórcio & Usinas Solar</strong>
              </>
            )}
          </h1>
          <p
            style={{
              fontSize: "13.5px",
              color: "rgba(15, 41, 74, 0.65)",
              margin: 0,
              fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif',
            }}
          >
            {isPlugga
              ? "Monitoramento consolidado de clientes ativos, economia gerada, contratos OPM e auditorias."
              : "Visão geral de geração distribuída, créditos compensados e repasses."}
          </p>
        </div>

        {/* Linha de Controles: Seletor de Abas à Esquerda, Botões à Direita */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          {/* Pílulas de Navegação / Seletor à Esquerda */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: "38px",
              gap: "4px",
              background: "rgba(255, 255, 255, 0.20)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              border: "1px solid rgba(255, 255, 255, 0.55)",
              boxShadow: "none",
              padding: "3px",
              borderRadius: "999px",
              boxSizing: "border-box",
            }}
          >
            {[
              { id: "overview", label: "Visão Geral" },
              { id: "operacoes", label: "Operações OPM" },
              { id: "metricas", label: "Métricas Chave" },
              { id: "relatorios", label: "Relatórios" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as DashboardTab)}
                  style={{
                    height: "32px",
                    padding: "0 16px",
                    borderRadius: "999px",
                    fontSize: "12.5px",
                    fontWeight: isActive ? 500 : 400,
                    fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif',
                    color: isActive ? "#FFFFFF" : "rgba(15, 41, 74, 0.75)",
                    background: isActive ? "#0F294A" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: isActive ? "0 4px 14px rgba(15, 41, 74, 0.3)" : "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Grupo de Botões Alinhados à Direita */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto" }}>
            <button
              className="button button--secondary"
              type="button"
              style={{
                height: "40px",
                padding: "0 18px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="4" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
              Filtrar Período
            </button>

            <button
              className="button button--primary"
              type="button"
              style={{
                height: "40px",
                padding: "0 20px",
                borderRadius: "999px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 500,
                boxSizing: "border-box",
                cursor: "pointer",
                transition: "all 0.25s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {isPlugga ? "Nova Operação OPM" : "Novo Contrato GD"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Fileira de 4 Cards Métricos Principais (Superiores) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "16px" }}>
        {isPlugga ? (
          <>
            {/* Card 1: Clientes Ativos */}
            <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(0, 163, 255, 0.1)", display: "grid", placeItems: "center", color: "#00A3FF" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "3px 8px", borderRadius: "999px" }}>
                  +4 este mês
                </span>
              </div>
              <div>
                <span style={{ fontSize: "12.5px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>
                  Clientes Ativos
                </span>
                <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px", letterSpacing: "-0.02em" }}>
                  42
                </div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.5)", marginTop: "2px", display: "block" }}>
                  quantidade de clientes com operação ativa
                </span>
              </div>
            </ShellCard>

            {/* Card 2: Economia Gerada */}
            <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(16, 185, 129, 0.1)", display: "grid", placeItems: "center", color: "#10b981" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "3px 8px", borderRadius: "999px" }}>
                  +12.4% vs mês anterior
                </span>
              </div>
              <div>
                <span style={{ fontSize: "12.5px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>
                  Economia Gerada
                </span>
                <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px", letterSpacing: "-0.02em" }}>
                  R$ 485.200
                </div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.5)", marginTop: "2px", display: "block" }}>
                  R$ economizados no mês/período
                </span>
              </div>
            </ShellCard>

            {/* Card 3: Faturamento Plugga */}
            <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(147, 51, 234, 0.1)", display: "grid", placeItems: "center", color: "#9333ea" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "3px 8px", borderRadius: "999px" }}>
                  +8.2% este mês
                </span>
              </div>
              <div>
                <span style={{ fontSize: "12.5px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>
                  Faturamento Plugga
                </span>
                <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px", letterSpacing: "-0.02em" }}>
                  R$ 142.800
                </div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.5)", marginTop: "2px", display: "block" }}>
                  receita recorrente/operacional no período
                </span>
              </div>
            </ShellCard>

            {/* Card 4: Faturas Processadas */}
            <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(245, 158, 11, 0.1)", display: "grid", placeItems: "center", color: "#f59e0b" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#0F294A", background: "rgba(15, 41, 74, 0.08)", padding: "3px 8px", borderRadius: "999px" }}>
                  99,2% precisão
                </span>
              </div>
              <div>
                <span style={{ fontSize: "12.5px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>
                  Faturas Processadas
                </span>
                <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px", letterSpacing: "-0.02em" }}>
                  1.284
                </div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.5)", marginTop: "2px", display: "block" }}>
                  faturas auditadas e processadas no período
                </span>
              </div>
            </ShellCard>
          </>
        ) : (
          /* Cards Waze Energia */
          <>
            <ShellCard style={{ padding: "20px" }}>
              <span style={{ fontSize: "12.5px", color: "rgba(15, 41, 74, 0.65)" }}>Créditos Injetados</span>
              <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px" }}>320.000 kWh</div>
            </ShellCard>
            <ShellCard style={{ padding: "20px" }}>
              <span style={{ fontSize: "12.5px", color: "rgba(15, 41, 74, 0.65)" }}>Usinas Operacionais</span>
              <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px" }}>12 Usinas</div>
            </ShellCard>
            <ShellCard style={{ padding: "20px" }}>
              <span style={{ fontSize: "12.5px", color: "rgba(15, 41, 74, 0.65)" }}>Faturamento GD</span>
              <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px" }}>R$ 127.500</div>
            </ShellCard>
            <ShellCard style={{ padding: "20px" }}>
              <span style={{ fontSize: "12.5px", color: "rgba(15, 41, 74, 0.65)" }}>Taxa de Performance GD</span>
              <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px" }}>96,5%</div>
            </ShellCard>
          </>
        )}
      </div>

      {/* Renderização Condicional com Base nas Abas (Visão Geral, Operações OPM, Métricas Chave, Relatórios) */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          {/* Grid de Cards Úteis da Visão Geral Plugga (7 Cards) */}
          {isPlugga && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
              <ShellCard style={{ padding: "16px" }}>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.65)" }}>Unidades Monitoradas</span>
                <div style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", marginTop: "2px" }}>1.850 unidades</div>
              </ShellCard>
              <ShellCard style={{ padding: "16px" }}>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.65)" }}>Contratos Ativos</span>
                <div style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", marginTop: "2px" }}>45 contratos OPM</div>
              </ShellCard>
              <ShellCard style={{ padding: "16px" }}>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.65)" }}>Créditos Compensados</span>
                <div style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", marginTop: "2px" }}>1,42 GWh</div>
              </ShellCard>
              <ShellCard style={{ padding: "16px" }}>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.65)" }}>Alertas de Economia</span>
                <div style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", marginTop: "2px" }}>12 alertas</div>
              </ShellCard>
              <ShellCard style={{ padding: "16px" }}>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.65)" }}>Pendências com Cliente</span>
                <div style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", marginTop: "2px" }}>4 pendências</div>
              </ShellCard>
              <ShellCard style={{ padding: "16px" }}>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.65)" }}>Pendências Distribuidora</span>
                <div style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", marginTop: "2px" }}>6 solicitações</div>
              </ShellCard>
              <ShellCard style={{ padding: "16px" }}>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.65)" }}>Oportunidades Identificadas</span>
                <div style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", marginTop: "2px" }}>R$ 84.000</div>
              </ShellCard>
            </div>
          )}

          {/* Gráfico & Tabela vs Decisões Plugga de Hoje */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 1fr)", gap: "18px" }}>
            {/* Coluna Esquerda: Gráfico & Tabela */}
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {/* Card Gráfico: Evolução de Economia & Curva Semanal */}
              <ShellCard style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#0F294A" }}>
                      Curva de Economia Gerada & Volume Energético
                    </h3>
                    <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "rgba(15, 41, 74, 0.6)" }}>
                      Distribuição da economia em R$ e compensações ao longo dos dias da semana
                    </p>
                  </div>
                  <button
                    type="button"
                    style={{
                      padding: "5px 12px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#0F294A",
                      background: "rgba(15, 41, 74, 0.06)",
                      border: "1px solid rgba(15, 41, 74, 0.1)",
                      cursor: "pointer",
                    }}
                  >
                    Hoje ▾
                  </button>
                </div>

                <div style={{ position: "relative", flex: 1, minHeight: "180px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div
                    style={{
                      position: "absolute",
                      top: "12%",
                      left: "62%",
                      transform: "translateX(-50%)",
                      background: "rgba(255, 255, 255, 0.9)",
                      backdropFilter: "blur(12px)",
                      padding: "4px 10px",
                      borderRadius: "8px",
                      border: "1px solid rgba(15, 41, 74, 0.12)",
                      boxShadow: "0 4px 12px rgba(15, 41, 74, 0.08)",
                      fontSize: "11.5px",
                      fontWeight: 500,
                      color: "#0F294A",
                      zIndex: 5,
                    }}
                  >
                    R$ 485,2k acumu.
                  </div>

                  <svg width="100%" height="160" viewBox="0 0 400 160" fill="none" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0F294A" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#0F294A" stopOpacity="0.01" />
                      </linearGradient>
                    </defs>
                    <path d="M0,130 Q50,110 100,120 T200,90 T260,35 T320,110 T400,100 L400,160 L0,160 Z" fill="url(#chartGradient)" />
                    <path d="M0,130 Q50,110 100,120 T200,90 T260,35 T320,110 T400,100" fill="none" stroke="#0F294A" strokeWidth="3" strokeLinecap="round" />
                    <line x1="260" y1="35" x2="260" y2="160" stroke="#0F294A" strokeDasharray="3 3" strokeOpacity="0.3" />
                    <circle cx="260" cy="35" r="5" fill="#0F294A" stroke="#FFFFFF" strokeWidth="2" />
                  </svg>

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", borderTop: "1px solid rgba(15, 41, 74, 0.08)", paddingTop: "8px" }}>
                    {["Qua", "Qui", "Sex", "Sáb", "Dom", "Seg", "Ter"].map((dia) => {
                      const isSelected = selectedDay === dia;
                      return (
                        <button
                          key={dia}
                          type="button"
                          onClick={() => setSelectedDay(dia)}
                          style={{
                            padding: "4px 11px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: isSelected ? 500 : 400,
                            color: isSelected ? "#FFFFFF" : "rgba(15, 41, 74, 0.7)",
                            background: isSelected ? "#0F294A" : "transparent",
                            border: "none",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                        >
                          {dia}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </ShellCard>

              {/* Card Tabela: Lista de Operações & Contratos OPM */}
              <ShellCard style={{ padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#0F294A" }}>
                    {isPlugga ? "Clientes & Operações OPM em Acompanhamento" : "Contratos GD & Usinas Solar"}
                  </h3>
                  <span style={{ fontSize: "12px", color: "rgba(15, 41, 74, 0.6)" }}>{transactions.length} clientes ativos</span>
                </div>

                <ShellTable caption="Tabela de operações de energia">
                  <thead>
                    <tr style={{ textAlign: "left", fontSize: "12px", color: "rgba(15, 41, 74, 0.6)", borderBottom: "1px solid rgba(15, 41, 74, 0.08)" }}>
                      <th style={{ padding: "10px 12px", width: "36px" }}>✓</th>
                      <th style={{ padding: "10px 12px" }}>Cliente & Operação</th>
                      <th style={{ padding: "10px 12px" }}>Economia / Faturamento</th>
                      <th style={{ padding: "10px 12px" }}>Última Atualização</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const isChecked = Boolean(checkedTxs[tx.id]);
                      return (
                        <tr key={tx.id} style={{ borderBottom: "1px solid rgba(15, 41, 74, 0.06)", fontSize: "13px", color: "#0F294A" }}>
                          <td style={{ padding: "12px" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCheck(tx.id)}
                              style={{ cursor: "pointer", accentColor: "#0F294A" }}
                            />
                          </td>
                          <td style={{ padding: "12px", fontWeight: 500 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: "50%",
                                  background: "rgba(15, 41, 74, 0.08)",
                                  display: "grid",
                                  placeItems: "center",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  color: "#0F294A",
                                }}
                              >
                                {tx.user}
                              </span>
                              <div>
                                <div style={{ fontWeight: 500, color: "#0F294A" }}>{tx.activity}</div>
                                <div style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)" }}>{tx.role}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "12px", fontWeight: 500 }}>{tx.price}</td>
                          <td style={{ padding: "12px", color: "rgba(15, 41, 74, 0.65)" }}>{tx.date}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>
                            <span
                              style={{
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "11.5px",
                                fontWeight: 500,
                                color: tx.status === "active" ? "#059669" : "#d97706",
                                background: tx.status === "active" ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                              }}
                            >
                              {tx.statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ShellTable>
              </ShellCard>
            </div>

            {/* Coluna Direita: Decisões Plugga de Hoje (Tom Azul Marinho Escuro com topo saliente alinhado) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div
                style={{
                  position: "relative",
                  marginTop: "24px",
                  padding: "11px",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "24px",
                  background: "linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.08) 100%)",
                  border: "1px solid rgba(255, 255, 255, 0.25)",
                }}
              >
                <div
                  style={{
                    marginTop: "-35px",
                    padding: "20px 22px",
                    borderRadius: "20px",
                    background: "linear-gradient(155deg, #0A192F 0%, #0F2B4A 60%, #051329 100%)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    color: "#FFFFFF",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    boxShadow: "0 18px 45px rgba(5, 19, 41, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
                    border: "1px solid rgba(0, 163, 255, 0.25)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#FFFFFF", letterSpacing: "-0.01em" }}>
                        Decisões Plugga de hoje
                      </h3>
                      <span style={{ fontSize: "12px", fontWeight: 400, color: "rgba(255, 255, 255, 0.55)" }}>
                        14 itens
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0 0", fontSize: "11.5px", color: "rgba(255, 255, 255, 0.65)", lineHeight: "1.35" }}>
                      Demandas prioritárias que exigem sua atuação hoje.
                    </p>
                  </div>

                  {/* Lista Minimalista de 4 Itens das Decisões Plugga de Hoje */}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {/* Item 1: Faturas com inconsistência */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "11px 0",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#00A3FF", flexShrink: 0 }}>
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "#FFFFFF" }}>
                            Faturas com inconsistência
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.55)", marginTop: "1px" }}>
                            divergência de tarifa / cobrança
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "#00A3FF", marginLeft: "auto" }}>
                        3
                      </span>
                    </div>

                    {/* Item 2: Relatórios aguardando envio */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "11px 0",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255, 255, 255, 0.70)", flexShrink: 0 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <polyline points="9 15 12 12 15 15" />
                        </svg>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255, 255, 255, 0.90)" }}>
                            Relatórios aguardando envio
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.55)", marginTop: "1px" }}>
                            consolidados prontos para cliente
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255, 255, 255, 0.80)", marginLeft: "auto" }}>
                        5
                      </span>
                    </div>

                    {/* Item 3: Clientes sem atualização */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "11px 0",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255, 255, 255, 0.70)", flexShrink: 0 }}>
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255, 255, 255, 0.90)" }}>
                            Clientes sem atualização
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.55)", marginTop: "1px" }}>
                            unidades consumidoras pendentes
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255, 255, 255, 0.80)", marginLeft: "auto" }}>
                        2
                      </span>
                    </div>

                    {/* Item 4: Oportunidades comerciais quentes */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "11px 0 4px 0",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#f59e0b", flexShrink: 0 }}>
                          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z" />
                        </svg>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255, 255, 255, 0.90)" }}>
                            Oportunidades quentes
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.55)", marginTop: "1px" }}>
                            propostas OPM em fechamento
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "#f59e0b", marginLeft: "auto" }}>
                        4
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    style={{
                      width: "100%",
                      height: "38px",
                      borderRadius: "999px",
                      background: "rgba(0, 163, 255, 0.16)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(0, 163, 255, 0.30)",
                      color: "#FFFFFF",
                      fontSize: "12.5px",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      marginTop: "2px",
                    }}
                  >
                    Tratar pendências Plugga
                    <span style={{ fontSize: "12px", opacity: 0.9 }}>→</span>
                  </button>
                </div>
              </div>

              {/* Eventos & Cronograma Plugga */}
              <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#0F294A" }}>
                    Cronograma & Fechamentos
                  </h3>
                  <span style={{ fontSize: "14px", opacity: 0.7 }}>↗</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ padding: "14px 16px", borderRadius: "16px", background: "rgba(255, 255, 255, 0.15)", backdropFilter: "blur(16px)", border: "1px solid rgba(255, 255, 255, 0.35)", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 500, color: "#0F294A" }}>
                      Fechamento da Fatura CEMIG • Hospital São Lucas
                    </div>
                    <div style={{ fontSize: "12px", color: "rgba(15, 41, 74, 0.65)" }}>
                      Validação de compensação de créditos GD e encargos.
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", fontSize: "11.5px", color: "rgba(15, 41, 74, 0.6)" }}>
                      <span>⏱ 10:00 - 11:30</span>
                      <span>📅 28 Abr, 2026</span>
                    </div>
                  </div>

                  <div style={{ padding: "14px 16px", borderRadius: "16px", background: "rgba(255, 255, 255, 0.15)", backdropFilter: "blur(16px)", border: "1px solid rgba(255, 255, 255, 0.35)", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 500, color: "#0F294A" }}>
                      Emissão do Relatório Executivo Mensal
                    </div>
                    <div style={{ fontSize: "12px", color: "rgba(15, 41, 74, 0.65)" }}>
                      Consolidação da economia acumulada para diretoria.
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", fontSize: "11.5px", color: "rgba(15, 41, 74, 0.6)" }}>
                      <span>⏱ 14:30 - 15:30</span>
                      <span>📅 29 Abr, 2026</span>
                    </div>
                  </div>
                </div>
              </ShellCard>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: OPERAÇÕES OPM */}
      {activeTab === "operacoes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", margin: "0 0 4px 0" }}>
              Operações OPM • Gestão de Faturas & Processos Energéticos
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(15, 41, 74, 0.65)", margin: 0 }}>
              Painel operacional de acompanhamento detalhado das faturas, auditorias e solicitações em distribuidoras.
            </p>
          </div>

          {/* Grid dos 10 Cards Operacionais OPM */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
            {[
              { label: "Faturas em Análise", value: "48 faturas", sub: "em triagem e auditoria automática", tag: "Em Auditoria", tagBg: "rgba(0, 163, 255, 0.1)", tagColor: "#00A3FF" },
              { label: "Relatórios Pendentes", value: "5 relatórios", sub: "aguardando envio para clientes", tag: "Ação Própria", tagBg: "rgba(245, 158, 11, 0.1)", tagColor: "#d97706" },
              { label: "Clientes em Implantação", value: "6 clientes", sub: "em processo de onboarding OPM", tag: "Onboarding", tagBg: "rgba(16, 185, 129, 0.1)", tagColor: "#059669" },
              { label: "Contratos em Gestão", value: "45 contratos", sub: "sob gestão continuada de energia", tag: "Ativos", tagBg: "rgba(15, 41, 74, 0.08)", tagColor: "#0F294A" },
              { label: "Solicitações Abertas", value: "14 chamados", sub: "em andamento com equipes técnicas", tag: "Em Curso", tagBg: "rgba(0, 163, 255, 0.1)", tagColor: "#00A3FF" },
              { label: "Erros Encontrados em Fatura", value: "3 inconsistências", sub: "cobradas indevidamente pela distribuidora", tag: "Contestação", tagBg: "rgba(239, 68, 68, 0.1)", tagColor: "#dc2626" },
              { label: "Chamados com Distribuidora", value: "8 solicitações", sub: "aguardando parecer da concessionária", tag: "Concessionária", tagBg: "rgba(245, 158, 11, 0.1)", tagColor: "#d97706" },
              { label: "Créditos GD em Acompanhamento", value: "320 MWh", sub: "volume em compensação no mês", tag: "Compensação", tagBg: "rgba(16, 185, 129, 0.1)", tagColor: "#059669" },
              { label: "Unidades sem Fatura Recebida", value: "7 unidades", sub: "cobrança pendente de emissão", tag: "Atraso Distr.", tagBg: "rgba(239, 68, 68, 0.1)", tagColor: "#dc2626" },
              { label: "Casos em Auditoria Energética", value: "4 auditorias", sub: "análise de enquadramento tarifário", tag: "Estudo Fatura", tagBg: "rgba(147, 51, 234, 0.1)", tagColor: "#9333ea" },
            ].map((op, idx) => (
              <ShellCard key={idx} style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>{op.label}</span>
                  <span style={{ fontSize: "11px", fontWeight: 500, color: op.tagColor, background: op.tagBg, padding: "2px 8px", borderRadius: "999px" }}>{op.tag}</span>
                </div>
                <div>
                  <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>{op.value}</div>
                  <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block" }}>{op.sub}</span>
                </div>
              </ShellCard>
            ))}
          </div>
        </div>
      )}

      {/* ABA 3: MÉTRICAS CHAVE */}
      {activeTab === "metricas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", margin: "0 0 4px 0" }}>
              Métricas Chave • Indicadores de Gestão & Performance Plugga
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(15, 41, 74, 0.65)", margin: 0 }}>
              Kpis de eficiência, economia acumulada, ticket médio e retornos contratuais.
            </p>
          </div>

          {/* Grid dos 10 Cards de Métricas Chave */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
            {[
              { label: "Economia Média por Cliente", value: "R$ 11.550/mês", sub: "redução média por contrato gerenciado", meta: "Meta: R$ 10k" },
              { label: "Economia Total Acumulada", value: "R$ 5.480.000", sub: "total de economia gerada aos clientes", meta: "Histórico Global" },
              { label: "Percentual Médio de Redução", value: "18,4%", sub: "economia percentual na conta de luz", meta: "+2.1% vs meta" },
              { label: "Ticket Médio Plugga", value: "R$ 3.400/mês", sub: "receita média por contrato OPM", meta: "MRR Sustentável" },
              { label: "Receita Recorrente Mensal", value: "R$ 142.800", sub: "MRR total garantido no período", meta: "+8.2% este mês" },
              { label: "Taxa de Retenção de Clientes", value: "98,6%", sub: "retenção e lealdade contratual (LTV)", meta: "Alta Retenção" },
              { label: "Tempo Médio de Entrega", value: "1,8 dias", sub: "agilidade na entrega pós-fechamento", meta: "< 2.0 dias" },
              { label: "Faturas Auditadas no Período", value: "1.284 faturas", sub: "total de faturas validadas no mês", meta: "100% Auditadas" },
              { label: "Valor Recuperado / Identificado", value: "R$ 164.200", sub: "valores reavidos por erro em fatura", meta: "Recuperação Ativa" },
              { label: "Performance por Cliente", value: "94,2%", sub: "percentual médio da meta alcançada", meta: "Excelente" },
            ].map((m, idx) => (
              <ShellCard key={idx} style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>{m.label}</span>
                  <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>{m.meta}</span>
                </div>
                <div>
                  <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>{m.value}</div>
                  <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block" }}>{m.sub}</span>
                </div>
              </ShellCard>
            ))}
          </div>
        </div>
      )}

      {/* ABA 4: RELATÓRIOS */}
      {activeTab === "relatorios" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", margin: "0 0 4px 0" }}>
              Relatórios • Central de Documentos & Auditorias Plugga
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(15, 41, 74, 0.65)", margin: 0 }}>
              Acesso rápido e exportação imediata dos relatórios consolidados de economia, faturas e auditorias.
            </p>
          </div>

          {/* Grid dos 10 Cards/Atalhos de Relatórios */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
            {[
              { title: "Relatório de Economia por Cliente", desc: "Detalhamento completo mês a mês da economia em R$ e kWh.", doc: "PDF • 2.4 MB" },
              { title: "Relatório de Faturas Auditadas", desc: "Histórico de contas validadas e inconsistências detectadas.", doc: "XLSX • 1.8 MB" },
              { title: "Relatório de Créditos de Energia", desc: "Balanço de geração distribuída e créditos compensados.", doc: "PDF • 3.1 MB" },
              { title: "Relatório de Performance Mensal", desc: "Indicadores consolidados de eficiência energética e metas.", doc: "PDF • 1.5 MB" },
              { title: "Relatório de Pendências com Distribuidora", desc: "Status de chamados e contestação de cobranças indevidas.", doc: "PDF • 1.1 MB" },
              { title: "Relatório de Contratos Ativos", desc: "Vigência, cláusulas e vigência dos contratos OPM.", doc: "XLSX • 950 KB" },
              { title: "Relatório de Oportunidades Comerciais", desc: "Mapeamento de potencial de expansão e nova economia.", doc: "PDF • 1.9 MB" },
              { title: "Relatório de Inconsistências Encontradas", desc: "Registro detalhado de erros tarifários pela distribuidora.", doc: "PDF • 1.4 MB" },
              { title: "Relatório Executivo Plugga", desc: "Resumo consolidado para conselho e diretoria executiva.", doc: "PDF • 4.2 MB" },
              { title: "Relatório Consolidado Mensal", desc: "Visão 360° do ecossistema de gestão de energia no mês.", doc: "ZIP • 8.5 MB" },
            ].map((r, idx) => (
              <ShellCard key={idx} style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "14px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A" }}>{r.title}</h4>
                    <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.5)", background: "rgba(15, 41, 74, 0.06)", padding: "2px 6px", borderRadius: "4px" }}>{r.doc}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "12px", color: "rgba(15, 41, 74, 0.65)", lineHeight: "1.4" }}>{r.desc}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      height: "32px",
                      borderRadius: "999px",
                      background: "rgba(0, 163, 255, 0.12)",
                      border: "1px solid rgba(0, 163, 255, 0.25)",
                      color: "#0070E0",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Baixar Relatório
                  </button>
                </div>
              </ShellCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardView({ health }: { health: HealthCheck | null }) {
  return (
    <Suspense fallback={<div style={{ padding: "20px", color: "#0F294A" }}>Carregando dashboard...</div>}>
      <DashboardContent health={health} />
    </Suspense>
  );
}
