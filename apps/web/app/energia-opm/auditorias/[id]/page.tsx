import Link from "next/link";

import { AuditoriaDetailView } from "../../../components/auditoria-detail-view";
import { ShellCard } from "../../../components/plugga-shell";
import { fetchAudit, fetchContestation } from "../../../lib/api";

export default async function AuditoriaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await fetchAudit(id);

  if (!audit) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Energia &amp; OPM</span>
            <h2>Auditoria não encontrada</h2>
          </div>
        </div>
        <p className="card-note">
          Não foi possível carregar esta auditoria agora. <Link href="/energia-opm/auditorias">Voltar à lista</Link>.
        </p>
      </ShellCard>
    );
  }

  const contestation = audit.contestationId ? await fetchContestation(audit.contestationId) : null;

  return <AuditoriaDetailView audit={audit} contestation={contestation} />;
}
