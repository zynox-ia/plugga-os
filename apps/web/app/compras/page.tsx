import { ComprasView } from "../components/compras-view";
import { fetchPedidosDeCompra } from "../lib/api";
import { FALLBACK_PEDIDOS } from "../lib/mock/compras";
import { EMPRESA_PADRAO, isEmpresaId } from "../lib/organizacao";

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const { empresa } = await searchParams;
  const ativa = isEmpresaId(empresa) ? empresa : EMPRESA_PADRAO;
  const resposta = await fetchPedidosDeCompra(ativa);

  return (
    <ComprasView
      items={resposta?.items ?? FALLBACK_PEDIDOS}
      isLive={resposta !== null}
      empresa={ativa}
    />
  );
}
