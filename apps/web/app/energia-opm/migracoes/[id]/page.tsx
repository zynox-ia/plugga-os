import Link from "next/link";

import { MigracaoDetailView } from "../../../components/migracao-detail-view";
import { ShellCard } from "../../../components/plugga-shell";
import { fetchMarketMigrations } from "../../../lib/api";
import { FALLBACK_MARKET_MIGRATIONS } from "../../../lib/mock/energy";

export default async function MigracaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetchMarketMigrations();
  const migration = (response?.items ?? FALLBACK_MARKET_MIGRATIONS).find((item) => item.id === id);

  if (!migration) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Energia & OPM</span>
            <h2>Migração não encontrada</h2>
          </div>
        </div>
        <p className="card-note">
          Não foi possível carregar esta migração agora. <Link href="/energia-opm/migracoes">Voltar à fila</Link>.
        </p>
      </ShellCard>
    );
  }

  return <MigracaoDetailView migration={migration} />;
}
