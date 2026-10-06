import { EstadoDaApi } from "../components/estado-da-api";
import { IntegracoesView } from "../components/integracoes-view";
import { fetchEmailStatus, fetchIntegrations } from "../lib/api";
import { resolverEstado } from "../lib/estado-da-api";
import { FALLBACK_EMAIL_STATUS } from "../lib/mock/email-status";
import { FALLBACK_INTEGRATIONS } from "../lib/mock/integrations";

export default async function IntegracoesPage() {
  const [integracoes, email] = await Promise.all([fetchIntegrations(), fetchEmailStatus()]);
  const estadoIntegracoes = resolverEstado(integracoes, (resposta) => resposta.items, FALLBACK_INTEGRATIONS);
  if (estadoIntegracoes.estado === "erro") return <EstadoDaApi erro={estadoIntegracoes.erro} eyebrow="Plataforma" />;
  const estadoEmail = resolverEstado(email, (dados) => dados, FALLBACK_EMAIL_STATUS);
  if (estadoEmail.estado === "erro") return <EstadoDaApi erro={estadoEmail.erro} eyebrow="Plataforma" />;

  return (
    <IntegracoesView
      items={estadoIntegracoes.dados}
      isLive={estadoIntegracoes.estado === "ok"}
      emailStatus={estadoEmail.dados}
      isEmailStatusLive={estadoEmail.estado === "ok"}
    />
  );
}
