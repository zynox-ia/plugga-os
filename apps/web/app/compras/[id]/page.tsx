import { notFound } from "next/navigation";

import { ComprasPedidoDetalheView } from "../../components/compras-pedido-detalhe-view";
import { EstadoDaApi } from "../../components/estado-da-api";
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
  const resultado = await fetchPedidoDeCompra(id, ativa);

  if (!resultado.ok) {
    if (resultado.erro.tipo === "naoEncontrado") notFound();
    return <EstadoDaApi erro={resultado.erro} eyebrow="Compras" voltar={{ href: "/compras", rotulo: "Voltar à lista" }} />;
  }

  return <ComprasPedidoDetalheView pedido={resultado.dados} empresa={ativa} isLive />;
}
