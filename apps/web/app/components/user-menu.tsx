"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type SessionUser = { name: string; email: string; roles: string[] };

/** Iniciais para o avatar; cai em "?" enquanto o usuário ainda não carregou. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Menu do avatar: identidade de quem está logado, atalhos de configuração e
 * o Sair. Substitui o botão solto de logout no topo — sair é uma ação entre
 * outras da conta, não a única, e ficava com peso visual demais.
 */
export function UserMenu() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [usuario, setUsuario] = useState<SessionUser | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ativo = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((dados) => {
        if (ativo && dados) setUsuario(dados as SessionUser);
      })
      .catch(() => {
        // Sem identidade o menu ainda funciona; só não mostra o cabeçalho.
      });
    return () => {
      ativo = false;
    };
  }, []);

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

  return (
    <div className="user-menu" ref={container}>
      <button
        className="avatar"
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={usuario ? `Abrir menu de ${usuario.name}` : "Abrir menu da conta"}
      >
        {usuario ? iniciais(usuario.name) : "·"}
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

          <button className="user-menu-item" type="button" role="menuitem" disabled>
            Meu perfil
            <span className="nav-tag">em breve</span>
          </button>
          <button className="user-menu-item" type="button" role="menuitem" disabled>
            Preferências
            <span className="nav-tag">em breve</span>
          </button>
          <button className="user-menu-item" type="button" role="menuitem" disabled>
            Notificações
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
