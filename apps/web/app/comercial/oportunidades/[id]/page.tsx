import Link from "next/link";

import { OportunidadeDetailView } from "../../../components/oportunidade-detail-view";
import { ShellCard } from "../../../components/plugga-shell";
import { fetchOpportunity } from "../../../lib/api";

export default async function OportunidadeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opportunity = await fetchOpportunity(id);

  if (!opportunity) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Comercial</span>
            <h2>Oportunidade não encontrada</h2>
          </div>
        </div>
        <p className="card-note">
          Não foi possível carregar esta oportunidade agora. <Link href="/comercial/oportunidades">Voltar à fila</Link>.
        </p>
      </ShellCard>
    );
  }

  return <OportunidadeDetailView opportunity={opportunity} />;
}
