import { AuditoriasView } from "../../components/auditorias-view";
import { EstadoDaApi } from "../../components/estado-da-api";
import { fetchAudits } from "../../lib/api";
import { resolverEstado } from "../../lib/estado-da-api";
import { FALLBACK_AUDITS } from "../../lib/mock/energy";

export default async function AuditoriasPage() {
  const estado = resolverEstado(await fetchAudits(), (resposta) => resposta.items, FALLBACK_AUDITS);
  if (estado.estado === "erro") return <EstadoDaApi erro={estado.erro} eyebrow="Energia & OPM" />;

  return <AuditoriasView items={estado.dados} isLive={estado.estado === "ok"} />;
}
