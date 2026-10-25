"use client";

import React, { useState } from "react";
import { ShellCard } from "../plugga-shell";

const FONT_FAMILY = 'var(--font-general-sans), "General Sans", var(--font-articulat), "Articulat CF", -apple-system, BlinkMacSystemFont, sans-serif';

interface MonthData {
  label: string;
  bruto: number;
  liquido: number;
  proj: number;
}

const MONTHLY_SERIES: MonthData[] = [
  { label: "Nov", bruto: 1.45, liquido: 1.18, proj: 1.40 },
  { label: "Dez", bruto: 1.62, liquido: 1.32, proj: 1.55 },
  { label: "Jan", bruto: 1.55, liquido: 1.25, proj: 1.50 },
  { label: "Fev", bruto: 1.70, liquido: 1.38, proj: 1.65 },
  { label: "Mar", bruto: 1.78, liquido: 1.46, proj: 1.75 },
  { label: "Abr", bruto: 1.84, liquido: 1.52, proj: 2.10 },
];

function CleanRevenueChart({ activeIndex = 5 }: { activeIndex?: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const currentIdx = hoveredIdx !== null ? hoveredIdx : activeIndex;
  const currentItem = MONTHLY_SERIES[currentIdx] ?? MONTHLY_SERIES[5]!;

  const width = 640;
  const height = 180;
  const padLeft = 40;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 28;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const minY = 0.8;
  const maxY = 2.4;
  const getY = (val: number) => padTop + chartH - ((val - minY) / (maxY - minY)) * chartH;
  const getX = (idx: number) => padLeft + (idx / (MONTHLY_SERIES.length - 1)) * chartW;

  const brutoPoints = MONTHLY_SERIES.map((d, i) => ({ x: getX(i), y: getY(d.bruto) }));
  const liquidoPoints = MONTHLY_SERIES.map((d, i) => ({ x: getX(i), y: getY(d.liquido) }));

  const createSmoothPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return "";
    let d = `M ${pts[0]!.x},${pts[0]!.y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i]!;
      const p1 = pts[i + 1]!;
      const cpX = (p0.x + p1.x) / 2;
      d += ` C ${cpX},${p0.y} ${cpX},${p1.y} ${p1.x},${p1.y}`;
    }
    return d;
  };

  const brutoPath = createSmoothPath(brutoPoints);
  const liquidoPath = createSmoothPath(liquidoPoints);
  const activeBruto = brutoPoints[currentIdx]!;
  const activeLiquido = liquidoPoints[currentIdx]!;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px", fontFamily: FONT_FAMILY }}>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", minWidth: "480px", overflow: "visible" }}>
          <defs>
            <linearGradient id="brutoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0F294A" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#0F294A" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="liquidoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00A3FF" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#00A3FF" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[1.0, 1.5, 2.0].map((val) => {
            const y = getY(val);
            return (
              <g key={val}>
                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="rgba(15, 41, 74, 0.05)" strokeDasharray="3 4" strokeWidth="1" />
                <text x={padLeft - 8} y={y + 3} textAnchor="end" fontSize="10px" fill="rgba(15, 41, 74, 0.4)" fontFamily={FONT_FAMILY}>
                  R${val.toFixed(1)}M
                </text>
              </g>
            );
          })}

          <line x1={activeBruto.x} y1={padTop} x2={activeBruto.x} y2={height - padBottom} stroke="rgba(15, 41, 74, 0.15)" strokeDasharray="2 3" strokeWidth="1.2" />
          <path d={`${brutoPath} L ${brutoPoints[brutoPoints.length - 1]!.x},${height - padBottom} L ${padLeft},${height - padBottom} Z`} fill="url(#brutoGradient)" />
          <path d={`${liquidoPath} L ${liquidoPoints[liquidoPoints.length - 1]!.x},${height - padBottom} L ${padLeft},${height - padBottom} Z`} fill="url(#liquidoGradient)" />
          <path d={brutoPath} fill="none" stroke="#0F294A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={liquidoPath} fill="none" stroke="#00A3FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={activeBruto.x} cy={activeBruto.y} r="5" fill="#0F294A" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx={activeLiquido.x} cy={activeLiquido.y} r="5" fill="#00A3FF" stroke="#FFFFFF" strokeWidth="2" />

          {MONTHLY_SERIES.map((d, i) => {
            const x = getX(i);
            const isSel = i === currentIdx;
            return (
              <g key={d.label} onClick={() => setHoveredIdx(i)} style={{ cursor: "pointer" }}>
                <rect x={x - 24} y={padTop} width="48" height={chartH + padBottom} fill="transparent" onMouseEnter={() => setHoveredIdx(i)} />
                <text x={x} y={height - 8} textAnchor="middle" fontSize="11px" fontWeight={isSel ? 500 : 400} fill={isSel ? "#0F294A" : "rgba(15, 41, 74, 0.5)"} fontFamily={FONT_FAMILY}>
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", borderTop: "1px solid rgba(15, 41, 74, 0.06)", paddingTop: "10px", fontSize: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0F294A" }} />
            <span style={{ color: "rgba(15, 41, 74, 0.6)" }}>Bruto:</span>
            <span style={{ fontWeight: 500, color: "#0F294A", fontVariantNumeric: "tabular-nums" }}>
              R$ {currentItem.bruto.toFixed(2).replace(".", ",")}M
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00A3FF" }} />
            <span style={{ color: "rgba(15, 41, 74, 0.6)" }}>Líquido:</span>
            <span style={{ fontWeight: 500, color: "#00A3FF", fontVariantNumeric: "tabular-nums" }}>
              R$ {currentItem.liquido.toFixed(2).replace(".", ",")}M
            </span>
          </div>
        </div>

        <span style={{ fontSize: "11px", color: "#059669", background: "rgba(16, 185, 129, 0.08)", padding: "2px 8px", borderRadius: "999px", fontWeight: 500 }}>
          {currentItem.label}: +14,1% vs meta
        </span>
      </div>
    </div>
  );
}

function CompactDonutRing({ percentage = 21.4, size = 50, color = "#10b981" }: { percentage?: number; size?: number; color?: string }) {
  const radius = (size - 10) / 2;
  const strokeWidth = 4;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size, display: "grid", placeItems: "center", fontFamily: FONT_FAMILY, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(15, 41, 74, 0.08)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
      </svg>
      <span style={{ position: "absolute", fontSize: "11px", fontWeight: 500, color: "#0F294A", fontVariantNumeric: "tabular-nums" }}>
        {Math.round(percentage)}%
      </span>
    </div>
  );
}

function MiniSparkline({ color = "#10b981" }: { color?: string }) {
  return (
    <div style={{ width: "100%", height: 26, position: "relative" }}>
      <svg width="100%" height="26" viewBox="0 0 100 26" fill="none" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d="M0,20 Q25,16 45,13 T75,6 T100,3 L100,26 L0,26 Z" fill="url(#sparklineGrad)" />
        <path d="M0,20 Q25,16 45,13 T75,6 T100,3" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx="100" cy="3" r="3" fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function DREProjectionCard() {
  const [timeframe, setTimeframe] = useState<"mes" | "ano">("mes");

  return (
    <ShellCard style={{ padding: "24px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px", height: "100%", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.01em", fontFamily: FONT_FAMILY }}>
              Faturamento Bruto & Líquido
            </h3>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.08)", padding: "2px 8px", borderRadius: "999px" }}>
              DRE em Tempo Real
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "24px", marginTop: "10px" }}>
            <div>
              <div style={{ fontSize: "28px", fontWeight: 500, color: "#0F294A", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {timeframe === "mes" ? "R$ 1.840.000" : "R$ 6.940.000"}
              </div>
              <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", display: "block", marginTop: "2px" }}>Faturamento Bruto</span>
            </div>

            <div style={{ borderLeft: "1px solid rgba(15, 41, 74, 0.1)", paddingLeft: "20px" }}>
              <div style={{ fontSize: "28px", fontWeight: 500, color: "#00A3FF", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {timeframe === "mes" ? "R$ 1.520.000" : "R$ 5.720.000"}
              </div>
              <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", display: "block", marginTop: "2px" }}>Faturamento Líquido</span>
            </div>

            <div style={{ borderLeft: "1px solid rgba(15, 41, 74, 0.1)", paddingLeft: "20px" }}>
              <div style={{ fontSize: "28px", fontWeight: 500, color: "#059669", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {timeframe === "mes" ? "R$ 2.100.000" : "R$ 7.500.000"}
              </div>
              <span style={{ fontSize: "11.5px", color: "rgba(15, 41, 74, 0.55)", display: "block", marginTop: "2px" }}>Projeção Fechamento</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "4px", background: "rgba(15, 41, 74, 0.05)", padding: "3px", borderRadius: "999px" }}>
          {(["mes", "ano"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTimeframe(mode)}
              style={{
                padding: "4px 12px",
                borderRadius: "999px",
                fontSize: "11.5px",
                fontWeight: timeframe === mode ? 500 : 400,
                color: timeframe === mode ? "#FFFFFF" : "#0F294A",
                background: timeframe === mode ? "#0F294A" : "transparent",
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: FONT_FAMILY,
              }}
            >
              {mode === "mes" ? "Mês Atual" : "Acumulado"}
            </button>
          ))}
        </div>
      </div>

      <CleanRevenueChart />
    </ShellCard>
  );
}

export function MargensLucroCard() {
  return (
    <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "14px", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A", fontFamily: FONT_FAMILY }}>
          Margens & Lucro
        </h4>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.08)", padding: "2px 8px", borderRadius: "999px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981" }} />
          EBITDA +4,2%
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: "12px", background: "rgba(15, 41, 74, 0.03)", border: "1px solid rgba(15, 41, 74, 0.05)" }}>
        <div>
          <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)", display: "block" }}>Margem Líquida (DRE)</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "2px" }}>
            <span style={{ fontSize: "22px", fontWeight: 500, color: "#0F294A", fontVariantNumeric: "tabular-nums" }}>21,4%</span>
            <span style={{ fontSize: "11.5px", color: "#059669", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>R$ 325.280</span>
          </div>
        </div>
        <CompactDonutRing percentage={21.4} size={50} color="#10b981" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div style={{ padding: "10px 12px", borderRadius: "10px", background: "rgba(0, 163, 255, 0.04)", border: "1px solid rgba(0, 163, 255, 0.1)" }}>
          <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)", display: "block" }}>Margem Bruta</span>
          <div style={{ fontSize: "17px", fontWeight: 500, color: "#0070E0", marginTop: "2px", fontVariantNumeric: "tabular-nums" }}>38,5%</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
            <span style={{ fontSize: "10.5px", color: "rgba(15, 41, 74, 0.5)", fontVariantNumeric: "tabular-nums" }}>R$ 585,2k</span>
            <span style={{ fontSize: "10.5px", color: "#059669", fontWeight: 500 }}>+2,1%</span>
          </div>
        </div>

        <div style={{ padding: "10px 12px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.1)" }}>
          <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)", display: "block" }}>EBITDA Operacional</span>
          <div style={{ fontSize: "17px", fontWeight: 500, color: "#059669", marginTop: "2px", fontVariantNumeric: "tabular-nums" }}>27,1%</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
            <span style={{ fontSize: "10.5px", color: "rgba(15, 41, 74, 0.5)", fontVariantNumeric: "tabular-nums" }}>R$ 412,0k</span>
            <span style={{ fontSize: "10.5px", color: "#059669", fontWeight: 500 }}>Meta 25%</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px", color: "rgba(15, 41, 74, 0.45)" }}>
          <span>Evolução 6 meses</span>
          <span style={{ color: "#059669", fontWeight: 500 }}>Tendência de alta (+3,4 p.p.)</span>
        </div>
        <MiniSparkline color="#10b981" />
      </div>
    </ShellCard>
  );
}

export function CustosTributosCard() {
  const items = [
    { label: "Encargos & Distribuição (TUSD/TE)", amount: "R$ 48.200", pct: 42.3, color: "#0077FF" },
    { label: "ICMS, PIS/COFINS e Tributos", amount: "R$ 31.400", pct: 27.5, color: "#00A3FF" },
    { label: "Custos Operacionais OPM", amount: "R$ 21.800", pct: 19.1, color: "#10b981" },
    { label: "Despesas Administrativas & TI", amount: "R$ 12.600", pct: 11.1, color: "#7C5CFF" },
  ];

  return (
    <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "14px", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A", fontFamily: FONT_FAMILY }}>
          Custos & Tributos
        </h4>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#0F294A", background: "rgba(15, 41, 74, 0.05)", padding: "2px 8px", borderRadius: "999px", fontVariantNumeric: "tabular-nums" }}>
          Total R$ 114.000
        </span>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "8px" }}>
          <div>
            <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)", display: "block" }}>Impacto sobre Receita Bruta</span>
            <div style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", fontVariantNumeric: "tabular-nums" }}>6,2%</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)", display: "block" }}>Compensações fiscais</span>
            <div style={{ fontSize: "13px", fontWeight: 500, color: "#059669", fontVariantNumeric: "tabular-nums" }}>-R$ 14.800</div>
          </div>
        </div>

        <div style={{ display: "flex", height: "7px", width: "100%", borderRadius: "999px", overflow: "hidden", background: "rgba(15, 41, 74, 0.06)", gap: "2px" }}>
          {items.map((it) => (
            <div key={it.label} style={{ width: `${it.pct}%`, background: it.color, borderRadius: "999px", transition: "width 0.3s ease" }} title={`${it.label}: ${it.amount} (${it.pct}%)`} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {items.map((it) => (
          <div key={it.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11.5px", padding: "5px 8px", borderRadius: "8px", background: "rgba(15, 41, 74, 0.025)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: it.color, flexShrink: 0 }} />
              <span style={{ color: "#0F294A", fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.5)", fontVariantNumeric: "tabular-nums" }}>{Math.round(it.pct)}%</span>
              <span style={{ color: "#0F294A", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{it.amount}</span>
            </div>
          </div>
        ))}
      </div>
    </ShellCard>
  );
}

export function CashflowAgingCard() {
  const tranches = [
    { label: "No prazo (em dia)", amount: "R$ 1.420.000", pct: 93.4, color: "#10b981" },
    { label: "1 a 30 dias", amount: "R$ 82.000", pct: 5.4, color: "#f59e0b" },
    { label: "Mais de 30 dias", amount: "R$ 18.000", pct: 1.2, color: "#dc2626" },
  ];

  return (
    <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A", fontFamily: FONT_FAMILY }}>
          Aging List &amp; Inadimplência
        </h4>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.08)", padding: "2px 8px", borderRadius: "999px" }}>
          1,2% risco (meta &lt; 2%)
        </span>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "8px" }}>
          <div>
            <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)", display: "block" }}>Carteira Total</span>
            <div style={{ fontSize: "20px", fontWeight: 500, color: "#0F294A", fontVariantNumeric: "tabular-nums" }}>R$ 1.520.000</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)", display: "block" }}>A receber (15d)</span>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#0070E0", fontVariantNumeric: "tabular-nums" }}>R$ 684.000</div>
          </div>
        </div>

        <div style={{ display: "flex", height: "7px", width: "100%", borderRadius: "999px", overflow: "hidden", background: "rgba(15, 41, 74, 0.06)", gap: "2px" }}>
          <div style={{ width: "93.4%", height: "100%", background: "#10b981", borderRadius: "999px 0 0 999px" }} title="No prazo: 93,4%" />
          <div style={{ width: "5.4%", height: "100%", background: "#f59e0b" }} title="1-30 dias: 5,4%" />
          <div style={{ width: "1.2%", height: "100%", background: "#dc2626", borderRadius: "0 999px 999px 0" }} title=">30 dias: 1,2%" />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {tranches.map((t) => (
          <div key={t.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: "8px", background: "rgba(15, 41, 74, 0.025)", fontSize: "11.5px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.color }} />
              <span style={{ color: "#0F294A", fontWeight: 400 }}>{t.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ color: "rgba(15, 41, 74, 0.5)", fontSize: "11px", fontVariantNumeric: "tabular-nums" }}>{t.pct}%</span>
              <span style={{ color: "#0F294A", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{t.amount}</span>
            </div>
          </div>
        ))}
      </div>
    </ShellCard>
  );
}
