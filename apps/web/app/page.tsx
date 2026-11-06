import { DashboardView } from "./components/dashboard-view";
import { PlaceholderScreen } from "./components/placeholder-screen";
import { fetchHealth } from "./lib/api";
import { exigirPagina } from "./lib/exigir-pagina";

export default async function InicioPage() {
  const usuario = await exigirPagina("/");
  // O cockpit atual reúne métricas de todos os departamentos.
  if (usuario.acesso.plataforma === null) {
    return <PlaceholderScreen title="Seu espaço" description="Abra no menu uma das telas liberadas para você." status="em-construcao" />;
  }
  const health = await fetchHealth();

  return <DashboardView health={health.ok ? health.dados : null} />;
}
