import { alcancaTela } from "@plugga/shared";

import { EstadoDaApi } from "../../components/estado-da-api";
import { OrdensDeServicoView } from "../../components/engenharia/ordens-de-servico-view";
import { fetchOpcoesDaEngenharia, fetchOrdemDeServico, fetchOrdensDeServico, fetchQuadroDeOrdens } from "../../lib/api";
import { podeAbrirPagina } from "../../lib/acesso-paginas";
import { hojeEmManaus } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDaLista, consultaDoQuadro, ehUuid, lerFiltrosDasOrdens } from "../../lib/ordens-de-servico";

export default async function OrdensDeServicoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/engenharia/ordens-de-servico");
  const parametros = await searchParams;
  const filtros = lerFiltrosDasOrdens(parametros);
  const quadro = filtros.visao === "quadro";

  // No quadro, a lista vem só pelas contagens dos metric cards (sem o filtro de situação, que o quadro não tem).
  const [lista, colunas, opcoes, ficha] = await Promise.all([
    fetchOrdensDeServico(quadro ? consultaDoQuadro(filtros) : consultaDaLista(filtros)),
    quadro ? fetchQuadroDeOrdens(consultaDoQuadro(filtros)) : Promise.resolve(null),
    fetchOpcoesDaEngenharia(),
    ehUuid(parametros.os) ? fetchOrdemDeServico(parametros.os) : Promise.resolve(null),
  ]);
  if (!lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Ordens de serviço" />;
  if (colunas && !colunas.ok) return <EstadoDaApi erro={colunas.erro} eyebrow="Ordens de serviço" />;

  // Ficha que não abriu: 404 é link errado ou O.S. fora do alcance; o resto, indisponível agora.
  const falhaDaFicha = !parametros.os || ficha?.ok ? null : ficha && ficha.erro.tipo !== "naoEncontrado" ? "indisponivel" : "nao_encontrada";

  return <OrdensDeServicoView filtros={filtros} lista={lista.dados} quadro={colunas?.ok ? colunas.dados : null} opcoes={opcoes.ok ? opcoes.dados : null} hoje={hojeEmManaus()}
    ficha={ficha?.ok ? ficha.dados : null} falhaDaFicha={falhaDaFicha} podeAbrirCompras={podeAbrirPagina(sessao.acesso, "/suprimentos/compras")}
    podeCadastrarUsina={alcancaTela(sessao.acesso, "engenharia-obras.usinas")} />;
}
