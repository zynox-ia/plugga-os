"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { PluggaShell } from "./plugga-shell";
import { NAV_GROUPS, ROUTE_BY_NAV_ID } from "../lib/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <PluggaShell
      navigation={NAV_GROUPS}
      onNavigate={(id) => {
        const route = ROUTE_BY_NAV_ID[id];
        if (route) router.push(route);
      }}
    >
      {children}
    </PluggaShell>
  );
}
