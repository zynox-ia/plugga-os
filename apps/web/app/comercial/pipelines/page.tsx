import { EstadoDaApi } from "../../components/estado-da-api";
import { PipelinesView } from "../../components/pipelines-view";
import { fetchDeals, fetchPipelines } from "../../lib/api";

export default async function PipelinesPage({ searchParams }: { searchParams: Promise<{ pipeline?: string; visao?: string }> }) {
  const { pipeline, visao } = await searchParams;
  const resultado = await fetchPipelines();
  if (!resultado.ok) return <EstadoDaApi erro={resultado.erro} eyebrow="Pipelines" />;

  const ativos = resultado.dados.pipelines.filter((p) => p.archivedAt === null);
  const selecionado = ativos.find((p) => p.id === pipeline) ?? ativos[0] ?? null;
  const negocios = selecionado ? await fetchDeals(selecionado.id) : null;
  if (negocios && !negocios.ok) return <EstadoDaApi erro={negocios.erro} eyebrow="Pipelines" />;

  return (
    <PipelinesView
      pipelines={resultado.dados.pipelines}
      canCreateIn={resultado.dados.canCreateIn}
      selecionadoId={selecionado?.id ?? null}
      visao={visao === "lista" ? "lista" : "kanban"}
      negocios={negocios?.ok ? negocios.dados.deals : []}
      responsaveis={resultado.dados.responsaveis}
    />
  );
}
