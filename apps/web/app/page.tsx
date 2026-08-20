import { DashboardView } from "./components/dashboard-view";
import { fetchHealth } from "./lib/api";

export default async function InicioPage() {
  const health = await fetchHealth();

  return <DashboardView health={health} />;
}
