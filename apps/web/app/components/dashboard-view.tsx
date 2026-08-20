"use client";

import { useState } from "react";
import { ShellCard, ShellTable } from "./plugga-shell";
import type { HealthCheck } from "../lib/api";

type DashboardTab = "overview" | "operacoes" | "metricas" | "relatorios";

const RECENT_TRANSACTIONS = [
  {
    id: "tx-1",
    activity: "James Anderson • Transação App Store",
    user: "JA",
    role: "UX/UI Designer",
    price: "R$ 2.450,00",
    date: "12 Abr 2026",
    status: "active",
    statusLabel: "Ativo",
  },
  {
    id: "tx-2",
    activity: "Alex Mika • Contrato Live Concert",
    user: "AM",
    role: "Marketing Specialist",
    price: "R$ 18.320,00",
    date: "14 Abr 2026",
    status: "active",
    statusLabel: "Ativo",
  },
  {
    id: "tx-3",
    activity: "Allison Baker • Manutenção PluggaMob",
    user: "AB",
    role: "Co-Founder",
    price: "R$ 7.620,00",
    date: "16 Abr 2026",
    status: "pending",
    statusLabel: "Pendente",
  },
  {
    id: "tx-4",
    activity: "Rafio Jolis • Licença Software OPM",
    user: "RJ",
    role: "CEO",
    price: "R$ 45.000,00",
    date: "18 Abr 2026",
    status: "active",
    statusLabel: "Ativo",
  },
];

export function DashboardView({ health }: { health: HealthCheck | null }) {
  void health;
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [selectedDay, setSelectedDay] = useState<string>("Dom");
  const [checkedTxs, setCheckedTxs] = useState<Record<string, boolean>>({ "tx-2": true });

  const toggleCheck = (id: string) => {
    setCheckedTxs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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
            Bem-vindo, <strong style={{ fontWeight: 500, color: "#0F294A" }}>André</strong>
          </h1>
          <p
            style={{
              fontSize: "13.5px",
              color: "rgba(15, 41, 74, 0.65)",
              margin: 0,
              fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif',
            }}
          >
            Aqui está a visão clara do desempenho de suas operações e estrutura OPM
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
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
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
            {/* Botão Secundário Minimalista Vidro Neutro */}
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
                <path d="M8 14h4" />
                <path d="M8 17h6" />
              </svg>
              Filtrar Período
            </button>

            {/* Botão Primário Nova Operação com Gradiente Azul Marinho a Azul Elétrico da Marca */}
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
              Nova Operação
            </button>
          </div>
        </div>
      </div>

      {/* 2. Fileira de 4 Cards Métricos Glassmorphic com Emblemas em Tons Pastel */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "16px" }}>
        {/* Card 1: Total de Operações */}
        <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(147, 51, 234, 0.1)",
                display: "grid",
                placeItems: "center",
                color: "#9333ea",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "3px 8px", borderRadius: "999px" }}>
              +5.6%
            </span>
          </div>
          <div>
            <span style={{ fontSize: "12.5px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>
              Total de Operações
            </span>
            <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px", letterSpacing: "-0.02em" }}>
              1.589
            </div>
            <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.5)", marginTop: "2px", display: "block" }}>
              em relação ao mês passado
            </span>
          </div>
        </ShellCard>

        {/* Card 2: Faturamento OPM */}
        <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.1)",
                display: "grid",
                placeItems: "center",
                color: "#10b981",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "3px 8px", borderRadius: "999px" }}>
              +7.9%
            </span>
          </div>
          <div>
            <span style={{ fontSize: "12.5px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>
              Faturamento OPM
            </span>
            <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px", letterSpacing: "-0.02em" }}>
              R$ 160.000
            </div>
            <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.5)", marginTop: "2px", display: "block" }}>
              receita operacional total
            </span>
          </div>
        </ShellCard>

        {/* Card 3: Taxa de Conclusão */}
        <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(244, 63, 94, 0.1)",
                display: "grid",
                placeItems: "center",
                color: "#f43f5e",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6" />
                <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </div>
            <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "3px 8px", borderRadius: "999px" }}>
              +3.2%
            </span>
          </div>
          <div>
            <span style={{ fontSize: "12.5px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>
              Taxa de Conclusão
            </span>
            <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px", letterSpacing: "-0.02em" }}>
              94,8%
            </div>
            <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.5)", marginTop: "2px", display: "block" }}>
              processos dentro da meta
            </span>
          </div>
        </ShellCard>

        {/* Card 4: Estações & Leads */}
        <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(245, 158, 11, 0.1)",
                display: "grid",
                placeItems: "center",
                color: "#f59e0b",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#0F294A", background: "rgba(15, 41, 74, 0.08)", padding: "3px 8px", borderRadius: "999px" }}>
              Em dia
            </span>
          </div>
          <div>
            <span style={{ fontSize: "12.5px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>
              Estações & Ativos
            </span>
            <div style={{ fontSize: "26px", fontWeight: 500, color: "#0F294A", marginTop: "4px", letterSpacing: "-0.02em" }}>
              56
            </div>
            <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.5)", marginTop: "2px", display: "block" }}>
              unidades operacionais ativas
            </span>
          </div>
        </ShellCard>
      </div>

      {/* 3. Segunda Fileira de Conteúdo: Gráfico Interativo & Tabela vs Eventos & Balanço */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 1fr)", gap: "18px" }}>
        {/* Coluna Esquerda: Gráfico de Agendamentos & Tabela */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Card Gráfico: Agendamentos & Performance Semanal */}
          <ShellCard style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#0F294A" }}>
                  Agendamentos & Volume Operacional
                </h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "rgba(15, 41, 74, 0.6)" }}>
                  Acompanhe a distribuição de cargas ao longo dos dias da semana
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

            {/* Área do Gráfico Interativo */}
            <div style={{ position: "relative", flex: 1, minHeight: "180px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              {/* Tooltip Badge Flutuante */}
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
                R$ 126,3k
              </div>

              {/* Ilustração SVG de Gráfico Curvo com Gradiente Smooth */}
              <svg width="100%" height="160" viewBox="0 0 400 160" fill="none" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0F294A" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#0F294A" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,130 Q50,110 100,120 T200,90 T260,35 T320,110 T400,100 L400,160 L0,160 Z"
                  fill="url(#chartGradient)"
                />
                <path
                  d="M0,130 Q50,110 100,120 T200,90 T260,35 T320,110 T400,100"
                  fill="none"
                  stroke="#0F294A"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <line x1="260" y1="35" x2="260" y2="160" stroke="#0F294A" strokeDasharray="3 3" strokeOpacity="0.3" />
                <circle cx="260" cy="35" r="5" fill="#0F294A" stroke="#FFFFFF" strokeWidth="2" />
              </svg>

              {/* Pílulas de Dias da Semana (Seletor Interativo) */}
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

          {/* Card Tabela: Lista de Operações & Equipe */}
          <ShellCard style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#0F294A" }}>
                Lista de Operações & Contratos
              </h3>
              <span style={{ fontSize: "12px", color: "rgba(15, 41, 74, 0.6)" }}>4 itens ativos</span>
            </div>

            <ShellTable caption="Tabela de operações ativas">
              <thead>
                <tr style={{ textAlign: "left", fontSize: "12px", color: "rgba(15, 41, 74, 0.6)", borderBottom: "1px solid rgba(15, 41, 74, 0.08)" }}>
                  <th style={{ padding: "10px 12px", width: "36px" }}>✓</th>
                  <th style={{ padding: "10px 12px" }}>Responsável & Operação</th>
                  <th style={{ padding: "10px 12px" }}>Valor</th>
                  <th style={{ padding: "10px 12px" }}>Data</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_TRANSACTIONS.map((tx) => {
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
                              fontSize: "11.5px",
                              fontWeight: 500,
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

        {/* Coluna Direita: Decisões de Hoje (Tom Azul Marinho Escuro) + Eventos & Cronograma */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Card 1: Decisões de Hoje com topo saliente (borda superior 100% alinhada pixel-perfect com Agendamentos & Volume Operacional na esquerda) */}
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
                    Decisões de hoje
                  </h3>
                  <span style={{ fontSize: "12px", fontWeight: 400, color: "rgba(255, 255, 255, 0.55)" }}>
                    2 pendentes
                  </span>
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: "11.5px", color: "rgba(255, 255, 255, 0.65)", lineHeight: "1.35" }}>
                  Demandas prioritárias que exigem sua atuação hoje.
                </p>
              </div>

              {/* Lista Minimalista de Itens (Com ícones de 17px e números alinhados à direita) */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {/* Item 1: Aprovações pendentes */}
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
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "#FFFFFF" }}>
                        Aprovações pendentes
                      </div>
                      <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.55)", marginTop: "1px" }}>
                        aguardando sua decisão
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#00A3FF", marginLeft: "auto" }}>
                    2
                  </span>
                </div>

                {/* Item 2: Em andamento */}
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
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255, 255, 255, 0.45)", flexShrink: 0 }}>
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255, 255, 255, 0.90)" }}>
                        Em andamento
                      </div>
                      <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.55)", marginTop: "1px" }}>
                        sendo processadas neste momento
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255, 255, 255, 0.35)", marginLeft: "auto" }}>
                    0
                  </span>
                </div>

                {/* Item 3: Na fila */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 0 4px 0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255, 255, 255, 0.45)", flexShrink: 0 }}>
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255, 255, 255, 0.90)" }}>
                        Na fila
                      </div>
                      <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.55)", marginTop: "1px" }}>
                        entram assim que houver capacidade
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255, 255, 255, 0.35)", marginLeft: "auto" }}>
                    0
                  </span>
                </div>
              </div>

              {/* Botão Pílula Minimalista na base */}
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
                Tratar pendências
                <span style={{ fontSize: "12px", opacity: 0.9 }}>→</span>
              </button>
            </div>
          </div>

          {/* Card 2: Eventos & Cronograma (Movido para baixo) */}
          <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#0F294A" }}>
                Eventos & Cronograma
              </h3>
              <span style={{ fontSize: "14px", opacity: 0.7 }}>↗</span>
            </div>

            {/* Lista de sub-cartões de eventos */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Evento 1 */}
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "rgba(255, 255, 255, 0.15)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255, 255, 255, 0.35)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ fontSize: "13.5px", fontWeight: 500, color: "#0F294A" }}>
                  Revisão Semanal de Performance
                </div>
                <div style={{ fontSize: "12px", color: "rgba(15, 41, 74, 0.65)" }}>
                  Avaliação de KPIs operacionais e estrutura OPM.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", fontSize: "11.5px", color: "rgba(15, 41, 74, 0.6)" }}>
                  <span>⏱ 11:00 - 12:00</span>
                  <span>📅 28 Abr, 2026</span>
                </div>
              </div>

              {/* Evento 2 */}
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "rgba(255, 255, 255, 0.15)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255, 255, 255, 0.35)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ fontSize: "13.5px", fontWeight: 500, color: "#0F294A" }}>
                  Auditoria Operacional de Presença
                </div>
                <div style={{ fontSize: "12px", color: "rgba(15, 41, 74, 0.65)" }}>
                  Conferência de registros e relatórios de estações.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", fontSize: "11.5px", color: "rgba(15, 41, 74, 0.6)" }}>
                  <span>⏱ 14:00 - 15:00</span>
                  <span>📅 29 Abr, 2026</span>
                </div>
              </div>

              {/* Evento 3 */}
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "rgba(255, 255, 255, 0.15)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255, 255, 255, 0.35)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ fontSize: "13.5px", fontWeight: 500, color: "#0F294A" }}>
                  Ciclo de Processamento Financeiro
                </div>
                <div style={{ fontSize: "12px", color: "rgba(15, 41, 74, 0.65)" }}>
                  Finalização de faturamento e repasses OPM.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", fontSize: "11.5px", color: "rgba(15, 41, 74, 0.6)" }}>
                  <span>⏱ 16:30 - 17:30</span>
                  <span>📅 30 Abr, 2026</span>
                </div>
              </div>
            </div>
          </ShellCard>
        </div>
      </div>
    </div>
  );
}
