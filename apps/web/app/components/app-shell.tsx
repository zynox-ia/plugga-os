"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { EmpresaSwitcher } from "./empresa-switcher";
import { PluggaShell } from "./plugga-shell";
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
      topbarActions={<UserMenu />}
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
