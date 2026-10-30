import { ClientesView } from "../components/clientes-view";
import { EstadoDaApi } from "../components/estado-da-api";
import { fetchClient, fetchClientOwners, fetchClients } from "../lib/api";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; active?: string; cliente?: string }>;
}) {
  const { q, active, cliente } = await searchParams;
  const filtros = { q: q || undefined, active: active === "true" || active === "false" ? active : undefined };

  const [lista, responsaveis, ficha] = await Promise.all([
    fetchClients(filtros),
    fetchClientOwners(),
    cliente ? fetchClient(cliente) : Promise.resolve(null),
  ]);
  if (!lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Clientes" />;

  return (
    <ClientesView
      itens={lista.dados.items}
      filtros={filtros}
      responsaveis={responsaveis.ok ? responsaveis.dados.items : []}
      ficha={ficha?.ok ? ficha.dados : null}
      fichaNaoEncontrada={ficha !== null && !ficha.ok}
    />
  );
}
