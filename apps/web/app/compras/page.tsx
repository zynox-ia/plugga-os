import { ComprasView } from "../components/compras-view";
import { EstadoDaApi } from "../components/estado-da-api";
import { fetchPedidosDeCompra } from "../lib/api";
import { resolverEstado } from "../lib/estado-da-api";
import { FALLBACK_PEDIDOS } from "../lib/mock/compras";
import { EMPRESA_PADRAO, isEmpresaId } from "../lib/organizacao";

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const { empresa } = await searchParams;
  const ativa = isEmpresaId(empresa) ? empresa : EMPRESA_PADRAO;
  const estado = resolverEstado(await fetchPedidosDeCompra(ativa), (resposta) => resposta.items, FALLBACK_PEDIDOS);
  if (estado.estado === "erro") return <EstadoDaApi erro={estado.erro} eyebrow="Compras" />;

  return <ComprasView items={estado.dados} isLive={estado.estado === "ok"} empresa={ativa} />;
}
