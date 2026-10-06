import { ContratoDetailView } from "../../../components/contrato-detail-view";
import { EstadoDaApi } from "../../../components/estado-da-api";
import { fetchContract } from "../../../lib/api";

export default async function ContratoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultado = await fetchContract(id);

  if (!resultado.ok) {
    return (
      <EstadoDaApi
        erro={resultado.erro}
        eyebrow="Comercial"
        voltar={{ href: "/comercial/contratos", rotulo: "Voltar à lista" }}
      />
    );
  }

  return <ContratoDetailView contract={resultado.dados} />;
}
