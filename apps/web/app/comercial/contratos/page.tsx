import { ContratosView } from "../../components/contratos-view";
import { fetchContracts } from "../../lib/api";
import { FALLBACK_CONTRACTS } from "../../lib/mock/commercial";

export default async function ContratosPage() {
  const response = await fetchContracts();

  return <ContratosView items={response?.items ?? FALLBACK_CONTRACTS} isLive={response !== null} />;
}
