"use client";

import { ShellCard } from "../plugga-shell";

const FONT_FAMILY = 'var(--font-general-sans), "General Sans", var(--font-articulat), "Articulat CF", -apple-system, BlinkMacSystemFont, sans-serif';

// Barras de Cumprimento de SLA por Departamento
function DepartmentSLABars() {
  const depts = [
    { name: "Comercial", sla: 94, tasks: "47/50 no prazo", color: "#10b981" },
    { name: "Engenharia & Obras", sla: 89, tasks: "71/80 no prazo", color: "#f59e0b" },
    { name: "Operações OPM & Faturamento", sla: 97, tasks: "116/120 no prazo", color: "#10b981" },
    { name: "Suprimentos & Compras", sla: 85, tasks: "34/40 no prazo", color: "#f59e0b" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "9px", width: "100%", fontFamily: FONT_FAMILY }}>
      {depts.map((d) => (
        <div key={d.name} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11.5px" }}>
            <span style={{ fontWeight: 500, color: "#0F294A" }}>{d.name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10.5px", color: "rgba(15, 41, 74, 0.55)" }}>{d.tasks}</span>
              <span style={{ color: d.color, fontSize: "12px", fontWeight: 500 }}>{d.sla}%</span>
            </span>
          </div>
          <div style={{ position: "relative", height: "6px", borderRadius: "999px", background: "rgba(15, 41, 74, 0.08)", overflow: "hidden" }}>
            <div style={{ width: `${d.sla}%`, height: "100%", background: d.color, borderRadius: "999px" }} />
          </div>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "5px", borderTop: "1px solid rgba(15, 41, 74, 0.06)", fontSize: "10.5px", color: "rgba(15, 41, 74, 0.55)" }}>
        <span>Meta institucional: 90%</span>
        <span style={{ color: "#059669", fontWeight: 500 }}>Média geral: 91,4%</span>
      </div>
    </div>
  );
}

// Lista de Etapas-Gargalo & Prorrogações
function BottleneckStagesList() {
  const bottlenecks = [
    { stage: "Parecer de Acesso Cemig/Distribuidora", days: "16 dias", color: "#dc2626", count: 8 },
    { stage: "Validação Técnica de Kit & Inversor", days: "8 dias", color: "#ea580c", count: 5 },
    { stage: "Minuta de Contrato & Assinatura", days: "5 dias", color: "#f59e0b", count: 4 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "7px", width: "100%", fontFamily: FONT_FAMILY }}>
      {bottlenecks.map((b) => (
        <div key={b.stage} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: "10px", background: "rgba(15, 41, 74, 0.03)", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: b.color, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "#0F294A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {b.stage}
              </div>
              <span style={{ fontSize: "10.5px", color: "rgba(15, 41, 74, 0.55)" }}>
                {b.count} cards retidos
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 500, color: b.color }}>{b.days}</span>
            <div style={{ fontSize: "9.5px", color: "rgba(15, 41, 74, 0.5)" }}>tempo médio</div>
          </div>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.08)", border: "1px dashed rgba(245, 158, 11, 0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 500, color: "#0F294A" }}>Solicitações de Prorrogação</span>
        </div>
        <span style={{ fontSize: "10.5px", fontWeight: 500, color: "#d97706", background: "rgba(245, 158, 11, 0.15)", padding: "2px 7px", borderRadius: "999px" }}>
          3 pendentes
        </span>
      </div>
    </div>
  );
}

// Mini Leaderboard de Produtividade Individual
function TeamProductivityMiniLeaderboard() {
  const members = [
    { name: "Lucas Silveira", role: "Engenharia Solar", efficiency: 98, onTime: "24/24", badge: "Destaque", badgeColor: "#059669" },
    { name: "Mariana Costa", role: "Auditoria OPM", efficiency: 95, onTime: "38/40", badge: "Alta Entrega", badgeColor: "#0070E0" },
    { name: "Rafael Duarte", role: "Comercial GD/ACL", efficiency: 92, onTime: "18/20", badge: "No Prazo", badgeColor: "#059669" },
    { name: "Thiago Mendes", role: "Projetos BESS", efficiency: 79, onTime: "11/15", badge: "4 Atrasos", badgeColor: "#d97706" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", fontFamily: FONT_FAMILY }}>
      {members.map((m) => (
        <div key={m.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: "8px", background: "rgba(15, 41, 74, 0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(15, 41, 74, 0.08)", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 500, color: "#0F294A" }}>
              {m.name.split(" ").map((n) => n[0]).join("")}
            </div>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "#0F294A" }}>{m.name}</div>
              <div style={{ fontSize: "10px", color: "rgba(15, 41, 74, 0.5)" }}>{m.role} • {m.onTime}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "10.5px", fontWeight: 500, color: m.badgeColor, background: `${m.badgeColor}15`, padding: "2px 6px", borderRadius: "4px" }}>
              {m.efficiency}% • {m.badge}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// CARD 9: SLA & EFICIÊNCIA DO SETOR
// ==========================================
export function SLAEficienciaSetorCard() {
  return (
    <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A", fontFamily: FONT_FAMILY }}>
          SLA por Setor
        </h4>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 7px", borderRadius: "999px" }}>
          Meta: 90%
        </span>
      </div>
      <DepartmentSLABars />
    </ShellCard>
  );
}

// ==========================================
// CARD 10: GARGALOS OPERACIONAIS & EXCEÇÕES
// ==========================================
export function GargalosOperacionaisCard() {
  return (
    <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A", fontFamily: FONT_FAMILY }}>
          Gargalos Operacionais &amp; Retenção
        </h4>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#dc2626", background: "rgba(220, 38, 38, 0.1)", padding: "2px 7px", borderRadius: "999px" }}>
          3 pontos de atenção
        </span>
      </div>
      <BottleneckStagesList />
    </ShellCard>
  );
}

// ==========================================
// CARD 11: DESEMPENHO POR COLABORADOR
// ==========================================
export function DesempenhoColaboradorCard() {
  return (
    <ShellCard style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", boxSizing: "border-box", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#0F294A", fontFamily: FONT_FAMILY }}>
          Desempenho da Equipe
        </h4>
        <span style={{ fontSize: "11px", color: "rgba(15, 41, 74, 0.55)" }}>Destaques e entregas</span>
      </div>
      <TeamProductivityMiniLeaderboard />
    </ShellCard>
  );
}
