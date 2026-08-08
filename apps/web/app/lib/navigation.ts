import type { ShellNavGroup } from "../components/plugga-shell";
import {
  EMPRESAS_POR_ID,
  GLOBAIS,
  VISAO_GERAL,
  type EmpresaId,
  type Processo,
} from "./organizacao";

/**
 * Deriva a navegação de `organizacao.ts`: a sidebar é a árvore Empresa →
 * Departamento → Processo, com o que ainda não existe marcado em vez de
 * escondido — assim a estrutura combinada fica visível enquanto é construída.
 *
 * O id do item é a própria rota quando ela existe; para o que não tem tela, um
 * id sintético mantém a chave única sem inventar uma rota que daria 404.
 */

function navItem(processo: Processo, prefixo: string) {
  return {
    id: processo.rota ?? `${prefixo}:${processo.label}`,
    label: processo.label,
    disabled: processo.status === "em-breve",
    badge: processo.status === "parcial" ? ("parcial" as const) : undefined,
  };
}

export function navGroupsForEmpresa(empresa: EmpresaId): ShellNavGroup[] {
  const { departamentos, nome } = EMPRESAS_POR_ID[empresa];

  return [
    {
      id: "visao-geral",
      label: "Visão geral",
      items: VISAO_GERAL.map((processo) => ({
        ...navItem(processo, "visao"),
        icon: processo.rota === "/" ? ("home" as const) : ("pulse" as const),
      })),
    },
    // Macro (departamento) abre e fecha; micro (processo) fica aninhado nele.
    ...departamentos.map((departamento, indice) => ({
      id: `${empresa}-${departamento.id}`,
      label: departamento.label,
      icon: departamento.icon,
      collapsible: true,
      section: indice === 0 ? `Departamentos · ${nome}` : undefined,
      items: departamento.processos.map((processo) => navItem(processo, departamento.id)),
    })),
    {
      id: "plataforma",
      label: "As duas empresas",
      section: "Plataforma",
      items: GLOBAIS.map((processo) => ({
        ...navItem(processo, "global"),
        icon: "settings" as const,
      })),
    },
  ];
}

/**
 * Casa a rota atual com o item da sidebar. Uma tela de detalhe
 * (`/comercial/oportunidades/:id`) não tem item próprio e deve destacar o item
 * da sua listagem — daí o casamento pelo prefixo mais longo.
 */
export function navIdForPathname(pathname: string): string {
  if (pathname === "/") return "/";

  const rotas = [
    ...VISAO_GERAL,
    ...GLOBAIS,
    ...Object.values(EMPRESAS_POR_ID).flatMap((empresa) =>
      empresa.departamentos.flatMap((departamento) => departamento.processos),
    ),
  ]
    .map((processo) => processo.rota)
    .filter((rota): rota is string => Boolean(rota) && rota !== "/");

  if (rotas.includes(pathname)) return pathname;

  return (
    rotas
      .filter((rota) => pathname.startsWith(`${rota}/`))
      .sort((a, b) => b.length - a.length)[0] ?? pathname
  );
}

/** Título do topo e do cabeçalho da página para a rota atual. */
export function tituloForNavId(navId: string, empresa: EmpresaId): string {
  const todos = [
    ...VISAO_GERAL,
    ...GLOBAIS,
    ...EMPRESAS_POR_ID[empresa].departamentos.flatMap((d) => d.processos),
  ];

  return todos.find((processo) => processo.rota === navId)?.label ?? "Plugga OS";
}
