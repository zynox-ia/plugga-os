"use client";

import React from "react";
import { ShellCard } from "../plugga-shell";

const FONT_FAMILY = 'var(--font-general-sans), "General Sans", var(--font-articulat), "Articulat CF", -apple-system, BlinkMacSystemFont, sans-serif';

// Relógio de TMA para Ordens de Serviço
function TMAClockGauge({ value = 3.4, target = 4.0 }: { value?: number; target?: number }) {
  const isGood = value <= target;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", borderRadius: "12px", background: "rgba(15, 41, 74, 0.03)", fontFamily: FONT_FAMILY }}>
      <div style={{ position: "relative", width: 40, height: 40, display: "grid", placeItems: "center" }}>
        <svg width="40" height="40" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(15, 41, 74, 0.1)" strokeWidth="3.5" strokeDasharray="80 35" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke={isGood ? "#10b981" : "#f59e0b"}
            strokeWidth="3.5"
            strokeDasharray="75 40"
            strokeDashoffset="10"
            strokeLinecap="round"
          />
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isGood ? "#10b981" : "#f59e0b"} strokeWidth="2.4" style={{ position: "absolute" }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontSize: "18px", fontWeight: 500, color: "#0F294A" }}>{value.toFixed(1)} dias</span>
          <span style={{ fontSize: "10.5px", fontWeight: 500, color: "#059669" }}>-0.6d vs meta</span>
        </div>
        <div style={{ fontSize: "10.5px", color: "rgba(15, 41, 74, 0.55)" }}>Tempo médio de fechamento</div>
      </div>
    </div>
  );
}

// ==========================================
// CARD: PIPELINE & CONVERSÃO (LARGURA TOTAL, FORMATO TABELA, COR DO CARD DE DECISÕES)
// ==========================================
export function PipelineConversaoCard() {
  const funnelStages = [
    {
      id: "qualificacao",
      step: "01",
      name: "Qualificação & Triagem",
      deals: 42,
      amount: "R$ 4.200.000",
      avgTicket: "R$ 100.000",
      conversionRate: "61,9%",
      avgDays: "4,2 dias",
    },
    {
      id: "estudo",
      step: "02",
      name: "Estudo de Viabilidade & Economia",
      deals: 26,
      amount: "R$ 2.600.000",
      avgTicket: "R$ 100.000",
      conversionRate: "42,3%",
      avgDays: "6,8 dias",
    },
    {
      id: "proposta",
      step: "03",
      name: "Proposta Comercial & Minuta",
      deals: 11,
      amount: "R$ 1.100.000",
      avgTicket: "R$ 100.000",
      conversionRate: "54,5%",
      avgDays: "5,1 dias",
    },
    {
      id: "fechamento",
      step: "04",
      name: "Negociação & Fechamento",
      deals: 6,
      amount: "R$ 520.000",
      avgTicket: "R$ 86.666",
      conversionRate: "18,2%",
      avgDays: "3,0 dias",
    },
  ];

  const thStyle: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    padding: "12px 16px",
    fontWeight: 500,
    fontSize: "11px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.55)",
    background: "transparent",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        width: "100%",
        padding: "20px 24px",
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
        boxSizing: "border-box",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* Cabeçalho Limpo e Minimalista */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "14px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#FFFFFF", letterSpacing: "-0.01em", fontFamily: FONT_FAMILY }}>
            Pipeline &amp; Conversão de Vendas
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "rgba(255, 255, 255, 0.55)", fontFamily: FONT_FAMILY }}>
            Volume financeiro em negociação e taxas de passagem entre etapas
          </p>
        </div>

        {/* Resumo Numérico Limpo */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px", fontSize: "12.5px", fontFamily: FONT_FAMILY }}>
          <div>
            <span style={{ color: "rgba(255, 255, 255, 0.5)", marginRight: "6px" }}>Volume:</span>
            <span style={{ color: "#FFFFFF", fontWeight: 500 }}>R$ 8.420.000</span>
          </div>
          <div>
            <span style={{ color: "rgba(255, 255, 255, 0.5)", marginRight: "6px" }}>Propostas:</span>
            <span style={{ color: "#00A3FF", fontWeight: 500 }}>85 ativas</span>
          </div>
          <div>
            <span style={{ color: "rgba(255, 255, 255, 0.5)", marginRight: "6px" }}>Conversão:</span>
            <span style={{ color: "#34d399", fontWeight: 500 }}>18,2%</span>
          </div>
        </div>
      </div>

      {/* Tabela do Funil */}
      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontFamily: FONT_FAMILY }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, paddingLeft: "8px" }}>Etapa do Funil</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Negócios</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Volume</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Ticket Médio</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Tempo Médio</th>
              <th style={{ ...thStyle, textAlign: "right", paddingRight: "8px" }}>Taxa de Conversão</th>
            </tr>
          </thead>
          <tbody>
            {funnelStages.map((st) => (
              <tr
                key={st.id}
                style={{
                  transition: "background 0.15s ease",
                  fontSize: "13px",
                }}
              >
                {/* Etapa */}
                <td style={{ padding: "14px 16px 14px 8px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", background: "transparent", color: "#FFFFFF", fontWeight: 500, fontFamily: FONT_FAMILY }}>
                  <span style={{ color: "rgba(255, 255, 255, 0.4)", marginRight: "10px", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                    {st.step}
                  </span>
                  <span>{st.name}</span>
                </td>

                {/* Negócios */}
                <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", background: "transparent", textAlign: "right", color: "rgba(255, 255, 255, 0.85)", fontVariantNumeric: "tabular-nums", fontFamily: FONT_FAMILY, fontWeight: 400 }}>
                  {st.deals}
                </td>

                {/* Volume Financeiro */}
                <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", background: "transparent", textAlign: "right", color: "#FFFFFF", fontWeight: 500, fontVariantNumeric: "tabular-nums", fontFamily: FONT_FAMILY }}>
                  {st.amount}
                </td>

                {/* Ticket Médio */}
                <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", background: "transparent", textAlign: "right", color: "rgba(255, 255, 255, 0.7)", fontVariantNumeric: "tabular-nums", fontFamily: FONT_FAMILY, fontWeight: 400 }}>
                  {st.avgTicket}
                </td>

                {/* Tempo Médio */}
                <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", background: "transparent", textAlign: "right", color: "rgba(255, 255, 255, 0.7)", fontVariantNumeric: "tabular-nums", fontFamily: FONT_FAMILY, fontWeight: 400 }}>
                  {st.avgDays}
                </td>

                {/* Taxa de Conversão */}
                <td style={{ padding: "14px 8px 14px 16px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", background: "transparent", textAlign: "right", color: "#34d399", fontWeight: 500, fontVariantNumeric: "tabular-nums", fontFamily: FONT_FAMILY }}>
                  {st.conversionRate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// CARD 6: GERAÇÃO DE LEADS POR PERFIL & CANAL
// ==========================================
export function GeracaoLeadsCard() {
  return (
    <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A", fontFamily: FONT_FAMILY }}>
          Geração de Leads
        </h4>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 7px", borderRadius: "999px" }}>
          +48 este mês
        </span>
      </div>

      <div>
        <span style={{ fontSize: "10.5px", fontWeight: 500, color: "rgba(15, 41, 74, 0.55)", display: "block", marginBottom: "6px" }}>
          Por Perfil Tarifário:
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px" }}>
          <div style={{ padding: "6px 8px", borderRadius: "8px", background: "rgba(0, 163, 255, 0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10.5px", color: "#0070E0", fontWeight: 500 }}>Grupo A</span>
            <span style={{ fontSize: "12px", color: "#0070E0", fontWeight: 500 }}>14</span>
          </div>
          <div style={{ padding: "6px 8px", borderRadius: "8px", background: "rgba(15, 41, 74, 0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10.5px", color: "#0F294A", fontWeight: 500 }}>Grupo B</span>
            <span style={{ fontSize: "12px", color: "#0F294A", fontWeight: 500 }}>18</span>
          </div>
          <div style={{ padding: "6px 8px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10.5px", color: "#059669", fontWeight: 500 }}>GD</span>
            <span style={{ fontSize: "12px", color: "#059669", fontWeight: 500 }}>11</span>
          </div>
          <div style={{ padding: "6px 8px", borderRadius: "8px", background: "rgba(147, 51, 234, 0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10.5px", color: "#9333ea", fontWeight: 500 }}>ACL</span>
            <span style={{ fontSize: "12px", color: "#9333ea", fontWeight: 500 }}>5</span>
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid rgba(15, 41, 74, 0.06)", paddingTop: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px", color: "rgba(15, 41, 74, 0.65)" }}>
          <span>Indicação: <span style={{ color: "#0F294A", fontWeight: 500 }}>22</span></span>
          <span>Digital: <span style={{ color: "#0F294A", fontWeight: 500 }}>14</span></span>
          <span>Outbound: <span style={{ color: "#0F294A", fontWeight: 500 }}>12</span></span>
        </div>
      </div>
    </ShellCard>
  );
}

// ==========================================
// CARD 7: PROJETOS TÉCNICOS EM ANDAMENTO
// ==========================================
export function ProjetosAndamentoCard() {
  return (
    <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A", fontFamily: FONT_FAMILY }}>
          Projetos em Andamento
        </h4>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#0070E0", background: "rgba(0, 163, 255, 0.1)", padding: "2px 7px", borderRadius: "999px" }}>
          22 ativos
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ padding: "7px 9px", borderRadius: "8px", background: "rgba(15, 41, 74, 0.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span style={{ fontSize: "14px" }}>☀️</span>
            <div>
              <div style={{ fontSize: "11.5px", fontWeight: 500, color: "#0F294A" }}>Solar Fotovoltaico</div>
              <span style={{ fontSize: "10px", color: "rgba(15, 41, 74, 0.5)" }}>8 em Execução • 6 Homologação</span>
            </div>
          </div>
          <span style={{ fontSize: "12.5px", color: "#0F294A", fontWeight: 500 }}>14 usinas</span>
        </div>

        <div style={{ padding: "7px 9px", borderRadius: "8px", background: "rgba(15, 41, 74, 0.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span style={{ fontSize: "14px" }}>🔋</span>
            <div>
              <div style={{ fontSize: "11.5px", fontWeight: 500, color: "#0F294A" }}>Sistemas BESS (Baterias)</div>
              <span style={{ fontSize: "10px", color: "rgba(15, 41, 74, 0.5)" }}>2 Montagem • 1 Comissionamento</span>
            </div>
          </div>
          <span style={{ fontSize: "12.5px", color: "#059669", fontWeight: 500 }}>3 sistemas</span>
        </div>

        <div style={{ padding: "7px 9px", borderRadius: "8px", background: "rgba(15, 41, 74, 0.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span style={{ fontSize: "14px" }}>⚡</span>
            <div>
              <div style={{ fontSize: "11.5px", fontWeight: 500, color: "#0F294A" }}>Infraestrutura Elétrica</div>
              <span style={{ fontSize: "10px", color: "rgba(15, 41, 74, 0.5)" }}>Subestações e redes</span>
            </div>
          </div>
          <span style={{ fontSize: "12.5px", color: "#0070E0", fontWeight: 500 }}>5 projetos</span>
        </div>
      </div>
    </ShellCard>
  );
}

// ==========================================
// CARD 8: GESTÃO DE ORDENS DE SERVIÇO (O.S.)
// ==========================================
export function GestaoOSCard() {
  return (
    <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A", fontFamily: FONT_FAMILY }}>
          Ordens de Serviço (O.S.)
        </h4>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 7px", borderRadius: "999px" }}>
          Operação Estável
        </span>
      </div>

      <TMAClockGauge value={3.4} target={4.0} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div style={{ padding: "7px 8px", borderRadius: "8px", background: "rgba(0, 163, 255, 0.08)", textAlign: "center" }}>
          <span style={{ fontSize: "10px", color: "#0070E0", fontWeight: 500 }}>OSs em Aberto</span>
          <div style={{ fontSize: "15px", fontWeight: 500, color: "#0070E0", marginTop: "1px" }}>14</div>
          <span style={{ fontSize: "9px", color: "rgba(15, 41, 74, 0.5)" }}>triagem inicial</span>
        </div>
        <div style={{ padding: "7px 8px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.08)", textAlign: "center" }}>
          <span style={{ fontSize: "10px", color: "#d97706", fontWeight: 500 }}>Em Tratativa</span>
          <div style={{ fontSize: "15px", fontWeight: 500, color: "#d97706", marginTop: "1px" }}>8</div>
          <span style={{ fontSize: "9px", color: "rgba(15, 41, 74, 0.5)" }}>em execução</span>
        </div>
      </div>
    </ShellCard>
  );
}
