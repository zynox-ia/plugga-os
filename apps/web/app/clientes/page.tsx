import { ClientesView } from "../components/clientes-view";
import { fetchClients } from "../lib/api";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segment?: string; active?: string }>;
}) {
  const filters = await searchParams;
  const clients = await fetchClients(filters);

  return <ClientesView items={clients?.items ?? []} isLive={clients !== null} filters={filters} />;
}
