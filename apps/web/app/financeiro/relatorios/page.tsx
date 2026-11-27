import { alcancaTela, relatorioPorCategoriaSchema } from "@plugga/shared";

import { EstadoDaApi } from "../../components/estado-da-api";
import { RelatoriosDoFinanceiroView } from "../../components/financeiro/relatorios-do-financeiro-view";
import { podeAbrirPagina } from "../../lib/acesso-paginas";
import { fetchOpcoesDoFinanceiro } from "../../lib/api";
import { lerApi } from "../../lib/api-client";
import { hojeEmManaus } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDoRelatorio, lerFiltrosDoRelatorio } from "../../lib/relatorios-do-financeiro";

/** As telas que leem as opções do Financeiro (a engrenagem); só Relatórios não lê. */
const TELAS_DAS_OPCOES = ["financeiro.pagar", "financeiro.receber", "financeiro.conciliacao", "financeiro.fiscal"] as const;

/** Relatório por grupo e categoria (PLU-360): abre com a tela de Relatórios; cada seção soma o que a sessão vê. */
export default async function RelatoriosDoFinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/financeiro/relatorios");
  const hoje = hojeEmManaus();
  const filtros = lerFiltrosDoRelatorio(await searchParams, hoje);
  const leOpcoes = TELAS_DAS_OPCOES.some((tela) => alcancaTela(sessao.acesso, tela));
  const [relatorio, opcoes] = await Promise.all([
    lerApi("/financeiro/relatorios/categorias", relatorioPorCategoriaSchema, {}, { consulta: consultaDoRelatorio(filtros) }),
    leOpcoes ? fetchOpcoesDoFinanceiro() : Promise.resolve(null),
  ]);
  if (!relatorio.ok) return <EstadoDaApi erro={relatorio.erro} eyebrow="Relatórios" />;
  return <RelatoriosDoFinanceiroView hoje={hoje} filtros={filtros} relatorio={relatorio.dados}
    opcoes={opcoes?.ok ? opcoes.dados : null} abreLancamentos={podeAbrirPagina(sessao.acesso, "/financeiro/lancamentos")} />;
}
