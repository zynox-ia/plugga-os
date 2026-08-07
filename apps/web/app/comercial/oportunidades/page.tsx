import { OportunidadesView } from "../../components/oportunidades-view";
import { fetchOpportunities } from "../../lib/api";
import { FALLBACK_OPPORTUNITIES } from "../../lib/mock/commercial";

export default async function OportunidadesPage() {
  const response = await fetchOpportunities();

  return <OportunidadesView items={response?.items ?? FALLBACK_OPPORTUNITIES} isLive={response !== null} />;
}
