import { EstadoDaApi } from "../../../components/estado-da-api";
import { MigracaoDetailView } from "../../../components/migracao-detail-view";
import { fetchMarketMigrations } from "../../../lib/api";
import { erroDe } from "../../../lib/api-core";
import { resolverEstado } from "../../../lib/estado-da-api";
import { FALLBACK_MARKET_MIGRATIONS } from "../../../lib/mock/energy";

export default async function MigracaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const estado = resolverEstado(await fetchMarketMigrations(), (resposta) => resposta.items, FALLBACK_MARKET_MIGRATIONS);
  const voltar = { href: "/energia-opm/migracoes", rotulo: "Voltar à fila" };
  if (estado.estado === "erro") return <EstadoDaApi erro={estado.erro} eyebrow="Energia & OPM" voltar={voltar} />;

  const migration = estado.dados.find((item) => item.id === id);
  if (!migration) {
    return <EstadoDaApi erro={erroDe("naoEncontrado", { status: 404 })} eyebrow="Energia & OPM" voltar={voltar} />;
  }

  return <MigracaoDetailView migration={migration} isLive={estado.estado === "ok"} />;
}
