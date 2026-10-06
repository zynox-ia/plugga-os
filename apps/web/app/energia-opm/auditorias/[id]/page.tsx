import { AuditoriaDetailView } from "../../../components/auditoria-detail-view";
import { EstadoDaApi } from "../../../components/estado-da-api";
import { fetchAudit, fetchContestation } from "../../../lib/api";

export default async function AuditoriaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultado = await fetchAudit(id);

  if (!resultado.ok) {
    return (
      <EstadoDaApi
        erro={resultado.erro}
        eyebrow="Energia & OPM"
        voltar={{ href: "/energia-opm/auditorias", rotulo: "Voltar à lista" }}
      />
    );
  }

  const audit = resultado.dados;
  // A contestação é complemento da tela: se falhar, a auditoria ainda abre.
  const contestacao = audit.contestationId ? await fetchContestation(audit.contestationId) : null;

  return <AuditoriaDetailView audit={audit} contestation={contestacao?.ok ? contestacao.dados : null} />;
}
