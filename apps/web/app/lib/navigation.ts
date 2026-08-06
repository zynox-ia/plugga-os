import type { ShellNavGroup } from "../components/plugga-shell";

/**
 * PRD §7 — 12 áreas do menu principal. "Engenharia e Obras" é V2 (em breve).
 * "Jobs e Automações" e "Integrações" consomem GET /jobs e GET /integrations
 * (P2-6) com fallback para mock local quando a API não responde.
 */
export const NAV_GROUPS: ShellNavGroup[] = [
  {
    label: "Visão geral",
    items: [
      { id: "Dashboard", label: "Dashboard", icon: "home" },
      { id: "Central de Pendências", label: "Central de Pendências", icon: "pulse" },
    ],
  },
  {
    label: "Comercial & Operação",
    items: [
      { id: "CRM", label: "CRM", icon: "users" },
      { id: "OPM", label: "OPM", icon: "briefcase" },
      { id: "PluggaMob", label: "PluggaMob", icon: "pulse" },
    ],
  },
  {
    label: "Financeiro & Suprimentos",
    items: [
      { id: "Financeiro Operacional", label: "Financeiro Operacional", icon: "briefcase" },
      { id: "Compras e Suprimentos", label: "Compras e Suprimentos", icon: "briefcase" },
    ],
  },
  {
    label: "Obras & Documentos",
    items: [
      { id: "Engenharia e Obras", label: "Engenharia e Obras · em breve", icon: "settings" },
      { id: "Documentos", label: "Documentos", icon: "briefcase" },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { id: "Jobs e Automações", label: "Jobs e Automações", icon: "settings" },
      { id: "Integrações", label: "Integrações", icon: "settings" },
      { id: "Agentes IA", label: "Agentes IA", icon: "users" },
      { id: "Administração", label: "Administração", icon: "settings" },
    ],
  },
];

export const ROUTE_BY_NAV_ID: Record<string, string> = {
  "Dashboard": "/",
  "Central de Pendências": "/pendencias",
  "CRM": "/crm",
  "OPM": "/opm",
  "PluggaMob": "/pluggamob",
  "Financeiro Operacional": "/financeiro",
  "Compras e Suprimentos": "/compras",
  "Engenharia e Obras": "/engenharia",
  "Documentos": "/documentos",
  "Jobs e Automações": "/jobs",
  "Integrações": "/integracoes",
  "Agentes IA": "/agentes-ia",
  "Administração": "/administracao",
};
