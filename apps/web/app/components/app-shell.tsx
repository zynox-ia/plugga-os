"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "./logout-button";
import { PluggaShell } from "./plugga-shell";
import { NAV_GROUPS, NAV_ID_BY_ROUTE, ROUTE_BY_NAV_ID } from "../lib/navigation";

/** Public auth pages render standalone — no sidebar/topbar (session isn't required yet). */
const PUBLIC_AUTH_PATHS = ["/login", "/auth/accept-invite", "/auth/reset"];

/**
 * NAV_ID_BY_ROUTE only maps exact routes, but a detail screen (e.g.
 * /comercial/oportunidades/:id) has no entry of its own — it should still
 * highlight the nav item for its list screen. Longest-prefix match keeps
 * that working without hand-listing every dynamic route.
 */
function navIdForPathname(pathname: string): string | undefined {
  if (NAV_ID_BY_ROUTE[pathname]) return NAV_ID_BY_ROUTE[pathname];

  const prefixMatch = Object.entries(ROUTE_BY_NAV_ID)
    .filter(([, route]) => route !== "/" && pathname.startsWith(`${route}/`))
    .sort((a, b) => b[1].length - a[1].length)[0];

  return prefixMatch?.[0];
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  if (PUBLIC_AUTH_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <PluggaShell
      navigation={NAV_GROUPS}
      activeId={navIdForPathname(pathname)}
      topbarActions={<LogoutButton />}
      onNavigate={(id) => {
        const route = ROUTE_BY_NAV_ID[id];
        if (route) router.push(route);
      }}
    >
      {children}
    </PluggaShell>
  );
}
