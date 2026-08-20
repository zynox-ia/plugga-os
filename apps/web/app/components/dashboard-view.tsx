"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShellCard, ShellTable } from "./plugga-shell";
import type { HealthCheck } from "../lib/api";

type DashboardTab = "overview" | "operacoes" | "metricas" | "relatorios";

// ==========================================
// COMPONENTES INDIVIDUALIZADOS DE GRÁFICOS SVG
// ==========================================

// 1. Sparkline Suave com Nó Destacado (Inspiração: Reference Image 1 & 2)
function SoftWavySparkline({ color = "#00A3FF" }: { color?: string }) {
  return (
    <div style={{ width: "100%", height: 36, position: "relative" }}>
      <svg width="100%" height="36" viewBox="0 0 120 36" fill="none" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`waveSparkGrad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d="M0,26 C20,26 35,16 55,20 C75,24 90,4 110,6 L120,4 L120,36 L0,36 Z" fill={`url(#waveSparkGrad-${color.replace("#", "")})`} />
        <path d="M0,26 C20,26 35,16 55,20 C75,24 90,4 110,6 L120,4" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="120" cy="4" r="3.5" fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// 2. Gráfico de Pilares Verticais com Última Barra Destacada (Inspiração: Reference Image 1)
function VerticalPillarsChart({ values = [40, 65, 50, 80, 60, 95] }: { values?: number[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", height: 34, width: "100%" }}>
      {values.map((h, i) => {
        const isLast = i === values.length - 1;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              borderRadius: "4px 4px 2px 2px",
              background: isLast
                ? "linear-gradient(180deg, #00A3FF 0%, #0F294A 100%)"
                : "rgba(15, 41, 74, 0.12)",
              boxShadow: isLast ? "0 2px 8px rgba(0, 163, 255, 0.4)" : "none",
              transition: "height 0.3s ease",
            }}
          />
        );
      })}
    </div>
  );
}

// 3. Anel Circular de Progresso / Donut Ring (Inspiração: Reference Image 1 & 3)
function CircularDonutRing({ percentage = 99.2, size = 42, color = "#00A3FF" }: { percentage?: number; size?: number; color?: string }) {
  const radius = (size - 8) / 2;
  const strokeWidth = 3.8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size, display: "grid", placeItems: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(15, 41, 74, 0.1)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <span style={{ position: "absolute", fontSize: "10px", fontWeight: 600, color: "#0F294A" }}>
        {Math.round(percentage)}%
      </span>
    </div>
  );
}

// 4. Barra Segmentada Horizontal de Progresso (Inspiração: Reference Image 1)
function SegmentedStackBar() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
      <div style={{ display: "flex", height: "7px", borderRadius: "999px", overflow: "hidden", gap: "2px" }}>
        <div style={{ flex: 45, background: "#00A3FF" }} title="Corporativo (45%)" />
        <div style={{ flex: 35, background: "#10b981" }} title="Industrial (35%)" />
        <div style={{ flex: 20, background: "#f59e0b" }} title="Multiusina (20%)" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "rgba(15, 41, 74, 0.6)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00A3FF" }} /> Corp 45%
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} /> Ind 35%
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} /> Multi 20%
        </span>
      </div>
    </div>
  );
}

// 5. Medidor Semicircular / Gauge Chart (Inspiração: Reference Image 1 & 2)
function SemicircularGauge({ value = 84.5, title = "Meta Mensal de Economia" }: { value?: number; title?: string }) {
  const radius = 64;
  const strokeWidth = 12;
  const circumference = Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: "10px" }}>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "flex-end", width: "100%", height: "105px" }}>
        <svg width="180" height="96" viewBox="0 0 180 96" fill="none">
          <defs>
            <linearGradient id="gaugeArcGradPremium" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00A3FF" />
              <stop offset="50%" stopColor="#0066CC" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <filter id="arcGlow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#00A3FF" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Arco de Fundo Suave */}
          <path
            d="M 18 90 A 64 64 0 0 1 162 90"
            fill="none"
            stroke="rgba(15, 41, 74, 0.08)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Arco de Progresso Gradiente com Glow */}
          <path
            d="M 18 90 A 64 64 0 0 1 162 90"
            fill="none"
            stroke="url(#gaugeArcGradPremium)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            filter="url(#arcGlow)"
          />

          {/* Pontos de Marcadores de Escala (0%, 50%, 100%) */}
          <circle cx="18" cy="90" r="2.5" fill="rgba(15, 41, 74, 0.25)" />
          <circle cx="90" cy="26" r="2.5" fill="rgba(15, 41, 74, 0.25)" />
          <circle cx="162" cy="90" r="2.5" fill="rgba(15, 41, 74, 0.25)" />
        </svg>

        {/* Display Central em Destaque Absoluto */}
        <div style={{ position: "absolute", bottom: "4px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: "28px", fontWeight: 600, color: "#0F294A", lineHeight: 1, letterSpacing: "-0.02em" }}>
            {value}%
          </div>
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: 500,
              color: "#059669",
              background: "rgba(16, 185, 129, 0.12)",
              padding: "2px 8px",
              borderRadius: "999px",
              marginTop: "4px",
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
            }}
          >
            ▲ +4.5% vs Meta
          </span>
        </div>
      </div>

      {/* Roda-pé Integrado do Card com Estatísticas em Duas Colunas */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          paddingTop: "12px",
          borderTop: "1px solid rgba(15, 41, 74, 0.08)",
          marginTop: "2px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)" }}>Projeção do Mês</span>
          <span style={{ fontSize: "13.5px", fontWeight: 500, color: "#0F294A" }}>R$ 574.000</span>
        </div>
        <div style={{ width: "1px", height: "24px", background: "rgba(15, 41, 74, 0.08)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", textAlign: "right" }}>
          <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)" }}>Economia Realizada</span>
          <span style={{ fontSize: "13.5px", fontWeight: 500, color: "#059669" }}>R$ 485.200</span>
        </div>
      </div>
    </div>
  );
}

// 6. Mapa de Calor / Heatmap Grid Chart (Inspiração: Reference Image 3)
function HeatmapGridChart() {
  const utilities = ["CEMIG", "CPFL", "COPEL", "ENEL"];
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const matrix = [
    [1, 2, 3, 3, 2, 1, 0],
    [2, 3, 2, 3, 3, 2, 1],
    [0, 1, 2, 2, 1, 1, 0],
    [1, 2, 3, 2, 2, 3, 1],
  ];

  const getColor = (level: number) => {
    switch (level) {
      case 3: return "#00A3FF";
      case 2: return "rgba(0, 163, 255, 0.65)";
      case 1: return "rgba(0, 163, 255, 0.3)";
      default: return "rgba(15, 41, 74, 0.08)";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", fontWeight: 500, color: "#0F294A" }}>Volume por Concessionária</span>
        <span style={{ fontSize: "10.5px", color: "rgba(15, 41, 74, 0.55)" }}>Carga Semanal</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {utilities.map((util, r) => (
          <div key={util} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.65)", width: "42px", fontWeight: 500 }}>{util}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", flex: 1 }}>
              {(matrix[r] ?? []).map((level, c) => (
                <div
                  key={c}
                  title={`${util} • ${days[c]}`}
                  style={{
                    height: "13px",
                    borderRadius: "3px",
                    background: getColor(level),
                    transition: "all 0.2s ease",
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "rgba(15, 41, 74, 0.5)", marginTop: "2px" }}>
        <span>Baixa</span>
        <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: "rgba(15, 41, 74, 0.08)" }} />
          <span style={{ width: 7, height: 7, borderRadius: 2, background: "rgba(0, 163, 255, 0.3)" }} />
          <span style={{ width: 7, height: 7, borderRadius: 2, background: "rgba(0, 163, 255, 0.65)" }} />
          <span style={{ width: 7, height: 7, borderRadius: 2, background: "#00A3FF" }} />
        </div>
        <span>Pico</span>
      </div>
    </div>
  );
}

// 7. Gráfico de Pontos Por Dia / Dot Plot Stem Chart (Inspiração: Reference Image 1)
function DotPlotChart({ values = [2, 5, 3, 8, 4, 1, 6] }: { values?: number[] }) {
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const max = Math.max(...values, 10);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", height: "42px", width: "100%", paddingTop: "4px" }}>
      {values.map((v, idx) => {
        const heightPct = (v / max) * 100;
        const isPeak = v === Math.max(...values);
        return (
          <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", flex: 1 }}>
            <div style={{ position: "relative", height: "26px", width: "2px", background: "rgba(15, 41, 74, 0.12)", display: "flex", alignItems: "flex-end" }}>
              <div
                style={{
                  position: "absolute",
                  bottom: `${heightPct}%`,
                  left: "50%",
                  transform: "translate(-50%, 50%)",
                  width: isPeak ? "9px" : "6px",
                  height: isPeak ? "9px" : "6px",
                  borderRadius: "50%",
                  background: isPeak ? "#00A3FF" : "#0F294A",
                  boxShadow: isPeak ? "0 0 8px rgba(0, 163, 255, 0.6)" : "none",
                }}
              />
            </div>
            <span style={{ fontSize: "9.5px", color: isPeak ? "#00A3FF" : "rgba(15, 41, 74, 0.6)", fontWeight: isPeak ? 600 : 400 }}>
              {days[idx]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 8. Barra de Funil Por Etapas (Onboarding / Implantação)
function StepFunnelProgress({ currentStep = 3 }: { currentStep?: number }) {
  const steps = ["Triagem", "Análise", "Auditoria", "Concluído"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {steps.map((s, idx) => {
          const isDone = idx < currentStep;
          const isCurrent = idx === currentStep - 1;
          return (
            <div
              key={s}
              style={{
                flex: 1,
                height: "6px",
                borderRadius: "999px",
                background: isDone
                  ? isCurrent
                    ? "#00A3FF"
                    : "#10b981"
                  : "rgba(15, 41, 74, 0.1)",
                transition: "all 0.3s ease",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "rgba(15, 41, 74, 0.6)" }}>
        <span>Onboarding (Etapa {currentStep}/4)</span>
        <span style={{ fontWeight: 500, color: "#059669" }}>75% concluído</span>
      </div>
    </div>
  );
}

// 9. Comparação Dual-Tone de Créditos GD (Injetado vs Compensado)
function DualToneComparisonBar() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
        <span style={{ color: "rgba(15, 41, 74, 0.65)" }}>Injetados: <strong style={{ color: "#00A3FF" }}>320 MWh</strong></span>
        <span style={{ color: "rgba(15, 41, 74, 0.65)" }}>Compensados: <strong style={{ color: "#10b981" }}>295 MWh</strong></span>
      </div>
      <div style={{ position: "relative", height: "8px", borderRadius: "999px", background: "rgba(15, 41, 74, 0.08)", overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", background: "#00A3FF", opacity: 0.3, borderRadius: "999px" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: "92%", height: "100%", background: "#10b981", borderRadius: "999px" }} />
      </div>
    </div>
  );
}

// 10. Relógio de Velocidade / Speedometer Clock
function SpeedometerClockArc({ label = "1,8 dias", subtitle = "Tempo Médio" }: { label?: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
      <div style={{ position: "relative", width: 34, height: 34, display: "grid", placeItems: "center" }}>
        <svg width="34" height="34" viewBox="0 0 34 34">
          <circle cx="17" cy="17" r="13" fill="none" stroke="rgba(15, 41, 74, 0.1)" strokeWidth="3" strokeDasharray="60 25" />
          <circle cx="17" cy="17" r="13" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="55 30" strokeDashoffset="8" strokeLinecap="round" />
        </svg>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" style={{ position: "absolute" }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#0F294A" }}>{label}</div>
        <div style={{ fontSize: "10.5px", color: "rgba(15, 41, 74, 0.55)" }}>{subtitle}</div>
      </div>
    </div>
  );
}

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
  const [chartTimeframe, setChartTimeframe] = useState<string>("30d");
  const [checkedTxs, setCheckedTxs] = useState<Record<string, boolean>>({ "tx-p1": true, "tx-p2": true });

  const toggleCheck = (id: string) => {
    setCheckedTxs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const transactions = isPlugga ? PLUGGA_CLIENT_TRANSACTIONS : WAZE_TRANSACTIONS;

  return (
    <div className="dashboard-view" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      {/* 1. Cabeçalho de Boas-Vindas & Filtros (Restaurado com 'Bem-vindo, André') */}
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

      {/* 2. Fileira de 4 Cards Métricos Principais Superiores (Limpos) */}
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
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  clientes com operação ativa
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
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  R$ economizados no período
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
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  receita recorrente / operacional
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
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  faturas auditadas no período
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

      {/* ABA 1: VISÃO GERAL */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 1fr)", gap: "18px" }}>
          {/* Coluna Esquerda: Gráficos de Área, Análise Visual & Tabela de Operações */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Card Gráfico 1: Curva Dinâmica de Economia Gerada & Compensação de Energia */}
            <ShellCard style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#0F294A" }}>
                    Evolução da Economia Gerada & Créditos Compensados
                  </h3>
                  <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "rgba(15, 41, 74, 0.6)" }}>
                    Economia acumulada em R$ e compensação energética mensal (kWh)
                  </p>
                </div>

                {/* Seletor de Período do Gráfico */}
                <div style={{ display: "flex", gap: "4px", background: "rgba(15, 41, 74, 0.05)", padding: "3px", borderRadius: "999px" }}>
                  {["30d", "6m", "1a"].map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setChartTimeframe(tf)}
                      style={{
                        padding: "3px 10px",
                        borderRadius: "999px",
                        fontSize: "11.5px",
                        fontWeight: chartTimeframe === tf ? 500 : 400,
                        color: chartTimeframe === tf ? "#FFFFFF" : "#0F294A",
                        background: chartTimeframe === tf ? "#0F294A" : "transparent",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {tf === "30d" ? "30 dias" : tf === "6m" ? "6 meses" : "1 ano"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Área Gráfica Interativa com Ilustração SVG de Área Gradiente */}
              <div style={{ position: "relative", flex: 1, minHeight: "190px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                {/* Badge Flutuante no Gráfico */}
                <div
                  style={{
                    position: "absolute",
                    top: "10%",
                    left: "64%",
                    transform: "translateX(-50%)",
                    background: "rgba(255, 255, 255, 0.95)",
                    backdropFilter: "blur(12px)",
                    padding: "6px 12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(0, 163, 255, 0.25)",
                    boxShadow: "0 6px 16px rgba(15, 41, 74, 0.12)",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#0F294A",
                    zIndex: 5,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00A3FF" }} />
                  <span>R$ 485.200,00 economizados</span>
                </div>

                <svg width="100%" height="170" viewBox="0 0 500 170" fill="none" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="pluggaEconomyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00A3FF" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#0F294A" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path d="M0,140 Q60,120 120,130 T240,85 T340,30 T440,95 T500,80 L500,170 L0,170 Z" fill="url(#pluggaEconomyGradient)" />
                  <path d="M0,140 Q60,120 120,130 T240,85 T340,30 T440,95 T500,80" fill="none" stroke="#00A3FF" strokeWidth="3.2" strokeLinecap="round" />
                  <line x1="340" y1="30" x2="340" y2="170" stroke="#00A3FF" strokeDasharray="3 3" strokeOpacity="0.4" />
                  <circle cx="340" cy="30" r="5.5" fill="#00A3FF" stroke="#FFFFFF" strokeWidth="2.5" />
                </svg>

                {/* Seletor Pílula de Dias da Semana */}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", borderTop: "1px solid rgba(15, 41, 74, 0.08)", paddingTop: "10px" }}>
                  {["Qua", "Qui", "Sex", "Sáb", "Dom", "Seg", "Ter"].map((dia) => {
                    const isSelected = selectedDay === dia;
                    return (
                      <button
                        key={dia}
                        type="button"
                        onClick={() => setSelectedDay(dia)}
                        style={{
                          padding: "4px 12px",
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

              {/* 3 Indicadores Rápidos Integrados na Base do Gráfico */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginTop: "4px", paddingTop: "14px", borderTop: "1px solid rgba(15, 41, 74, 0.08)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.6)" }}>Unidades Monitoradas</span>
                  <span style={{ fontSize: "16px", fontWeight: 500, color: "#0F294A" }}>1.850 unidades</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.6)" }}>Créditos Compensados</span>
                  <span style={{ fontSize: "16px", fontWeight: 500, color: "#0F294A" }}>1,42 GWh</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.6)" }}>Oportunidades Mapeadas</span>
                  <span style={{ fontSize: "16px", fontWeight: 500, color: "#059669" }}>R$ 84.000,00</span>
                </div>
              </div>
            </ShellCard>

            {/* Novo Grid 2 Colunas: Medidor Gauge de Meta + Heatmap por Concessionária */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "18px" }}>
              {/* Card 2.1: Semicircular Gauge de Meta */}
              <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: "4px" }}>
                  <h4 style={{ margin: 0, fontSize: "13.5px", fontWeight: 500, color: "#0F294A" }}>Atingimento da Meta</h4>
                  <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 7px", borderRadius: "999px" }}>
                    +4.5% acima
                  </span>
                </div>
                <SemicircularGauge value={84.5} title="Meta Mensal de Economia" />
              </ShellCard>

              {/* Card 2.2: Heatmap Grid por Concessionária */}
              <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <HeatmapGridChart />
              </ShellCard>
            </div>

            {/* Card Tabela: Clientes & Operações OPM em Acompanhamento */}
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

          {/* Coluna Direita: Decisões de Hoje (Tom Azul Marinho Escuro com topo saliente alinhado) */}
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
                      Decisões de hoje
                    </h3>
                    <span style={{ fontSize: "12px", fontWeight: 400, color: "rgba(255, 255, 255, 0.55)" }}>
                      14 itens
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: "11.5px", color: "rgba(255, 255, 255, 0.65)", lineHeight: "1.35" }}>
                    Demandas prioritárias que exigem sua atuação hoje.
                  </p>
                </div>

                {/* Lista Minimalista dos 4 Itens das Decisões de Hoje */}
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
                  Tratar pendências
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

          {/* Grid dos 10 Cards Operacionais OPM com Visualização Individualizada por Card */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "16px" }}>
            {/* Card 1: Faturas em Análise + Barra Segmentada */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Faturas em Análise</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#00A3FF", background: "rgba(0, 163, 255, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Em Auditoria</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>48 faturas</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block" }}>em triagem e auditoria automática</span>
              </div>
              <SegmentedStackBar />
            </ShellCard>

            {/* Card 2: Relatórios Pendentes + Circular Donut Ring */}
            <ShellCard style={{ padding: "18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Relatórios Pendentes</span>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>5 relatórios</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)" }}>aguardando envio ao cliente</span>
                <span style={{ fontSize: "10.5px", fontWeight: 500, color: "#d97706", background: "rgba(245, 158, 11, 0.1)", padding: "2px 7px", borderRadius: "999px", width: "fit-content", marginTop: "2px" }}>Ação Própria</span>
              </div>
              <CircularDonutRing percentage={83.3} size={46} color="#f59e0b" />
            </ShellCard>

            {/* Card 3: Clientes em Implantação + Funnel Progress */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Clientes em Implantação</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Onboarding</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>6 clientes</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block" }}>em onboarding de contrato OPM</span>
              </div>
              <StepFunnelProgress currentStep={3} />
            </ShellCard>

            {/* Card 4: Contratos em Gestão + Vertical Pillars Chart */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Contratos em Gestão</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#0F294A", background: "rgba(15, 41, 74, 0.08)", padding: "2px 8px", borderRadius: "999px" }}>Ativos</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>45 contratos</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block" }}>sob gestão continuada de energia</span>
              </div>
              <VerticalPillarsChart values={[30, 45, 60, 50, 70, 85]} />
            </ShellCard>

            {/* Card 5: Solicitações Abertas + Dot Plot Chart */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Solicitações Abertas</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#00A3FF", background: "rgba(0, 163, 255, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Em Curso</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>14 chamados</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block" }}>em andamento com suporte técnico</span>
              </div>
              <DotPlotChart values={[3, 6, 4, 9, 5, 2, 7]} />
            </ShellCard>

            {/* Card 6: Erros Encontrados + Soft Wavy Sparkline Red Alert */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Erros em Faturas</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#dc2626", background: "rgba(239, 68, 68, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Contestação</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>3 inconsistências</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", marginTop: "2px", display: "block" }}>cobradas indevidamente pela distribuidora</span>
              </div>
              <SoftWavySparkline color="#dc2626" />
            </ShellCard>

            {/* Card 7: Chamados Distribuidora + Speedometer Clock */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Chamados Concessionária</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#d97706", background: "rgba(245, 158, 11, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Distribuidora</span>
              </div>
              <SpeedometerClockArc label="8 abertos" subtitle="Prazo médio 48h" />
            </ShellCard>

            {/* Card 8: Créditos GD + Dual Tone Comparison Bar */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Créditos GD Acompanhamento</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Compensação</span>
              </div>
              <DualToneComparisonBar />
            </ShellCard>

            {/* Card 9: Unidades sem Fatura + Semicircular Gauge Arc */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Sem Fatura Recebida</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#dc2626", background: "rgba(239, 68, 68, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Atraso</span>
              </div>
              <SemicircularGauge value={12} title="Índice de Atraso" />
            </ShellCard>

            {/* Card 10: Auditoria Energética + Circular Donut Ring */}
            <ShellCard style={{ padding: "18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Auditoria Energética</span>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>4 estudos</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)" }}>enquadramento tarifário</span>
                <span style={{ fontSize: "10.5px", fontWeight: 500, color: "#9333ea", background: "rgba(147, 51, 234, 0.1)", padding: "2px 7px", borderRadius: "999px", width: "fit-content", marginTop: "2px" }}>Estudo Fatura</span>
              </div>
              <CircularDonutRing percentage={75} size={46} color="#9333ea" />
            </ShellCard>
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
              KPIs de eficiência, economia acumulada, ticket médio e retornos contratuais.
            </p>
          </div>

          {/* Grid dos 10 Cards de Métricas Chave com Gráficos Exclusivos */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "16px" }}>
            {/* Metric 1: Economia Média + Soft Wavy Sparkline */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Economia Média por Cliente</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Meta: R$ 10k</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>R$ 11.550/mês</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)" }}>redução média por contrato</span>
              </div>
              <SoftWavySparkline color="#059669" />
            </ShellCard>

            {/* Metric 2: Economia Total + Vertical Pillars Chart */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Economia Total Acumulada</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#0F294A", background: "rgba(15, 41, 74, 0.08)", padding: "2px 8px", borderRadius: "999px" }}>Histórico Global</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>R$ 5.480.000</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)" }}>total gerado aos clientes</span>
              </div>
              <VerticalPillarsChart values={[30, 50, 65, 75, 85, 100]} />
            </ShellCard>

            {/* Metric 3: Percentual Médio + Circular Donut Ring */}
            <ShellCard style={{ padding: "18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Percentual Médio de Redução</span>
                <div style={{ fontSize: "24px", fontWeight: 500, color: "#0F294A", marginTop: "4px" }}>18,4%</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)" }}>economia na conta de luz</span>
              </div>
              <CircularDonutRing percentage={18.4} size={50} color="#00A3FF" />
            </ShellCard>

            {/* Metric 4: Ticket Médio + Segmented Stack Bar */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Ticket Médio Plugga</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#9333ea", background: "rgba(147, 51, 234, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>MRR Sustentável</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>R$ 3.400/mês</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)" }}>receita média por contrato</span>
              </div>
              <SegmentedStackBar />
            </ShellCard>

            {/* Metric 5: Receita Recorrente + Dot Plot Chart */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Receita Recorrente Mensal</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>+8.2% este mês</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>R$ 142.800</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)" }}>MRR total no período</span>
              </div>
              <DotPlotChart values={[4, 7, 5, 10, 8, 6, 9]} />
            </ShellCard>

            {/* Metric 6: Taxa de Retenção + Semicircular Gauge */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Taxa de Retenção (LTV)</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Alta Retenção</span>
              </div>
              <SemicircularGauge value={98.6} title="Lealdade Contratual" />
            </ShellCard>

            {/* Metric 7: Tempo Médio de Entrega + Speedometer Clock Arc */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Tempo de Entrega</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#0F294A", background: "rgba(15, 41, 74, 0.08)", padding: "2px 8px", borderRadius: "999px" }}>&lt; 2.0 dias</span>
              </div>
              <SpeedometerClockArc label="1,8 dias" subtitle="Entrega de relatórios" />
            </ShellCard>

            {/* Metric 8: Faturas Auditadas + Step Funnel Progress */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Faturas Auditadas</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#00A3FF", background: "rgba(0, 163, 255, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>100% Auditadas</span>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em" }}>1.284 faturas</div>
                <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)" }}>processadas no mês</span>
              </div>
              <StepFunnelProgress currentStep={4} />
            </ShellCard>

            {/* Metric 9: Valor Recuperado + Dual Tone Comparison Bar */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Valor Recuperado</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Recuperação Ativa</span>
              </div>
              <DualToneComparisonBar />
            </ShellCard>

            {/* Metric 10: Performance por Cliente + Semicircular Gauge */}
            <ShellCard style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(15, 41, 74, 0.65)" }}>Performance Global</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "999px" }}>Excelente</span>
              </div>
              <SemicircularGauge value={94.2} title="Índice de Atingimento" />
            </ShellCard>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
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
