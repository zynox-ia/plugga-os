import { EstadoDaApi } from "../../components/estado-da-api";
import { MigracoesView } from "../../components/migracoes-view";
import { fetchMarketMigrations } from "../../lib/api";
import { resolverEstado } from "../../lib/estado-da-api";
import { FALLBACK_MARKET_MIGRATIONS } from "../../lib/mock/energy";

export default async function MigracoesPage() {
  const estado = resolverEstado(await fetchMarketMigrations(), (resposta) => resposta.items, FALLBACK_MARKET_MIGRATIONS);
  if (estado.estado === "erro") return <EstadoDaApi erro={estado.erro} eyebrow="Energia & OPM" />;

  return <MigracoesView items={estado.dados} isLive={estado.estado === "ok"} />;
}
