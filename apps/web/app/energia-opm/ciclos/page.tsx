import { CiclosView } from "../../components/ciclos-view";
import { fetchCycles } from "../../lib/api";
import { FALLBACK_CYCLES } from "../../lib/mock/energy";

export default async function CiclosPage() {
  const response = await fetchCycles();

  return <CiclosView items={response?.items ?? FALLBACK_CYCLES} isLive={response !== null} />;
}
