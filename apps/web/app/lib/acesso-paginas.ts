import { alcancaPlataforma, alcancaTela, papelDoAcesso, type Acesso, type Tela } from "@plugga/shared";

import { integracoesParaAcesso } from "./integracoes.ts";
import { podeVerCompras } from "./papel-em-compras.ts";
import { financeiroHabilitado, type AmbienteDosRecursos } from "./recursos.ts";

/**
 * Lançamentos (e a Visão geral) do Financeiro juntam saídas (`financeiro.pagar`)
 * e entradas (`financeiro.receber`): abrem com qualquer uma das duas, e a API
 * devolve só o tipo que a pessoa alcança (PLU-336).
 */
export const TELAS_DOS_LANCAMENTOS: readonly Tela[] = ["financeiro.pagar", "financeiro.receber"];

/** A página abre com a tela, ou com qualquer uma da lista. */
const paginas: ReadonlyArray<readonly [string, Tela | readonly Tela[]]> = [
  ["/clientes", "crm.clientes"],
  ["/comercial/pipelines", "crm.pipelines"],
  ["/comercial/oportunidades", "crm.pipelines"],
  ["/comercial/atividades", "crm.pipelines"],
  ["/crm", "crm.pipelines"],
  ["/documentos", "crm.pipelines"],
  ["/comercial/contratos", "crm.contratos"],
  ["/suprimentos/fornecedores", "suprimentos.fornecedores"],
  ["/suprimentos/compras", "suprimentos.compras"],
  ["/suprimentos/estoque", "suprimentos.estoque"],
  ["/financeiro/lancamentos", TELAS_DOS_LANCAMENTOS],
];

/** `ambiente` só existe para o teste do portão; a tela usa o do build. */
export function podeAbrirPagina(acesso: Acesso, pathname: string, ambiente?: AmbienteDosRecursos): boolean {
  if (["/", "/configuracoes", "/agentes-ia", "/auth/google/complete"].includes(pathname)) return true;
  // Portão do Financeiro em construção: desligado, nenhuma página dele abre (lib/recursos.ts).
  if ((pathname === "/financeiro" || pathname.startsWith("/financeiro/")) && !financeiroHabilitado(ambiente)) return false;
  if (pathname === "/administracao") return papelDoAcesso(acesso) !== "membro";
  if (pathname === "/integracoes") return integracoesParaAcesso(acesso, "integracoes").length > 0;
  if (["/jobs", "/estrutura"].includes(pathname) || pathname === "/design-system" || pathname.startsWith("/design-system/")) {
    return alcancaPlataforma(acesso, "desenvolvedor");
  }
  // Compras abre também para o Financeiro, que aprova e paga (mesma regra da API).
  if (pathname === "/suprimentos/compras" || pathname.startsWith("/suprimentos/compras/")) return podeVerCompras(acesso);
  const pagina = paginas.find(([prefixo]) => pathname === prefixo || pathname.startsWith(`${prefixo}/`));
  // Tela nova precisa declarar acesso antes de ficar disponível por URL.
  if (pagina === undefined) return false;
  const telas: readonly Tela[] = typeof pagina[1] === "string" ? [pagina[1]] : pagina[1];
  return telas.some((tela) => alcancaTela(acesso, tela));
}
