"use client";

import { useEffect, useRef, useState } from "react";

const NOTIFICATIONS = [
  { title: "Aprovação pendente", detail: "2 fechamentos aguardam revisão", time: "agora", unread: true },
  { title: "Integração concluída", detail: "Sincronização Bitrix finalizada", time: "18 min", unread: true },
  { title: "Job executado", detail: "Reativação de clientes atualizada", time: "1 h", unread: false },
];

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="notifications-menu" ref={container}>
      <button
        className="topbar-icon"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Abrir notificações"
        title="Notificações"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        <span className="topbar-notification-dot" aria-hidden="true" />
      </button>

      {open ? (
        <div className="notifications-menu-panel" role="menu" aria-label="Notificações">
          <div className="notifications-menu-header">
            <div>
              <strong>Notificações</strong>
              <span>2 novas atualizações</span>
            </div>
            <span className="notifications-menu-count">2</span>
          </div>

          <div className="notifications-menu-list">
            {NOTIFICATIONS.map((notification) => (
              <button className="notifications-menu-item" type="button" role="menuitem" key={notification.title}>
                <span className={`notifications-menu-dot${notification.unread ? " notifications-menu-dot--unread" : ""}`} aria-hidden="true" />
                <span>
                  <strong>{notification.title}</strong>
                  <small>{notification.detail}</small>
                </span>
                <time>{notification.time}</time>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
