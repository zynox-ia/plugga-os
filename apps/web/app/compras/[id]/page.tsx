import { notFound } from "next/navigation";

import { ComprasPedidoDetalheView } from "../../components/compras-pedido-detalhe-view";
import { fetchPedidoDeCompra } from "../../lib/api";
import { EMPRESA_PADRAO, isEmpresaId } from "../../lib/organizacao";

export default async function PedidoDeCompraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ empresa?: string }>;
}) {
  const [{ id }, { empresa }] = await Promise.all([params, searchParams]);
  const ativa = isEmpresaId(empresa) ? empresa : EMPRESA_PADRAO;
  const pedido = await fetchPedidoDeCompra(id, ativa);

  if (!pedido) {
    notFound();
  }

  return <ComprasPedidoDetalheView pedido={pedido} empresa={ativa} isLive />;
}
