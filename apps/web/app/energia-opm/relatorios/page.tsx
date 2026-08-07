import type { CycleReportsResponse } from "@plugga/shared";

import { RelatoriosView } from "../../components/relatorios-view";
import { fetchCycleReports } from "../../lib/api";
import { FALLBACK_CYCLES } from "../../lib/mock/energy";

function fallbackReport(): CycleReportsResponse {
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
  const response = await fetchCycleReports();

  return <RelatoriosView report={response ?? fallbackReport()} isLive={response !== null} />;
}
