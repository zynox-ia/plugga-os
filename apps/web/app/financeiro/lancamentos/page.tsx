import { EstadoDaApi } from "../../components/estado-da-api";
import { LancamentosView } from "../../components/financeiro/lancamentos-view";
import { fetchLancamentos, fetchQuadroFinanceiro } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDosLancamentos, lerFiltrosDosLancamentos } from "../../lib/financeiro";

export default async function LancamentosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirPagina("/financeiro/lancamentos");
  const filtros = lerFiltrosDosLancamentos(await searchParams);

  // O resumo dos metric cards vem com a lista; no quadro, a lista vem também
  // (sem situação) para os cards, e as colunas vêm do endpoint do quadro.
  const [lista, quadro] = await Promise.all([
    fetchLancamentos(consultaDosLancamentos(filtros, filtros.visao === "quadro" ? "quadro" : "lista")),
    filtros.visao === "quadro" ? fetchQuadroFinanceiro(consultaDosLancamentos(filtros, "quadro")) : Promise.resolve(null),
  ]);
  if (!lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Lançamentos" />;
  if (quadro && !quadro.ok) return <EstadoDaApi erro={quadro.erro} eyebrow="Lançamentos" />;

  return <LancamentosView filtros={filtros} lista={lista.dados} quadro={quadro?.ok ? quadro.dados : null} alcance={lista.dados.alcance} />;
}
