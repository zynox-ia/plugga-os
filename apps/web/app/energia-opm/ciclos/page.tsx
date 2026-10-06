import { CiclosView } from "../../components/ciclos-view";
import { EstadoDaApi } from "../../components/estado-da-api";
import { fetchCycles } from "../../lib/api";
import { resolverEstado } from "../../lib/estado-da-api";
import { FALLBACK_CYCLES } from "../../lib/mock/energy";

export default async function CiclosPage() {
  const estado = resolverEstado(await fetchCycles(), (resposta) => resposta.items, FALLBACK_CYCLES);
  if (estado.estado === "erro") return <EstadoDaApi erro={estado.erro} eyebrow="Energia & OPM" />;

  return <CiclosView items={estado.dados} isLive={estado.estado === "ok"} />;
}
