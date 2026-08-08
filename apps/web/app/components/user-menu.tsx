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
  const { usuario } = useSessionUser();
  const container = useRef<HTMLDivElement>(null);

  // Clique fora e Escape fecham: um menu que só fecha pelo próprio botão
  // prende o usuário quando ele já mudou de ideia.
  useEffect(() => {
    if (!aberto) return;

    const aoClicarFora = (evento: MouseEvent) => {
      if (!container.current?.contains(evento.target as Node)) setAberto(false);
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
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

  function irPara(rota: string) {
    setAberto(false);
    router.push(rota);
  }

  return (
    <div className="user-menu" ref={container}>
      <button
        className="topbar-icon"
        type="button"
        onClick={() => setAberto((atual) => !atual)}
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
              <strong>{usuario.name}</strong>
              <span>{usuario.email}</span>
              {usuario.roles.length > 0 ? (
                <span className="user-menu-roles">{usuario.roles.join(" · ")}</span>
              ) : null}
            </div>
          ) : null}

          <button
            className="user-menu-item"
            type="button"
            role="menuitem"
            onClick={() => irPara("/configuracoes")}
          >
            Configurações do sistema
          </button>
          <button className="user-menu-item" type="button" role="menuitem" disabled>
            Meu perfil
            <span className="nav-tag">em breve</span>
          </button>
          <button className="user-menu-item" type="button" role="menuitem" disabled>
            Preferências
            <span className="nav-tag">em breve</span>
          </button>

          <div className="user-menu-divider" role="separator" />

          <button
            className="user-menu-item user-menu-item--danger"
            type="button"
            role="menuitem"
            onClick={sair}
            disabled={saindo}
          >
            {saindo ? "Saindo…" : "Sair"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
