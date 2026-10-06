import { EstadoDaApi } from "../components/estado-da-api";
import { JobsView } from "../components/jobs-view";
import { fetchJobs } from "../lib/api";
import { resolverEstado } from "../lib/estado-da-api";
import { FALLBACK_JOB_RUNS } from "../lib/mock/jobs";

export default async function JobsPage() {
  const estado = resolverEstado(await fetchJobs(), (resposta) => resposta.items, FALLBACK_JOB_RUNS);
  if (estado.estado === "erro") return <EstadoDaApi erro={estado.erro} eyebrow="Plataforma" />;

  return <JobsView items={estado.dados} isLive={estado.estado === "ok"} />;
}
