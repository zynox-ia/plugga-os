import type { UserAccess } from "@plugga/shared";

import type { IconName, ShellNavGroup } from "../components/plugga-shell";
import {
  EMPRESAS_POR_ID,
  CONFIGURACOES,
  FERRAMENTAS,
  GLOBAIS,
  ORDEM_DEPARTAMENTOS,
  ROTAS_FORA_DO_MENU,
  VISAO_GERAL,
  departamentosPermitidos,
  type Departamento,
  type Processo,
} from "./organizacao.ts";

/**
 * Deriva a navegação de `organizacao.ts`: uma lista de departamentos e processos.
 * Processos sem tela permanecem visíveis e desabilitados. Ferramentas
 * (com Configurações no fim) fecha a barra; Atividades não tem item, mas a rota
 * segue resolvendo título e destaque.
 *
 * O id do item é a própria rota quando ela existe; para o que não tem tela, um
 * id sintético mantém a chave única sem inventar uma rota que daria 404.
 */

const ICONES_FERRAMENTAS: Record<string, IconName> = {
  "/agentes-ia": "sparkles",
  "/configuracoes": "settings",
};

function navItem(processo: Processo, prefixo: string) {
  return {
    id: processo.rota ?? `${prefixo}:${processo.label}`,
    label: processo.label,
    disabled: processo.status === "em-breve",
  };
}

/**
 * `acesso` ausente = navegação inteira (o estado antes de /me responder, e o
 * uso em teste). Com acesso, entram só os departamentos liberados. Para os
 * departamentos que existem nas duas empresas, uma única entrada é exibida.
 */
export function navGroupsForAccess(acesso: UserAccess | null = null): ShellNavGroup[] {
  const plugga = departamentosPermitidos("plugga", acesso);
  const waze = departamentosPermitidos("waze", acesso);
  const departamentos = [...plugga];
  for (const departamento of waze) {
    if (!departamentos.some((atual) => atual.label === departamento.label)) {
      departamentos.push(departamento);
    }
  }
  const posicao = (departamento: Departamento) =>
    (ORDEM_DEPARTAMENTOS as readonly string[]).indexOf(departamento.label);
  departamentos.sort((a, b) => posicao(a) - posicao(b));

  return [
    {
      id: "visao-geral",
      label: "Visão geral",
      items: VISAO_GERAL.map((processo) => ({
        ...navItem(processo, "visao"),
        icon: "home" as const,
      })),
    },
    // Macro (departamento) abre e fecha; micro (processo) fica aninhado nele.
    ...departamentos.map((departamento, indice) => ({
      id: departamento.id,
      label: departamento.label,
      icon: departamento.icon,
      collapsible: true,
      section: indice === 0 ? "Departamentos" : undefined,
      items: departamento.processos.map((processo) => navItem(processo, departamento.id)),
    })),
    {
      id: "ferramentas",
      label: "Ferramentas",
      items: FERRAMENTAS.map((processo) => ({
        ...navItem(processo, "ferramenta"),
        icon: ICONES_FERRAMENTAS[processo.rota ?? processo.label] ?? ("chart" as const),
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
    ...FERRAMENTAS,
    ...ROTAS_FORA_DO_MENU,
    ...CONFIGURACOES,
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
export function tituloForNavId(navId: string): string {
  const todos = [
    ...VISAO_GERAL,
    ...FERRAMENTAS,
    ...ROTAS_FORA_DO_MENU,
    ...CONFIGURACOES,
    ...GLOBAIS,
    ...Object.values(EMPRESAS_POR_ID).flatMap((empresa) =>
      empresa.departamentos.flatMap((departamento) => departamento.processos),
    ),
  ];

  return todos.find((processo) => processo.rota === navId)?.label ?? "plugga-os";
}
