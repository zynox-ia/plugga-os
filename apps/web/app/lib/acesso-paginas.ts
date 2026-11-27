import { alcancaPlataforma, alcancaTela, papelDoAcesso, telasPorDepartamento, type Acesso, type Tela } from "@plugga/shared";

import { integracoesParaAcesso } from "./integracoes.ts";
import { podeVerCompras } from "./papel-em-compras.ts";
import { engenhariaHabilitado, financeiroHabilitado, type AmbienteDosRecursos } from "./recursos.ts";

/**
 * Lançamentos (e a Visão geral) do Financeiro juntam saídas (`financeiro.pagar`)
 * e entradas (`financeiro.receber`): abrem com qualquer uma das duas, e a API
 * devolve só o tipo que a pessoa alcança (PLU-336).
 */
export const TELAS_DOS_LANCAMENTOS: readonly Tela[] = ["financeiro.pagar", "financeiro.receber"];

/** Ordens de serviço abrem com a tela de O.S. ou com as de instalação, manutenção e visita (PLU-345). */
export const TELAS_DAS_ORDENS_DE_SERVICO: readonly Tela[] = ["engenharia-obras.os", "engenharia-obras.instalacoes", "engenharia-obras.manutencao", "engenharia-obras.visitas"];

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
  // A Visão geral junta os mesmos tipos dos Lançamentos (PLU-336).
  ["/financeiro/visao-geral", TELAS_DOS_LANCAMENTOS],
  ["/financeiro/conciliacao", "financeiro.conciliacao"],
  // Tarefas abre com qualquer tela do Financeiro; a API filtra o que cada um vê.
  ["/financeiro/tarefas", telasPorDepartamento.financeiro],
  ["/engenharia/ordens-de-servico", TELAS_DAS_ORDENS_DE_SERVICO],
  // A agenda de campo é das O.S. (mesmas telas da rota da API, PLU-346).
  ["/engenharia/agenda", TELAS_DAS_ORDENS_DE_SERVICO],
  // Tarefas da Engenharia abrem com qualquer tela do departamento (PLU-349).
  ["/engenharia/tarefas", telasPorDepartamento["engenharia-obras"]],
  ["/engenharia/visao-geral", telasPorDepartamento["engenharia-obras"]],
  // Usinas abrem para toda a Engenharia; conferir e cadastrar pedem a tela de Usinas (a API confere).
  ["/engenharia/usinas", telasPorDepartamento["engenharia-obras"]],
  // Protocolos (PLU-348): uma tela da Engenharia e do Operacional, como a rota da API.
  ["/engenharia/protocolos", ["engenharia-obras.protocolos", "energia-opm.protocolos"]],
  // Obras (PLU-350): a tela de Obras, como a rota da API.
  ["/engenharia/obras", "engenharia-obras.obras"],
];

/** O 404 do portão fechado, no envelope da API (com o alias `message` que os clientes antigos leem). */
export const CORPO_DO_NAO_ENCONTRADO = { codigo: "NAO_ENCONTRADO", mensagem: "Não encontramos o que você procura.", message: "Não encontramos o que você procura." } as const;

/**
 * Os segmentos do caminho como o servidor os resolve, para os portões: o Next
 * decodifica os parâmetros dinâmicos (`/api/tarefas/%66inanceiro` chega ao
 * handler como `financeiro`), então o portão compara o caminho decodificado
 * (até três vezes, para a dupla codificação), sem `\`, `//` nem `.`, e em
 * minúsculas. Errar para mais só fecha um caminho que não existe.
 */
function segmentosCanonicos(caminho: string): string[] {
  let atual = caminho;
  for (let vez = 0; vez < 3; vez += 1) {
    let decodificado: string;
    try {
      decodificado = decodeURIComponent(atual);
    } catch {
      break;
    }
    if (decodificado === atual) break;
    atual = decodificado;
  }
  return atual.replace(/\\/g, "/").split("/").filter((s) => s !== "" && s !== ".").map((s) => s.toLowerCase());
}

/** O caminho (da web ou da API) cai no Financeiro: `/financeiro/**` ou as Tarefas dele. */
function doFinanceiro(segmentos: string[]): boolean {
  return segmentos[0] === "financeiro" || (segmentos[0] === "tarefas" && segmentos[1] === "financeiro");
}

/**
 * Página do Financeiro com o portão fechado (lib/recursos.ts): não existe para
 * ninguém. O middleware a deixa seguir para o layout do Financeiro responder
 * 404, em vez de mandar ao início como faz com quem não tem acesso (PLU-336).
 */
export function fechadaPeloPortaoDoFinanceiro(pathname: string, ambiente?: AmbienteDosRecursos): boolean {
  return segmentosCanonicos(pathname)[0] === "financeiro" && !financeiroHabilitado(ambiente);
}

/**
 * Proxy do Financeiro com o portão fechado: `/api/financeiro/**` e as Tarefas
 * do Financeiro. A web responde 404 sem depender do portão da API, que pode
 * estar configurado diferente (PLU-336).
 */
export function proxyFechadoPeloPortaoDoFinanceiro(pathname: string, ambiente?: AmbienteDosRecursos): boolean {
  const segmentos = segmentosCanonicos(pathname);
  return segmentos[0] === "api" && doFinanceiro(segmentos.slice(1)) && !financeiroHabilitado(ambiente);
}

/** O destino na API (já com os parâmetros resolvidos) é do Financeiro e o portão está fechado. */
export function destinoFechadoPeloPortaoDoFinanceiro(destino: string, ambiente?: AmbienteDosRecursos): boolean {
  return doFinanceiro(segmentosCanonicos(destino)) && !financeiroHabilitado(ambiente);
}

/** `ambiente` só existe para o teste do portão; a tela usa o do build. */
export function podeAbrirPagina(acesso: Acesso, pathname: string, ambiente?: AmbienteDosRecursos): boolean {
  if (["/", "/configuracoes", "/agentes-ia", "/auth/google/complete"].includes(pathname)) return true;
  // Portão do Financeiro em construção: desligado, nenhuma página dele abre.
  if (fechadaPeloPortaoDoFinanceiro(pathname, ambiente)) return false;
  // Portão da Engenharia em construção, igual ao do Financeiro.
  if ((pathname === "/engenharia" || pathname.startsWith("/engenharia/")) && !engenhariaHabilitado(ambiente)) return false;
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
