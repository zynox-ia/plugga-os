"use client";

import { useEffect, useState } from "react";
import { useSessionUser } from "../lib/use-session-user";

/** Iniciais para o avatar; enquanto a sessão não responde, um traço neutro. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "·";
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Cartão de quem está logado, no pé da barra lateral. Ocupa o lugar do antigo
 * aviso "Fundação local", que informava um estado de projeto e não algo que
 * ajudasse quem está usando o sistema.
 */
export function SidebarUser() {
  const { usuario } = useSessionUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const exibeUsuario = mounted ? usuario : null;

  return (
    <div className="sidebar-user" suppressHydrationWarning>
      <span className="sidebar-user-avatar" aria-hidden="true" style={{ position: "relative" }} suppressHydrationWarning>
        {exibeUsuario ? iniciais(exibeUsuario.name) : "·"}
        <span className="status-dot" style={{ position: "absolute", right: -1, bottom: -1, border: "2px solid #0d101a" }} />
      </span>
      <span className="sidebar-user-info" suppressHydrationWarning>
        <strong suppressHydrationWarning>{exibeUsuario?.name ?? "Carregando…"}</strong>
        <span suppressHydrationWarning>{exibeUsuario?.email ?? ""}</span>
      </span>
    </div>
  );
}
