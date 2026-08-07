import Link from "next/link";

import { CicloDetailView } from "../../../components/ciclo-detail-view";
import { ShellCard } from "../../../components/plugga-shell";
import { fetchCycle } from "../../../lib/api";

export default async function CicloDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cycle = await fetchCycle(id);

  if (!cycle) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Energia &amp; OPM</span>
            <h2>Ciclo não encontrado</h2>
          </div>
        </div>
        <p className="card-note">
          Não foi possível carregar este ciclo agora. <Link href="/energia-opm/ciclos">Voltar à lista</Link>.
        </p>
      </ShellCard>
    );
  }

  return <CicloDetailView cycle={cycle} />;
}
