import type { CycleReportsResponse } from "@plugga/shared";

import { EstadoDaApi } from "../../components/estado-da-api";
import { RelatoriosView } from "../../components/relatorios-view";
import { fetchCycleReports } from "../../lib/api";
import { resolverEstado } from "../../lib/estado-da-api";
import { FALLBACK_CYCLES } from "../../lib/mock/energy";

function relatorioDeExemplo(): CycleReportsResponse {
  const estimatedSavings = FALLBACK_CYCLES.reduce((sum, item) => sum + Number(item.estimatedSavings ?? 0), 0);
  const realizedSavings = FALLBACK_CYCLES.reduce((sum, item) => sum + Number(item.realizedSavings ?? 0), 0);
  return {
    items: FALLBACK_CYCLES,
    totals: {
      count: FALLBACK_CYCLES.length,
      estimatedSavings: estimatedSavings.toFixed(2),
      realizedSavings: realizedSavings.toFixed(2),
    },
  };
}

export default async function RelatoriosPage() {
  const estado = resolverEstado(await fetchCycleReports(), (resposta) => resposta, relatorioDeExemplo());
  if (estado.estado === "erro") return <EstadoDaApi erro={estado.erro} eyebrow="Energia & OPM" />;

  return <RelatoriosView report={estado.dados} isLive={estado.estado === "ok"} />;
}
