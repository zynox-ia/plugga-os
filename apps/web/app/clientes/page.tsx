import { ClientesView } from "../components/clientes-view";
import { EstadoDaApi } from "../components/estado-da-api";
import { fetchClients } from "../lib/api";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segment?: string; active?: string }>;
}) {
  const filters = await searchParams;
  const clientes = await fetchClients(filters);
  if (!clientes.ok) return <EstadoDaApi erro={clientes.erro} eyebrow="Clientes" />;

  return <ClientesView items={clientes.dados.items} isLive filters={filters} />;
}
