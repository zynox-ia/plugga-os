"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "./logout-button";
import { PluggaShell } from "./plugga-shell";
import { NAV_GROUPS, NAV_ID_BY_ROUTE, ROUTE_BY_NAV_ID } from "../lib/navigation";

/** Public auth pages render standalone — no sidebar/topbar (session isn't required yet). */
const PUBLIC_AUTH_PATHS = ["/login", "/auth/accept-invite", "/auth/reset"];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  if (PUBLIC_AUTH_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <PluggaShell
      navigation={NAV_GROUPS}
      activeId={NAV_ID_BY_ROUTE[pathname]}
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
