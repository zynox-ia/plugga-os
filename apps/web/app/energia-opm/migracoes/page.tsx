import { MigracoesView } from "../../components/migracoes-view";
import { fetchMarketMigrations } from "../../lib/api";
import { FALLBACK_MARKET_MIGRATIONS } from "../../lib/mock/energy";

// TODO(ticket 5 — web+e2e consolidation): wire this route into navigation.ts.
export default async function MigracoesPage() {
  const response = await fetchMarketMigrations();

  return <MigracoesView items={response?.items ?? FALLBACK_MARKET_MIGRATIONS} isLive={response !== null} />;
}
