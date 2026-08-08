"use client";

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

  return (
    <div className="sidebar-user">
      <span className="sidebar-user-avatar" aria-hidden="true">
        {usuario ? iniciais(usuario.name) : "·"}
      </span>
      <span className="sidebar-user-info">
        <strong>{usuario?.name ?? "Carregando…"}</strong>
        <span>{usuario?.email ?? ""}</span>
      </span>
    </div>
  );
}
