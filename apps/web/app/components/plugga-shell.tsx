"use client";

import { useEffect, useState, type ReactNode } from "react";

type ViewId = "inicio" | "ops" | "crm" | "jobs";
export type IconName =
  | "home"
  | "pulse"
  | "users"
  | "briefcase"
  | "settings"
  | "bolt"
  | "wrench"
  | "wallet";

export type ShellNavItem = {
  id: string;
  label: string;
  icon?: IconName;
  /** Desenhado, sem tela ainda: aparece apagado e não navega. */
  disabled?: boolean;
  /** Tem tela, mas ainda mock/incompleta. */
  badge?: "parcial";
};

export type ShellNavGroup = {
  id: string;
  label: string;
  items: ShellNavItem[];
  /** Departamento: vira linha clicável que abre/fecha os processos abaixo. */
  collapsible?: boolean;
  icon?: IconName;
  /** Cabeçalho da seção desenhado acima do grupo. */
  section?: string;
};

const defaultNavigation: ShellNavGroup[] = [
  {
    id: "principal",
    label: "Principal",
    items: [{ id: "inicio", label: "Início", icon: "home" }],
  },
  {
    id: "pluggamob",
    label: "PluggaMob",
    items: [
      { id: "ops", label: "Ops · Ao vivo", icon: "pulse" },
      { id: "crm", label: "CRM · Fila do dia", icon: "users" },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    items: [{ id: "jobs", label: "Jobs & Integrações", icon: "settings" }],
  },
];

const viewCopy: Record<ViewId, { title: string; description: string }> = {
  inicio: {
    title: "Bom dia, Dilkson",
    description: "Resumo operacional · Manaus · quarta, 5 ago",
  },
  ops: {
    title: "Ops · Ao vivo",
    description: "Ocupação de tomadas · EV Point · horário de Manaus",
  },
  crm: {
    title: "CRM · Fila do dia",
    description: "Reativação EV Point · réguas R0–R6 · limite de contatos/dia",
  },
  jobs: {
    title: "Jobs & Integrações",
    description: "Scheduler com log · bridges read-only no começo · ações do agente",
  },
};

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />,
    pulse: <path d="M3 12h4l2-7 4 14 2-7h6" />,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.3a2 2 0 1 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.6 12a2 2 0 1 1 0-4h.2a2 2 0 0 0 1.4-3.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 9.4.4h.2a2 2 0 1 1 4 0v.2A2 2 0 0 0 17 2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 21.2 8h.2a2 2 0 1 1 0 4h-.2a2 2 0 0 0-1.8 3Z" /></>,
    bolt: <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />,
    wrench: <path d="M14.7 6.3a4 4 0 0 1 5.3 5L21 12l-8.5 8.5a2.1 2.1 0 0 1-3-3L18 9l.7-1a4 4 0 0 1-4-1.7Z" />,
    wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M16.5 14.5h.01" /></>,
  };

  return (
    <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export function ShellCard({ children, className = "", tone }: { children: ReactNode; className?: string; tone?: "accent" | "warm" }) {
  return <article className={`shell-card${tone ? ` shell-card--${tone}` : ""} ${className}`}>{children}</article>;
}

export function StatusPill({ children, variant = "neutral" }: { children: ReactNode; variant?: "neutral" | "success" | "warning" | "danger" }) {
  return <span className={`status-pill status-pill--${variant}`}>{children}</span>;
}

export function ShellTable({ children, caption }: { children: ReactNode; caption: string }) {
  return <div className="table-wrap"><table><caption className="sr-only">{caption}</caption>{children}</table></div>;
}

function Overview() {
  return (
    <>
      <div className="stat-grid" aria-label="Indicadores operacionais">
        <ShellCard tone="accent"><span className="stat-label">Sessões ativas</span><strong className="stat-value">7</strong><span className="stat-note">EV Point agora</span></ShellCard>
        <ShellCard tone="warm"><span className="stat-label">Fila CRM</span><strong className="stat-value">18</strong><span className="stat-note">contatos hoje</span></ShellCard>
        <ShellCard><span className="stat-label">Aprovações</span><strong className="stat-value">3</strong><span className="stat-note">aguardam você</span></ShellCard>
        <ShellCard><span className="stat-label">Pendências operacionais</span><strong className="stat-value">4</strong><span className="stat-note">ciclos do mês</span></ShellCard>
      </div>

      <div className="content-grid content-grid--wide">
        <ShellCard className="table-card">
          <div className="card-heading"><div><span className="eyebrow">Atenção</span><h2>Precisa de você</h2></div><StatusPill variant="warning">3 itens</StatusPill></div>
          <ShellTable caption="Itens que precisam de atenção">
            <thead><tr><th>Item</th><th>Área</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>Resumo EV Point · sem. 28/jul–03/ago</td><td>Operação</td><td><StatusPill variant="warning">Revisar</StatusPill></td></tr>
              <tr><td>Campanha R1 · saldo esperando</td><td>CRM</td><td><StatusPill variant="neutral">Copy</StatusPill></td></tr>
              <tr><td>Relatório operacional · UC 0087367</td><td>Operação</td><td><StatusPill variant="warning">Envio</StatusPill></td></tr>
            </tbody>
          </ShellTable>
        </ShellCard>

        <ShellCard className="table-card">
          <div className="card-heading"><div><span className="eyebrow">Automação</span><h2>Rodou sozinho</h2></div><StatusPill variant="success">3 OK</StatusPill></div>
          <ShellTable caption="Últimas automações executadas">
            <thead><tr><th>Job</th><th>Resultado</th></tr></thead>
            <tbody>
              <tr><td>Recálculo segmentos R0–R6</td><td><StatusPill variant="success">OK 06:00</StatusPill></td></tr>
              <tr><td>Relatório PluggaMob manhã</td><td><StatusPill variant="success">OK 07:30</StatusPill></td></tr>
              <tr><td>Sync OMIE D+14</td><td><StatusPill variant="success">OK 08:00</StatusPill></td></tr>
            </tbody>
          </ShellTable>
          <p className="card-note">OpenClaw aparece em Ações do agente; o dado oficial mora no sistema.</p>
        </ShellCard>
      </div>
    </>
  );
}

function OpsView() {
  const locations = [
    ["EV Point 01 · Nathan", "4 conectores · 2 livres", ["busy", "busy", "free", "free"]],
    ["EV Point · Alvorada", "4 conectores · 1 livre", ["busy", "busy", "busy", "free"]],
    ["Boa Vista", "2 conectores · 1 offline", ["free", "off", "off", "off"]],
  ] as const;

  return <ShellCard className="panel-card"><div className="card-heading"><div><span className="eyebrow">Monitoramento</span><h2>Locais agora</h2></div><StatusPill variant="success">Atualizado há 12s</StatusPill></div><div className="location-grid">{locations.map(([name, note, plugs]) => <div className="location" key={name}><h3>{name}</h3><p>{note}</p><div className="plug-grid">{plugs.map((status, index) => <span className={`plug plug--${status}`} key={`${name}-${index}`}>{status === "off" ? "—" : index + 1}</span>)}</div></div>)}</div></ShellCard>;
}

function CrmView() {
  const columns = [
    ["A contatar", "6", ["Marcos A.", "Leticia S."]],
    ["Contatado", "5", ["Rafael N."]],
    ["Respondeu", "3", ["Camila P."]],
    ["Convertido", "2", ["Diego M."]],
  ] as const;

  return <ShellCard className="panel-card"><div className="card-heading"><div><span className="eyebrow">Fila do dia</span><h2>Kanban de hoje</h2></div><StatusPill variant="neutral">Campanha: R1</StatusPill></div><div className="kanban">{columns.map(([title, count, names]) => <div className="kanban-column" key={title}><div className="column-heading"><span>{title}</span><span className="count-pill">{count}</span></div>{names.map((name) => <div className="lead-card" key={name}><strong>{name}</strong><span>Saldo R$ 48,00</span><span>Cadastro há 21 dias</span><StatusPill variant="success">R1</StatusPill></div>)}</div>)}</div></ShellCard>;
}

function JobsView() {
  return <ShellCard className="table-card"><div className="card-heading"><div><span className="eyebrow">Observabilidade</span><h2>Jobs recentes</h2></div><StatusPill variant="neutral">Modo espelho</StatusPill></div><ShellTable caption="Jobs e integrações recentes"><thead><tr><th>Job</th><th>Último run</th><th>Status</th></tr></thead><tbody><tr><td>Segmentos CRM R0–R6</td><td>Hoje 06:00</td><td><StatusPill variant="success">OK</StatusPill></td></tr><tr><td>Relatório PluggaMob manhã</td><td>Hoje 07:30</td><td><StatusPill variant="success">OK</StatusPill></td></tr><tr><td>Aviso tomadas · lotação</td><td>Há 12 min</td><td><StatusPill variant="warning">Bloqueado</StatusPill></td></tr><tr><td>Bridge de dados operacional</td><td>Há 4 min</td><td><StatusPill variant="success">Sync</StatusPill></td></tr></tbody></ShellTable></ShellCard>;
}

function ViewContent({ view }: { view: ViewId }) {
  if (view === "ops") return <OpsView />;
  if (view === "crm") return <CrmView />;
  if (view === "jobs") return <JobsView />;
  return <Overview />;
}

export function PluggaShell({
  children,
  navigation,
  onNavigate,
  activeId,
  topbarActions,
  empresaSwitcher,
  pageTitle,
  pageDescription,
}: {
  children?: ReactNode;
  navigation?: ShellNavGroup[];
  onNavigate?: (id: string) => void;
  /** Optional controlled sync (e.g. from usePathname()) — keeps the header/active nav item correct on hard navigation. */
  activeId?: string;
  /** Optional extra controls rendered in the topbar, before the avatar (e.g. logout). */
  topbarActions?: ReactNode;
  /** Seletor Plugga/Waze — primeiro item da direita do topo. */
  empresaSwitcher?: ReactNode;
  /** Título e subtítulo da rota atual; caem no mock antigo quando ausentes. */
  pageTitle?: string;
  pageDescription?: string;
}) {
  const [activeView, setActiveView] = useState(activeId ?? "inicio");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeId) setActiveView(activeId);
  }, [activeId]);
  const copy = viewCopy[activeView as ViewId] ?? { title: activeView, description: "Área operacional Plugga OS" };

  const selectView = (view: string) => {
    setActiveView(view);
    setMobileNavOpen(false);
    onNavigate?.(view);
  };

  const navGroups = navigation ?? defaultNavigation;

  // Departamentos abrem por padrão: a estrutura macro→micro só comunica se
  // estiver visível. O usuário fecha o que não usa, e o departamento da rota
  // atual nunca fica fechado — senão o item ativo some da tela.
  const isOpen = (group: ShellNavGroup) =>
    !group.collapsible ||
    !closedGroups.has(group.id) ||
    group.items.some((item) => item.id === activeView);

  const toggleGroup = (id: string) =>
    setClosedGroups((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className={`sidebar${mobileNavOpen ? " sidebar--open" : ""}`} aria-label="Navegação principal" id="main-navigation">
        <div className="brand-lockup"><span className="brand-mark"><img src="/brand/logo-sem-selo.svg" alt="Plugga" /></span><span className="brand-badge">OS</span></div>
        <nav className="sidebar-nav">
          {navGroups.map((group) => {
            const aberto = isOpen(group);
            const contemAtivo = group.items.some((item) => item.id === activeView);

            const itens = group.items.map((item) => (
              <button
                className={`nav-item${activeView === item.id ? " nav-item--active" : ""}${item.disabled ? " nav-item--pending" : ""}`}
                key={item.id}
                type="button"
                onClick={() => !item.disabled && selectView(item.id)}
                disabled={item.disabled}
                aria-current={activeView === item.id ? "page" : undefined}
              >
                {group.collapsible ? null : <Icon name={item.icon ?? "settings"} />}
                <span className="nav-item-label">{item.label}</span>
                {item.disabled ? <span className="nav-tag">em breve</span> : null}
                {item.badge === "parcial" ? <span className="nav-tag nav-tag--partial">parcial</span> : null}
              </button>
            ));

            return (
              <div className="nav-group" key={group.id}>
                {group.section ? <span className="nav-section">{group.section}</span> : null}

                {group.collapsible ? (
                  <>
                    <button
                      className={`nav-parent${contemAtivo ? " nav-parent--current" : ""}`}
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={aberto}
                      aria-controls={`nav-group-${group.id}`}
                    >
                      <Icon name={group.icon ?? "briefcase"} />
                      <span className="nav-item-label">{group.label}</span>
                      <span className={`nav-chevron${aberto ? " nav-chevron--open" : ""}`} aria-hidden="true" />
                    </button>
                    {aberto ? (
                      <div className="nav-children" id={`nav-group-${group.id}`}>
                        {itens}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="nav-label">{group.label}</span>
                    {itens}
                  </>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer"><span className="footer-dot" aria-hidden="true" /><div><strong>Fundação local</strong><span>Mock-only · sem cutover</span></div></div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <button className="menu-toggle" type="button" aria-expanded={mobileNavOpen} aria-controls="main-navigation" onClick={() => setMobileNavOpen((open) => !open)}><span className="sr-only">Abrir navegação</span><span aria-hidden="true">☰</span></button>
          <div className="topbar-context"><span className="context-kicker">Plugga OS</span><span className="context-divider" aria-hidden="true">/</span><span className="context-page">{pageTitle ?? copy.title}</span></div>
          <div className="topbar-actions">{empresaSwitcher}{topbarActions}</div>
        </header>

        <main className="main-content" id="main-content">
          <div className="page-header"><div><h1>{pageTitle ?? copy.title}</h1><p>{pageDescription ?? copy.description}</p></div></div>
          {children ?? <ViewContent view={activeView as ViewId} />}
        </main>
      </div>
    </div>
  );
}
