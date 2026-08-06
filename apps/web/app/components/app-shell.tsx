"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { PluggaShell } from "./plugga-shell";
import { NAV_GROUPS, NAV_ID_BY_ROUTE, ROUTE_BY_NAV_ID } from "../lib/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <PluggaShell
      navigation={NAV_GROUPS}
      activeId={NAV_ID_BY_ROUTE[pathname]}
      onNavigate={(id) => {
        const route = ROUTE_BY_NAV_ID[id];
        if (route) router.push(route);
      }}
    >
      {children}
    </PluggaShell>
  );
}
