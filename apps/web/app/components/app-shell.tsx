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
  empresasPermitidas,
  isEmpresaId,
  type EmpresaId,
} from "../lib/organizacao";
import { SessionUserProvider, useSessionUser } from "../lib/use-session-user";

/**
 * Rotas que renderizam sozinhas, sem barra lateral, topo nem `SessionUserProvider`.
 *
 * As de auth estão aqui porque a sessão ainda não existe. `/privacidade` está
 * porque quem a abre pode ser o revisor do Google, sem conta nenhuma — e dentro
 * do shell ela ganharia um segundo `<h1>` e uma chamada a `/auth/me` que
 * ninguém pediu. `/auth/google/complete` está porque some em milissegundos:
 * montar a aplicação inteira para depois trocar de página é um flash de chrome
 * que a pessoa vê e não entende.
 */
const PUBLIC_AUTH_PATHS = [
  "/login",
  "/auth/accept-invite",
  "/auth/reset",
  "/auth/google/complete",
  "/privacidade",
];

function ShellWithEmpresa({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { usuario } = useSessionUser();
  const acesso = usuario?.access ?? null;
  const empresas = empresasPermitidas(acesso);

  const parametro = searchParams.get("empresa");
  const pedida: EmpresaId = isEmpresaId(parametro) ? parametro : EMPRESA_PADRAO;
  // Um link para `?empresa=waze` nas mãos de quem só tem Plugga não pode abrir
  // uma Waze vazia: cai na primeira empresa que a pessoa realmente alcança.
  const empresa: EmpresaId = empresas.includes(pedida) ? pedida : (empresas[0] ?? pedida);
  const navId = navIdForPathname(pathname);

  // A empresa acompanha toda navegação: sair dela por esquecimento de query
  // string devolveria a pessoa para a Plugga no meio de um fluxo da Waze.
  const comEmpresa = (rota: string) =>
    empresa === EMPRESA_PADRAO ? rota : `${rota}?empresa=${empresa}`;

  return (
    <PluggaShell
      navigation={navGroupsForEmpresa(empresa, acesso)}
      activeId={navId}
      pageTitle={tituloForNavId(navId, empresa)}
      pageDescription={EMPRESAS_POR_ID[empresa].descricao}
      empresaSwitcher={
        <EmpresaSwitcher
          empresa={empresa}
          empresas={empresas}
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
  // renderização dinâmica. O provider fica por fora: shell, barra lateral, menu
  // da conta e as telas leem a mesma resposta de /me, não uma cada.
  return (
    <SessionUserProvider>
      <Suspense fallback={<div className="app-shell" />}>
        <ShellWithEmpresa>{children}</ShellWithEmpresa>
      </Suspense>
    </SessionUserProvider>
  );
}
