import { fetchEmailStatus, fetchEquipe, fetchIntegrations, fetchJobs } from "../lib/api";
import { resolverEstado } from "../lib/estado-da-api";
import { exigirPagina } from "../lib/exigir-pagina";
import { configuracoesParaAcesso } from "../lib/organizacao";
import { ConfiguracoesView } from "./configuracoes-view";

export const metadata = { title: "Configurações · plugga-os" };

/** Autoriza cada seção antes de carregar dados no servidor. */
export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams?: Promise<{ aba?: string }>;
}) {
  const usuario = await exigirPagina("/configuracoes");
  const secoes = configuracoesParaAcesso(usuario.acesso);
  const veEquipe = secoes.some((secao) => secao.id === "equipe");
  const veIntegracoes = secoes.some((secao) => secao.id === "integracoes");
  const veJobs = secoes.some((secao) => secao.id === "desenvolvedor");
  const params = searchParams ? await searchParams : {};
  const equipe = veEquipe ? await fetchEquipe() : null;
  const [integracoes, email, jobs] = await Promise.all([
    veIntegracoes ? fetchIntegrations() : null,
    veIntegracoes ? fetchEmailStatus() : null,
    veJobs ? fetchJobs() : null,
  ]);
  const estadoIntegracoes = integracoes ? resolverEstado(integracoes, (r) => r.items) : null;
  const estadoEmail = email ? resolverEstado(email, (d) => d) : null;
  const estadoJobs = jobs ? resolverEstado(jobs, (r) => r.items) : null;

  return (
    <ConfiguracoesView
      abaInicial={params.aba ?? null}
      equipeInicial={equipe?.ok ? equipe.dados : null}
      integracoesDados={estadoIntegracoes?.estado === "ok" && estadoEmail?.estado === "ok" ? {
        items: estadoIntegracoes.dados,
        isLive: true,
        emailStatus: estadoEmail.dados,
        isEmailStatusLive: true,
      } : null}
      erroIntegracoes={estadoIntegracoes?.estado === "erro" ? estadoIntegracoes.erro
        : estadoEmail?.estado === "erro" ? estadoEmail.erro : null}
      jobsDados={estadoJobs?.estado === "ok" ? { items: estadoJobs.dados, isLive: true } : null}
      erroJobs={estadoJobs?.estado === "erro" ? estadoJobs.erro : null}
    />
  );
}
