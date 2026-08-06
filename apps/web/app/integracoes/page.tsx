import { IntegracoesView } from "../components/integracoes-view";
import { fetchIntegrations } from "../lib/api";
import { FALLBACK_INTEGRATIONS } from "../lib/mock/integrations";

export default async function IntegracoesPage() {
  const response = await fetchIntegrations();

  return <IntegracoesView items={response?.items ?? FALLBACK_INTEGRATIONS} isLive={response !== null} />;
}
