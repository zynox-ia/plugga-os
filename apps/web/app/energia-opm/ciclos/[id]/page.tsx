import { CicloDetailView } from "../../../components/ciclo-detail-view";
import { EstadoDaApi } from "../../../components/estado-da-api";
import { fetchCycle } from "../../../lib/api";

export default async function CicloDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultado = await fetchCycle(id);

  if (!resultado.ok) {
    return (
      <EstadoDaApi
        erro={resultado.erro}
        eyebrow="Energia & OPM"
        voltar={{ href: "/energia-opm/ciclos", rotulo: "Voltar à lista" }}
      />
    );
  }

  return <CicloDetailView cycle={resultado.dados} />;
}
