import { EstadoDaApi } from "../../../components/estado-da-api";
import { OportunidadeDetailView } from "../../../components/oportunidade-detail-view";
import { fetchOpportunity } from "../../../lib/api";

export default async function OportunidadeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultado = await fetchOpportunity(id);

  if (!resultado.ok) {
    return (
      <EstadoDaApi
        erro={resultado.erro}
        eyebrow="Comercial"
        voltar={{ href: "/comercial/oportunidades", rotulo: "Voltar à fila" }}
      />
    );
  }

  return <OportunidadeDetailView opportunity={resultado.dados} />;
}
