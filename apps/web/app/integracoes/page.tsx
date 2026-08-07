import { IntegracoesView } from "../components/integracoes-view";
import { fetchEmailStatus, fetchIntegrations } from "../lib/api";
import { FALLBACK_EMAIL_STATUS } from "../lib/mock/email-status";
import { FALLBACK_INTEGRATIONS } from "../lib/mock/integrations";

export default async function IntegracoesPage() {
  const [integrations, emailStatus] = await Promise.all([fetchIntegrations(), fetchEmailStatus()]);

  return (
    <IntegracoesView
      items={integrations?.items ?? FALLBACK_INTEGRATIONS}
      isLive={integrations !== null}
      emailStatus={emailStatus ?? FALLBACK_EMAIL_STATUS}
      isEmailStatusLive={emailStatus !== null}
    />
  );
}
