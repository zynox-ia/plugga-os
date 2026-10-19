import { EstadoDaApi } from "../../components/estado-da-api";
import { PipelinesView } from "../../components/pipelines-view";
import { fetchPipelines } from "../../lib/api";

export default async function PipelinesPage({ searchParams }: { searchParams: Promise<{ pipeline?: string }> }) {
  const { pipeline } = await searchParams;
  const resultado = await fetchPipelines();
  if (!resultado.ok) return <EstadoDaApi erro={resultado.erro} eyebrow="Pipelines" />;

  return <PipelinesView pipelines={resultado.dados.pipelines} canCreateIn={resultado.dados.canCreateIn} selecionadoId={pipeline ?? null} />;
}
