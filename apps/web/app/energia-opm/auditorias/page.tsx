import { AuditoriasView } from "../../components/auditorias-view";
import { fetchAudits } from "../../lib/api";
import { FALLBACK_AUDITS } from "../../lib/mock/energy";

export default async function AuditoriasPage() {
  const response = await fetchAudits();

  return <AuditoriasView items={response?.items ?? FALLBACK_AUDITS} isLive={response !== null} />;
}
