"use client";

import { useState } from "react";
import { ShellCard, ShellTable } from "./plugga-shell";
import { PendenciasView } from "./pendencias-view";
import type { HealthCheck } from "../lib/api";

type DashboardTab = "overview" | "operacoes" | "metricas" | "relatorios";

const RECENT_TRANSACTIONS = [
  {
    id: "tx-1",
    activity: "Transação App Store",
    icon: "app-store",
    price: "R$ 24,99",
    date: "12 Abr 2026",
    time: "10:45 AM",
    note: "Recarga automática app",
    status: "failed",
    statusLabel: "Falhou",
  },
  {
    id: "tx-2",
    activity: "Contrato Live Concert",
    icon: "live-concert",
    price: "R$ 320,00",
    date: "10 Abr 2026",
    time: "08:30 PM",
    note: "Faturamento energia evento",
    status: "success",
    statusLabel: "Sucesso",
  },
  {
    id: "tx-3",
    activity: "PluggaMob Estação Centro",
    icon: "station",
    price: "R$ 76,20",
    date: "14 Abr 2026",
    time: "07:10 PM",
    note: "Manutenção agendada",
    status: "pending",
    statusLabel: "Pendente",
  },
  {
    id: "tx-4",
    activity: "Licença Software OPM",
    icon: "license",
    price: "R$ 149,30",
    date: "11 Abr 2026",
    time: "09:15 AM",
    note: "Módulo auditoria ativo",
    status: "success",
    statusLabel: "Sucesso",
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
    <div className="dashboard-view" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 1. Header Superior com Pílulas de Filtro (Estilo da Referência) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
        {/* Pílulas de Navegação / Filtro */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255, 255, 255, 0.65)", border: "1px solid rgba(15, 41, 74, 0.12)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: "4px", borderRadius: "999px" }}>
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
                  padding: "8px 18px",
                  borderRadius: "999px",
                  fontSize: "13px",
                  fontWeight: isActive ? 500 : 400,
                  fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif',
                  color: isActive ? "#FFFFFF" : "rgba(15, 41, 74, 0.75)",
                  background: isActive ? "#0F294A" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: "none",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Botões Rápidos & Filtro de Período */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button className="button button--ghost" type="button" style={{ gap: "8px", fontSize: "13px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Buscar
          </button>
          <button className="button button--secondary" type="button" style={{ gap: "8px", fontSize: "13px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Esta Semana ▾
          </button>
          <button className="button button--primary" type="button" style={{ gap: "8px", fontSize: "13px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            Exportar
          </button>
        </div>
      </div>

      <PendenciasView />

      {/* 2. Primeira Fileira: Cards Métricos Superiores + Card Vibrante Laranja Intenso */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        {/* Card 1: Investimento Operacional */}
        <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "13.5px", fontWeight: 500, color: "rgba(0, 51, 51, 0.75)", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
              Investimento no seu futuro
            </span>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(0, 51, 51, 0.05)", display: "grid", placeItems: "center", color: "#003333" }}>
              ⚡
            </span>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#003333", marginBottom: "14px", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
            R$ 254.320,00
          </div>
          <button type="button" style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: "999px", background: "rgba(0, 51, 51, 0.05)", border: "1px solid rgba(0, 51, 51, 0.1)", fontSize: "12px", fontWeight: 600, color: "#003333", cursor: "pointer" }}>
            Explorar →
          </button>
        </ShellCard>

        {/* Card 2: Recargas PluggaMob */}
        <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "13.5px", fontWeight: 500, color: "rgba(0, 51, 51, 0.75)", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
              Estações PluggaMob
            </span>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(0, 163, 255, 0.12)", display: "grid", placeItems: "center", color: "#00A3FF" }}>
              🔌
            </span>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#003333", marginBottom: "14px", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
            1.428 ativas
          </div>
          <button type="button" style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: "999px", background: "rgba(0, 163, 255, 0.12)", border: "1px solid rgba(0, 163, 255, 0.25)", fontSize: "12px", fontWeight: 600, color: "#0066FF", cursor: "pointer" }}>
            Ver Mapa →
          </button>
        </ShellCard>

        {/* Card 3: Balanço Energético */}
        <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "13.5px", fontWeight: 500, color: "rgba(0, 51, 51, 0.75)", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
              Balanço Energético OPM
            </span>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(0, 51, 51, 0.05)", display: "grid", placeItems: "center", color: "#003333" }}>
              📊
            </span>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#003333", marginBottom: "14px", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
            94,8% meta
          </div>
          <button type="button" style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: "999px", background: "rgba(0, 51, 51, 0.05)", border: "1px solid rgba(0, 51, 51, 0.1)", fontSize: "12px", fontWeight: 600, color: "#003333", cursor: "pointer" }}>
            Abril ▾
          </button>
        </ShellCard>

        {/* Card 4: Card Vibrante em Laranja Intenso (Inspirado no "Retire on your terms" da referência) */}
        <div
          style={{
            padding: "20px",
            borderRadius: "20px",
            background: "linear-gradient(135deg, #00A3FF 0%, #0066FF 100%)",
            color: "#FFFFFF",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "none",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", zIndex: 2 }}>
            <span style={{ fontSize: "14px", fontWeight: 600, fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
              Metas OPM • Plugga
            </span>
            <span style={{ opacity: 0.8, fontSize: "18px" }}>⏱</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", zIndex: 2, marginTop: "12px" }}>
            <button
              type="button"
              style={{
                padding: "8px 18px",
                borderRadius: "999px",
                background: "#FFFFFF",
                color: "#0055FF",
                border: "none",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "none",
              }}
            >
              Explorar Metas
            </button>
            {/* Ilustração SVG do Micro Gráfico de Colunas */}
            <svg width="70" height="42" viewBox="0 0 70 42" fill="none" style={{ opacity: 0.9 }}>
              <rect x="5" y="24" width="7" height="18" rx="2" fill="white" fillOpacity="0.4" />
              <rect x="18" y="16" width="7" height="26" rx="2" fill="white" fillOpacity="0.6" />
              <rect x="31" y="8" width="7" height="34" rx="2" fill="white" fillOpacity="0.8" />
              <rect x="44" y="20" width="7" height="22" rx="2" fill="white" fillOpacity="0.5" />
              <rect x="57" y="4" width="7" height="38" rx="2" fill="white" />
            </svg>
          </div>
        </div>
      </div>

      {/* 3. Segunda Fileira: Preço Atual + Gráfico Principal Interativo + Indicadores */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(340px, 1.4fr) minmax(280px, 1fr)", gap: "16px" }}>
        {/* Painel Esquerdo: Preço kWh & Métricas Rápidas */}
        <ShellCard style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(0, 51, 51, 0.65)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Preço Médio kWh
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "28px", fontWeight: 600, color: "#003333", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
                114,72 BRL
              </span>
              <span style={{ fontSize: "12px", color: "rgba(0, 51, 51, 0.6)", padding: "2px 6px", borderRadius: "6px", background: "rgba(0, 51, 51, 0.05)" }}>
                USD ▾
              </span>
            </div>
          </div>

          {/* Grid de métricas secundárias */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", padding: "12px", borderRadius: "14px", background: "rgba(0, 51, 51, 0.03)", border: "1px solid rgba(0, 51, 51, 0.06)", fontSize: "12.5px" }}>
            <div><span style={{ color: "rgba(0, 51, 51, 0.6)" }}>Abertura</span> <strong style={{ display: "block", color: "#003333" }}>124,9</strong></div>
            <div><span style={{ color: "rgba(0, 51, 51, 0.6)" }}>Volume</span> <strong style={{ display: "block", color: "#003333" }}>32,6M</strong></div>
            <div><span style={{ color: "rgba(0, 51, 51, 0.6)" }}>Máxima</span> <strong style={{ display: "block", color: "#003333" }}>115,1</strong></div>
            <div><span style={{ color: "rgba(0, 51, 51, 0.6)" }}>P/E</span> <strong style={{ display: "block", color: "#003333" }}>12,4</strong></div>
            <div><span style={{ color: "rgba(0, 51, 51, 0.6)" }}>Mínima</span> <strong style={{ display: "block", color: "#003333" }}>36,7</strong></div>
            <div><span style={{ color: "rgba(0, 51, 51, 0.6)" }}>Mkt Cap</span> <strong style={{ display: "block", color: "#003333" }}>6.004T</strong></div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
            <button className="button button--primary" type="button" style={{ flex: 1, justifyContent: "center", height: "42px" }}>
              Faturar
            </button>
            <button className="button button--secondary" type="button" style={{ flex: 1, justifyContent: "center", height: "42px" }}>
              Injetar
            </button>
          </div>
        </ShellCard>

        {/* Painel Central: Gráfico de Usuários & Operações Ativas (Réplica Interativa) */}
        <ShellCard style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 600, color: "#003333", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
              Usuários & Recargas Ativas
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "rgba(0, 51, 51, 0.65)" }}>
              Acompanhe o volume operacional ao longo dos dias da semana
            </p>
          </div>

          {/* Área do Gráfico com Tooltip no dia selecionado */}
          <div style={{ position: "relative", flex: 1, minHeight: "180px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            {/* Indicador Flutuante no Topo da Curva */}
            <div style={{ position: "absolute", top: "15%", left: "62%", transform: "translateX(-50%)", background: "#FFFFFF", padding: "4px 10px", borderRadius: "8px", border: "1px solid rgba(0, 51, 51, 0.12)", boxShadow: "none", fontSize: "11px", fontWeight: 600, color: "#003333", zIndex: 5 }}>
              R$ 126,3k
            </div>

            {/* Ilustração SVG de Gráfico Curvo com Gradiente */}
            <svg width="100%" height="160" viewBox="0 0 400 160" fill="none" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00A3FF" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#00A3FF" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path
                d="M0,130 Q50,110 100,120 T200,90 T260,35 T320,110 T400,100 L400,160 L0,160 Z"
                fill="url(#chartGradient)"
              />
              <path
                d="M0,130 Q50,110 100,120 T200,90 T260,35 T320,110 T400,100"
                fill="none"
                stroke="#00A3FF"
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Linha pontilhada no ponto ativo */}
              <line x1="260" y1="35" x2="260" y2="160" stroke="#003333" strokeDasharray="3 3" strokeOpacity="0.4" />
              <circle cx="260" cy="35" r="5" fill="#003333" stroke="#FFFFFF" strokeWidth="2" />
            </svg>

            {/* Pílulas de Dias da Semana (Seletor Interativo) */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", borderTop: "1px solid rgba(0, 51, 51, 0.08)", paddingTop: "8px" }}>
              {["Qua", "Qui", "Sex", "Sáb", "Dom", "Seg", "Ter"].map((dia) => {
                const isSelected = selectedDay === dia;
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => setSelectedDay(dia)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? "#FFFFFF" : "rgba(0, 51, 51, 0.7)",
                      background: isSelected ? "#003333" : "transparent",
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

        {/* Painel Direito: Resumo de Portfólio & Scores */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ fontSize: "12px", color: "rgba(0, 51, 51, 0.65)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>
              Tipo de Portfólio
            </span>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#003333" }}>Geral / Operacional</div>
            <div style={{ borderTop: "1px solid rgba(0, 51, 51, 0.08)", paddingTop: "10px", marginTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "rgba(0, 51, 51, 0.65)" }}>Investimento Total</span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#e11d48", background: "rgba(225, 29, 72, 0.1)", padding: "2px 6px", borderRadius: "6px" }}>-1.32% 7d</span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: 600, color: "#003333", marginTop: "4px" }}>
                R$ 4.389,80
              </div>
            </div>
          </ShellCard>

          <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "rgba(0, 51, 51, 0.65)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>
                Score Crescimento
              </span>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#00A3FF", background: "rgba(0, 163, 255, 0.12)", padding: "2px 6px", borderRadius: "6px" }}>+2.45% 7d</span>
            </div>
            <div style={{ fontSize: "20px", fontWeight: 600, color: "#003333" }}>
              R$ 7.320,00
            </div>
            <div style={{ fontSize: "12.5px", color: "rgba(0, 51, 51, 0.7)", borderTop: "1px solid rgba(0, 51, 51, 0.08)", paddingTop: "8px", marginTop: "4px" }}>
              Estratégia: <strong>Crescimento Constante</strong>
            </div>
          </ShellCard>
        </div>
      </div>

      {/* 4. Terceira Fileira: Tabela de Operações Recentes + Card Escuro Verde Petróleo */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(300px, 1fr)", gap: "16px" }}>
        {/* Tabela de Operações Recentes */}
        <ShellCard className="table-card" style={{ overflow: "hidden" }}>
          <div className="card-heading" style={{ padding: "16px 20px" }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 600 }}>Operações & Transações Recentes</h2>
              <span style={{ fontSize: "12.5px", color: "rgba(0, 51, 51, 0.65)" }}>Histórico mais recente de atividades no sistema</span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="button button--ghost" type="button" style={{ height: "34px", padding: "0 12px", fontSize: "12px" }}>
                Filtros ≡
              </button>
            </div>
          </div>

          <ShellTable caption="Operações e transações recentes">
            <thead>
              <tr style={{ background: "rgba(0, 51, 51, 0.03)", textAlign: "left", fontSize: "11.5px", color: "rgba(0, 51, 51, 0.65)", textTransform: "uppercase" }}>
                <th style={{ padding: "10px 16px", width: "40px" }}>✓</th>
                <th style={{ padding: "10px 16px" }}>Atividade</th>
                <th style={{ padding: "10px 16px" }}>Valor</th>
                <th style={{ padding: "10px 16px" }}>Data & Hora</th>
                <th style={{ padding: "10px 16px" }}>Observação</th>
                <th style={{ padding: "10px 16px", textAlign: "right" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_TRANSACTIONS.map((tx) => {
                const isChecked = Boolean(checkedTxs[tx.id]);
                return (
                  <tr key={tx.id} style={{ borderBottom: "1px solid rgba(0, 51, 51, 0.06)", fontSize: "13px", color: "#003333" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(tx.id)}
                        style={{ cursor: "pointer", accentColor: "#003333" }}
                      />
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 500, display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ width: 28, height: 28, borderRadius: "8px", background: "rgba(0, 51, 51, 0.06)", display: "grid", placeItems: "center", fontSize: "13px" }}>
                        {tx.icon === "app-store" ? "📱" : tx.icon === "live-concert" ? "🎸" : tx.icon === "station" ? "⚡" : "📜"}
                      </span>
                      {tx.activity}
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>{tx.price}</td>
                    <td style={{ padding: "12px 16px", color: "rgba(0, 51, 51, 0.7)" }}>
                      <div style={{ fontWeight: 500 }}>{tx.date}</div>
                      <div style={{ fontSize: "11px", opacity: 0.75 }}>{tx.time}</div>
                    </td>
                    <td style={{ padding: "12px 16px", color: "rgba(0, 51, 51, 0.65)" }}>{tx.note}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "11.5px",
                          fontWeight: 600,
                          color: tx.status === "success" ? "#00A3FF" : tx.status === "pending" ? "#d97706" : "#e11d48",
                          background: tx.status === "success" ? "rgba(0, 163, 255, 0.12)" : tx.status === "pending" ? "rgba(217, 119, 6, 0.12)" : "rgba(225, 29, 72, 0.12)",
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

        {/* Card Escuro Azul Marinho (Balanço Total & Ações Rápidas) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              padding: "24px",
              borderRadius: "20px",
              background: "linear-gradient(155deg, #0A192F 0%, #0F2B4A 60%, #051329 100%)",
              color: "#FFFFFF",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              boxShadow: "none",
              border: "1px solid rgba(0, 163, 255, 0.25)",
              position: "relative",
            }}
          >
            <div>
              <span style={{ fontSize: "12.5px", color: "rgba(255, 255, 255, 0.7)", opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Seu Balanço Total
              </span>
              <div style={{ fontSize: "28px", fontWeight: 600, color: "#FFFFFF", marginTop: "4px", fontFamily: 'var(--font-articulat), "Articulat CF", sans-serif' }}>
                70.147,41 BRL
              </div>
            
            </div>

            {/* Três botões circulares de ação rápida */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", background: "rgba(255, 255, 255, 0.06)", padding: "12px", borderRadius: "14px", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
              {[
                { label: "Depositar", icon: "📥" },
                { label: "Sacar", icon: "📤" },
                { label: "Transferir", icon: "🔄" },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    background: "transparent",
                    border: "none",
                    color: "#FFFFFF",
                    fontSize: "11px",
                    fontWeight: 500,
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255, 255, 255, 0.12)", display: "grid", placeItems: "center", fontSize: "14px" }}>
                    {action.icon}
                  </span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mini Card de Investimento do Mês */}
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, rgba(224, 219, 199, 0.4) 0%, rgba(214, 184, 150, 0.3) 100%)",
              border: "1px solid rgba(0, 51, 51, 0.08)",
              fontSize: "13.5px",
              color: "#003333",
              textAlign: "center",
            }}
          >
            Você investiu <strong style={{ fontSize: "16px", color: "#003333" }}>R$ 1.226,30</strong> nos últimos 30 dias
          </div>
        </div>
      </div>
    </div>
  );
}
