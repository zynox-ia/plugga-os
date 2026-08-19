"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useSessionUser } from "../lib/use-session-user";

/**
 * Menu da conta, aberto pela engrenagem da barra superior. Reúne perfil,
 * preferências, configurações do sistema e o Sair — sair é uma ação entre
 * outras da conta, não a única, e como botão solto tinha peso demais.
 */
export function UserMenu() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const { usuario } = useSessionUser();
  const container = useRef<HTMLDivElement>(null);

  // Clique fora e Escape fecham: um menu que só fecha pelo próprio botão
  // prende o usuário quando ele já mudou de ideia.
  useEffect(() => {
    if (!aberto) return;

    const aoClicarFora = (evento: MouseEvent) => {
      if (!container.current?.contains(evento.target as Node)) fecharMenu();
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") fecharMenu();
    };

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Best-effort: a sessão pode já ter sido revogada no servidor.
    } finally {
      router.push("/login");
    }
  }

  function fecharMenu() {
    setAberto(false);
    setConfirmandoSaida(false);
  }

  function alternarMenu() {
    if (aberto) fecharMenu();
    else setAberto(true);
  }

  function irPara(rota: string) {
    fecharMenu();
    router.push(rota);
  }

  return (
    <div className="user-menu" ref={container}>
      <button
        className="topbar-icon"
        type="button"
        onClick={alternarMenu}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Abrir menu da conta"
        title="Conta e configurações"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z" />
        </svg>
      </button>

      {aberto ? (
        <div className="user-menu-panel" role="menu">
          {usuario ? (
            <div className="user-menu-header">
              <div className="user-menu-person">
                <strong>{usuario.name}</strong>
                {usuario.roles.length > 0 ? <span className="user-menu-role-tag">{usuario.roles[0]}</span> : null}
              </div>
              <span>{usuario.email}</span>
            </div>
          ) : null}

          <button
            className="user-menu-item"
            type="button"
            role="menuitem"
            onClick={() => irPara("/configuracoes")}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z" />
            </svg>
            Configurações do sistema
          </button>
          <button className="user-menu-item" type="button" role="menuitem" onClick={() => irPara("/configuracoes")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            Meu perfil
          </button>
          <button className="user-menu-item" type="button" role="menuitem" onClick={() => irPara("/configuracoes")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h10" />
              <path d="M18 6h2" />
              <path d="M14 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
              <path d="M4 18h4" />
              <path d="M12 18h8" />
              <path d="M10 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
            </svg>
            Preferências
          </button>

          <div className="user-menu-divider" role="separator" />

          <button
            className="user-menu-item user-menu-item--danger"
            type="button"
            role="menuitem"
            onClick={sair}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
            </svg>
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
