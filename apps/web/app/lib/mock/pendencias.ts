export type Criticality = "P0" | "P1" | "P2";

export type PendingStatus = "aberta" | "em_andamento" | "aguardando_aprovacao" | "concluida" | "escalada";

export type PendingItem = {
  id: string;
  title: string;
  area: string | null;
  owner: string | null;
  dueDate: string | null;
  criticality: Criticality;
  /**
   * Texto livre do mock, ex.: "WhatsApp · CRM" ou "Manual · Dilkson".
   * Nunca deve ser tratado como um join com agent_actions.requested_by
   * (que é NULL por design) — apenas espelha event_log.payload.requestedByPrincipal.
   */
  origin: string;
  link: string;
  status: PendingStatus;
  comments: number;
};

export const CURRENT_USER = "Dilkson";
export const CURRENT_USER_AREAS = ["PluggaMob", "CRM", "Financeiro Operacional"];

export const STATUS_LABEL: Record<PendingStatus, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  aguardando_aprovacao: "Aguardando aprovação",
  concluida: "Concluída",
  escalada: "Escalada",
};

export const INITIAL_PENDING_ITEMS: PendingItem[] = [
  {
    id: "pend-1",
    title: "Aprovar fechamento EV Point · sem. 28/jul–03/ago",
    area: "Financeiro Operacional",
    owner: "Dilkson",
    dueDate: "2026-08-06",
    criticality: "P0",
    origin: "Manual · Dilkson",
    link: "Financeiro Operacional / Fechamentos",
    status: "aberta",
    comments: 2,
  },
  {
    id: "pend-2",
    title: "Enviar relatório OPM · UC 0087367",
    area: "OPM",
    owner: "Camila P.",
    dueDate: "2026-08-04",
    criticality: "P1",
    origin: "Manual · Camila P.",
    link: "OPM / Envio ao cliente",
    status: "em_andamento",
    comments: 0,
  },
  {
    id: "pend-3",
    title: "Sessão travada · EV Point Alvorada",
    area: "PluggaMob",
    owner: null,
    dueDate: "2026-08-06",
    criticality: "P0",
    origin: "Jobs e Automações · alerta ocupação",
    link: "PluggaMob / Ocupação ao vivo",
    status: "aberta",
    comments: 1,
  },
  {
    id: "pend-4",
    title: "Aprovar cotação · peças EV Point",
    area: "Compras e Suprimentos",
    owner: "Dilkson",
    dueDate: "2026-08-09",
    criticality: "P2",
    origin: "Manual · Rafael N.",
    link: "Compras e Suprimentos / Aprovações",
    status: "aguardando_aprovacao",
    comments: 0,
  },
  {
    id: "pend-5",
    title: "Envio WhatsApp aguardando aprovação · campanha R1",
    area: "CRM",
    owner: "Dilkson",
    dueDate: "2026-08-07",
    criticality: "P1",
    origin: "Integrações · WhatsApp (mock)",
    link: "CRM / Campanhas e contatos",
    status: "aguardando_aprovacao",
    comments: 0,
  },
  {
    id: "pend-6",
    title: "Repasse D+14 · locais Manaus",
    area: null,
    owner: "Leticia S.",
    dueDate: "2026-08-05",
    criticality: "P1",
    origin: "Manual · Leticia S.",
    link: "PluggaMob / D+14 e repasses",
    status: "aberta",
    comments: 3,
  },
  {
    id: "pend-7",
    title: "Fatura vencida sem aprovação",
    area: null,
    owner: null,
    dueDate: "2026-08-02",
    criticality: "P0",
    origin: "Manual · sistema OMIE",
    link: "Financeiro Operacional / Contas a pagar",
    status: "aberta",
    comments: 0,
  },
  {
    id: "pend-8",
    title: "Auditoria OPM · ciclo agosto",
    area: "OPM",
    owner: "Dilkson",
    dueDate: "2026-08-14",
    criticality: "P2",
    origin: "Manual · Dilkson",
    link: "OPM / Auditorias",
    status: "em_andamento",
    comments: 1,
  },
];
