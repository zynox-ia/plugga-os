import { EstadoDaApi } from "../../components/estado-da-api";
import { OrdensDeServicoView } from "../../components/engenharia/ordens-de-servico-view";
import { fetchOpcoesDaEngenharia, fetchOrdensDeServico, fetchQuadroDeOrdens } from "../../lib/api";
import { hojeEmManaus } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDaLista, consultaDoQuadro, lerFiltrosDasOrdens } from "../../lib/ordens-de-servico";

export default async function OrdensDeServicoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirPagina("/engenharia/ordens-de-servico");
  const filtros = lerFiltrosDasOrdens(await searchParams);
  const quadro = filtros.visao === "quadro";

  // No quadro, a lista vem só pelas contagens dos metric cards (sem o filtro de situação, que o quadro não tem).
  const [lista, colunas, opcoes] = await Promise.all([
    fetchOrdensDeServico(quadro ? consultaDoQuadro(filtros) : consultaDaLista(filtros)),
    quadro ? fetchQuadroDeOrdens(consultaDoQuadro(filtros)) : Promise.resolve(null),
    fetchOpcoesDaEngenharia(),
  ]);
  if (!lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Ordens de serviço" />;
  if (colunas && !colunas.ok) return <EstadoDaApi erro={colunas.erro} eyebrow="Ordens de serviço" />;

  return <OrdensDeServicoView filtros={filtros} lista={lista.dados} quadro={colunas?.ok ? colunas.dados : null} opcoes={opcoes.ok ? opcoes.dados : null} hoje={hojeEmManaus()} />;
}
