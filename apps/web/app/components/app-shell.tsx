"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { NotificationsMenu } from "./notifications-menu";
import { PluggaShell } from "./plugga-shell";
import { SidebarUser } from "./sidebar-user";
import { UserMenu } from "./user-menu";
import { navGroupsForAccess, navIdForPathname, tituloForNavId } from "../lib/navigation";
import { SessionUserProvider, useSessionUser } from "../lib/use-session-user";

/**
 * Rotas que renderizam sozinhas, sem barra lateral, topo nem `SessionUserProvider`.
 *
 * As de auth estão aqui porque a sessão ainda não existe. As páginas legais
 * ficam fora do shell porque são abertas sem conta. `/auth/google/complete`
 * está porque some em milissegundos:
 * montar a aplicação inteira para depois trocar de página é um flash de chrome
 * que a pessoa vê e não entende.
 */
const PUBLIC_AUTH_PATHS = [
  "/login",
  "/auth/accept-invite",
  "/auth/reset",
  "/auth/google/complete",
  "/privacidade",
  "/termos",
];

function ShellContent({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const { usuario } = useSessionUser();
  const acesso = usuario?.access ?? null;
  const navId = navIdForPathname(pathname);

  return (
    <PluggaShell
      navigation={navGroupsForAccess(acesso)}
      activeId={navId}
      pageTitle={tituloForNavId(navId)}
      topbarActions={
        <>
          <NotificationsMenu />
          <UserMenu />
        </>
      }
      sidebarFooter={<SidebarUser />}
      onNavigate={(id) => {
        if (id.startsWith("/")) router.push(id);
      }}
    >
      {children}
    </PluggaShell>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (PUBLIC_AUTH_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <SessionUserProvider>
      <ShellContent>{children}</ShellContent>
    </SessionUserProvider>
  );
}
