"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { EmpresaSwitcher } from "./empresa-switcher";
import { PluggaShell } from "./plugga-shell";
import { SidebarUser } from "./sidebar-user";
import { UserMenu } from "./user-menu";
import { navGroupsForEmpresa, navIdForPathname, tituloForNavId } from "../lib/navigation";
import {
  EMPRESAS_POR_ID,
  EMPRESA_PADRAO,
  isEmpresaId,
  type EmpresaId,
} from "../lib/organizacao";

/** Public auth pages render standalone — no sidebar/topbar (session isn't required yet). */
const PUBLIC_AUTH_PATHS = ["/login", "/auth/accept-invite", "/auth/reset"];

function ShellWithEmpresa({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parametro = searchParams.get("empresa");
  const empresa: EmpresaId = isEmpresaId(parametro) ? parametro : EMPRESA_PADRAO;
  const navId = navIdForPathname(pathname);

  // A empresa acompanha toda navegação: sair dela por esquecimento de query
  // string devolveria a pessoa para a Plugga no meio de um fluxo da Waze.
  const comEmpresa = (rota: string) =>
    empresa === EMPRESA_PADRAO ? rota : `${rota}?empresa=${empresa}`;

  return (
    <PluggaShell
      navigation={navGroupsForEmpresa(empresa)}
      activeId={navId}
      pageTitle={tituloForNavId(navId, empresa)}
      pageDescription={EMPRESAS_POR_ID[empresa].descricao}
      empresaSwitcher={
        <EmpresaSwitcher
          empresa={empresa}
          onSelect={(proxima) =>
            router.push(proxima === EMPRESA_PADRAO ? pathname : `${pathname}?empresa=${proxima}`)
          }
        />
      }
      topbarActions={
        <>
          <button
            className="topbar-icon"
            type="button"
            onClick={() => router.push("/configuracoes")}
            aria-label="Configurar notificações"
            title="Configurar notificações"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          </button>
          <UserMenu />
        </>
      }
      sidebarFooter={<SidebarUser />}
      onNavigate={(id) => {
        if (id.startsWith("/")) router.push(comEmpresa(id));
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

  // useSearchParams exige limite de Suspense para não forçar toda rota a
  // renderização dinâmica.
  return (
    <Suspense fallback={<div className="app-shell" />}>
      <ShellWithEmpresa>{children}</ShellWithEmpresa>
    </Suspense>
  );
}
