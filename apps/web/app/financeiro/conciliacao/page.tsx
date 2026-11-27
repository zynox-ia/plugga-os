import { alcancaDepartamento, alcancaTela } from "@plugga/shared";

import { EstadoDaApi } from "../../components/estado-da-api";
import { ConciliacaoView } from "../../components/financeiro/conciliacao-view";
import { fetchOpcoesDoFinanceiro, fetchPainelDaConciliacao } from "../../lib/api";
import { hojeEmManaus } from "../../lib/compras";
import { consultaDaConciliacao, lerFiltrosDaConciliacao } from "../../lib/conciliacao";
import { podeAbrirPagina } from "../../lib/acesso-paginas";
import { exigirPagina } from "../../lib/exigir-pagina";

export default async function ConciliacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/financeiro/conciliacao");
  const filtros = lerFiltrosDaConciliacao(await searchParams, hojeEmManaus());
  const [painel, opcoes] = await Promise.all([
    fetchPainelDaConciliacao(consultaDaConciliacao(filtros)),
    fetchOpcoesDoFinanceiro(),
  ]);
  if (!painel.ok) return <EstadoDaApi erro={painel.erro} eyebrow="Conciliação" />;
  return <ConciliacaoView filtros={filtros} painel={painel.dados} opcoes={opcoes.ok ? opcoes.dados : null} gerente={alcancaDepartamento(sessao.acesso, "financeiro", "gerente")}
    buscaCliente={alcancaTela(sessao.acesso, "financeiro.receber")} abreLancamentos={podeAbrirPagina(sessao.acesso, "/financeiro/lancamentos")} />;
}
