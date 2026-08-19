"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { BackgroundParticles } from "./background-particles";

export type IconName =
  | "home"
  | "pulse"
  | "users"
  | "briefcase"
  | "settings"
  | "bolt"
  | "wrench"
  | "wallet"
  | "document"
  | "chart";

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
    document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
    chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  };

  return (
    <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export function ShellCard({ children, className = "", tone, style }: { children: ReactNode; className?: string; tone?: "accent" | "warm"; style?: import("react").CSSProperties }) {
  return <article className={`shell-card${tone ? ` shell-card--${tone}` : ""} ${className}`} style={style}>{children}</article>;
}

export function StatusPill({ children, variant = "neutral" }: { children: ReactNode; variant?: "neutral" | "success" | "warning" | "danger" }) {
  return <span className={`status-pill status-pill--${variant}`}>{children}</span>;
}

export function ShellTable({ children, caption }: { children: ReactNode; caption: string }) {
  return <div className="table-wrap"><table><caption className="sr-only">{caption}</caption>{children}</table></div>;
}

export function PluggaShell({
  children,
  navigation,
  onNavigate,
  activeId,
  topbarActions,
  empresaSwitcher,
  sidebarFooter,
  pageTitle,
}: {
  children: ReactNode;
  navigation: ShellNavGroup[];
  onNavigate?: (id: string) => void;
  /** Controlled sync (e.g. from usePathname()) — keeps the header/active nav item correct on hard navigation. */
  activeId: string;
  /** Optional extra controls rendered in the topbar, before the avatar (e.g. logout). */
  topbarActions?: ReactNode;
  /** Seletor Plugga/Waze — primeiro item da direita do topo. */
  empresaSwitcher?: ReactNode;
  /** Fixo no pé da barra lateral (Configurações). */
  sidebarFooter?: ReactNode;
  /** Título da rota atual. */
  pageTitle: string;
}) {
  const [activeView, setActiveView] = useState(activeId);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Apenas um departamento fica aberto por vez (comportamento sanfona / accordion único).
  const [openedGroupId, setOpenedGroupId] = useState<string | null>(null);

  useEffect(() => {
    setActiveView(activeId);
  }, [activeId]);

  const selectView = (view: string) => {
    setActiveView(view);
    setMobileNavOpen(false);
    onNavigate?.(view);
  };

  const isCollapsed = mounted && sidebarCollapsed;
  const navGroups = navigation;

  // Se o usuário interagiu abrindo um departamento, exibe somente ele.
  // Caso contrário, abre automaticamente o departamento que contém a rota ativa.
  const isOpen = (group: ShellNavGroup) => {
    if (!group.collapsible) return true;
    if (openedGroupId !== null) {
      return openedGroupId === group.id;
    }
    return group.items.some((item) => item.id === activeView);
  };

  const toggleGroup = (id: string) => {
    setOpenedGroupId((atual) => {
      const grupoClicado = navGroups.find((g) => g.id === id);
      const estaAberto =
        atual === id || (atual === null && grupoClicado?.items.some((item) => item.id === activeView));

      return estaAberto ? "" : id;
    });
  };

  const mainNavGroups = navGroups.filter((g) => g.id !== "ferramentas");
  const toolsNavGroups = navGroups.filter((g) => g.id === "ferramentas");

  const renderNavGroup = (group: ShellNavGroup) => {
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
        <Icon name={item.icon ?? (group.collapsible ? "pulse" : "settings")} />
        <span className="nav-item-label">{item.label}</span>
        {item.disabled ? <span className="nav-tag">em breve</span> : null}
        {item.badge === "parcial" ? <span className="nav-tag nav-tag--partial">parcial</span> : null}
      </button>
    ));

    return (
      <div className={`nav-group${group.id === "ferramentas" ? " nav-group--ferramentas" : ""}`} key={group.id}>
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
              <span className="nav-item-label" title={group.label}>{group.label}</span>
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
  };

  return (
    <div className={`app-shell${isCollapsed ? " app-shell--collapsed" : ""}`} suppressHydrationWarning>
      <div className="app-poster" aria-hidden="true" />
      <BackgroundParticles />
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className={`sidebar${mobileNavOpen ? " sidebar--open" : ""}${isCollapsed ? " sidebar--collapsed" : ""}`} aria-label="Navegação principal" id="main-navigation" suppressHydrationWarning>
        <div className="brand-lockup">
          <span
            className="brand-mark"
            onClick={() => isCollapsed && setSidebarCollapsed(false)}
            style={{ cursor: isCollapsed ? "pointer" : "default" }}
            title={isCollapsed ? "Clique para expandir a barra lateral" : undefined}
          >
            <img src={isCollapsed ? "/brand/icone-areia.svg" : "/brand/logo-areia.svg"} alt="Plugga" />
          </span>
          <button
            className="brand-badge brand-badge--interactive"
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            title={isCollapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
          >
            <span className="brand-badge-text">OS</span>
            <span className="brand-badge-arrow" aria-hidden="true">
              {isCollapsed ? "›" : "‹"}
            </span>
          </button>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-nav-shape sidebar-nav-shape--main">
            {mainNavGroups.map(renderNavGroup)}
          </div>
          {toolsNavGroups.length > 0 ? (
            <div className="sidebar-nav-shape sidebar-nav-shape--tools">
              {toolsNavGroups.map(renderNavGroup)}
            </div>
          ) : null}
        </nav>

        {sidebarFooter}
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <button className="menu-toggle" type="button" aria-expanded={mobileNavOpen} aria-controls="main-navigation" onClick={() => setMobileNavOpen((open) => !open)}><span className="sr-only">Abrir navegação</span><span aria-hidden="true">☰</span></button>

          <div className="topbar-context">
            <svg className="context-home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
            </svg>
            <span className="context-kicker">Plugga</span>
            <span className="context-divider" aria-hidden="true">/</span>
            <span className="context-page">{pageTitle}</span>
          </div>

          <div className="topbar-search">
            <svg className="topbar-search-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Buscar no sistema..." aria-label="Buscar no sistema" />
            <kbd className="topbar-search-kbd">⌘K</kbd>
          </div>

          <div className="topbar-actions">
            {empresaSwitcher}
            {topbarActions}
          </div>
        </header>

        <main className="main-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
