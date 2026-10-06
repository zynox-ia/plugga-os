import { EstadoDaApi } from "../../components/estado-da-api";
import { OportunidadesView } from "../../components/oportunidades-view";
import { fetchOpportunities } from "../../lib/api";
import { resolverEstado } from "../../lib/estado-da-api";
import { FALLBACK_OPPORTUNITIES } from "../../lib/mock/commercial";

export default async function OportunidadesPage() {
  const estado = resolverEstado(await fetchOpportunities(), (resposta) => resposta.items, FALLBACK_OPPORTUNITIES);
  if (estado.estado === "erro") return <EstadoDaApi erro={estado.erro} eyebrow="Comercial" />;

  return <OportunidadesView items={estado.dados} isLive={estado.estado === "ok"} />;
}
