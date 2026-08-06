export type DashboardKpi = {
  id: string;
  label: string;
  value: string;
  note: string;
  tone?: "accent" | "warm";
};

export const DASHBOARD_KPIS: DashboardKpi[] = [
  { id: "criticas", label: "Tarefas críticas", value: "5", note: "P0/P1 abertas", tone: "warm" },
  { id: "opm", label: "OPM atrasado", value: "3", note: "ciclos do mês" },
  { id: "fechamentos", label: "Fechamentos pendentes", value: "2", note: "PluggaMob · semana" },
  { id: "alertas", label: "Alertas PluggaMob", value: "4", note: "sessões e ocupação" },
  { id: "jobs", label: "Jobs com falha", value: "1", note: "últimas 24h", tone: "warm" },
  { id: "aprovacoes", label: "Aprovações", value: "6", note: "aguardando você", tone: "accent" },
];

export type AttentionItem = {
  id: string;
  title: string;
  area: string;
  status: string;
  variant: "neutral" | "success" | "warning" | "danger";
};

export type DashboardTabId = "hoje" | "semana" | "p0p1" | "integracoes" | "pendencias-por-area";

export type DashboardTab = {
  id: DashboardTabId;
  label: string;
  attention: AttentionItem[];
};

export const DASHBOARD_TABS: DashboardTab[] = [
  {
    id: "hoje",
    label: "Hoje",
    attention: [
      { id: "hoje-1", title: "Fechamento EV Point · sem. 28/jul–03/ago", area: "Financeiro", status: "Aprovar", variant: "warning" },
      { id: "hoje-2", title: "Relatório OPM · UC 0087367", area: "OPM", status: "Envio", variant: "warning" },
      { id: "hoje-3", title: "Cotação fornecedor · peças EV Point", area: "Compras", status: "Aprovar", variant: "warning" },
    ],
  },
  {
    id: "semana",
    label: "Semana",
    attention: [
      { id: "semana-1", title: "Auditoria OPM · ciclo agosto", area: "OPM", status: "Em andamento", variant: "neutral" },
      { id: "semana-2", title: "Campanha reativação R1", area: "CRM", status: "Copy pendente", variant: "neutral" },
      { id: "semana-3", title: "Repasse D+14 · locais Manaus", area: "PluggaMob", status: "Conferir", variant: "warning" },
    ],
  },
  {
    id: "p0p1",
    label: "P0/P1",
    attention: [
      { id: "p0p1-1", title: "Sessão travada · EV Point Alvorada", area: "PluggaMob", status: "P0", variant: "danger" },
      { id: "p0p1-2", title: "Fatura vencida sem aprovação", area: "Financeiro", status: "P0", variant: "danger" },
      { id: "p0p1-3", title: "Alerta ocupação · Boa Vista", area: "PluggaMob", status: "P1", variant: "warning" },
    ],
  },
  {
    id: "integracoes",
    label: "Integrações",
    attention: [
      { id: "int-1", title: "Envio WhatsApp bloqueado · opt-out", area: "CRM", status: "Bloqueado", variant: "danger" },
      { id: "int-2", title: "Envio WhatsApp aguardando aprovação", area: "CRM", status: "Pendente", variant: "warning" },
      { id: "int-3", title: "Sync OMIE D+14", area: "Financeiro", status: "OK", variant: "success" },
    ],
  },
  {
    id: "pendencias-por-area",
    label: "Pendências por área",
    attention: [
      { id: "area-1", title: "PluggaMob", area: "4 pendências", status: "2 críticas", variant: "danger" },
      { id: "area-2", title: "Financeiro Operacional", area: "3 pendências", status: "1 crítica", variant: "warning" },
      { id: "area-3", title: "CRM", area: "2 pendências", status: "0 críticas", variant: "neutral" },
      { id: "area-4", title: "OPM", area: "2 pendências", status: "1 crítica", variant: "warning" },
    ],
  },
];

export type AutomationRun = {
  id: string;
  job: string;
  result: string;
};

export const AUTOMATION_RUNS: AutomationRun[] = [
  { id: "auto-1", job: "Recálculo segmentos R0–R6", result: "OK 06:00" },
  { id: "auto-2", job: "Relatório PluggaMob manhã", result: "OK 07:30" },
  { id: "auto-3", job: "Sync OMIE D+14", result: "OK 08:00" },
];
