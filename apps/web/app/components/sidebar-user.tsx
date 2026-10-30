"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { useSessionUser } from "../lib/use-session-user";

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
      <span className="sidebar-user-avatar" aria-hidden="true" suppressHydrationWarning>
        <User size={16} strokeWidth={2} />
      </span>
      <span className="sidebar-user-info" suppressHydrationWarning>
        <strong suppressHydrationWarning>{exibeUsuario?.name ?? "Carregando…"}</strong>
        <span suppressHydrationWarning>{exibeUsuario?.email ?? ""}</span>
      </span>
    </div>
  );
}
