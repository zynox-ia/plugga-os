import { ComprasNovoPedidoView } from "../../components/compras-novo-pedido-view";
import { fetchFornecedores, fetchObrasDeCompra } from "../../lib/api";
import { EMPRESA_PADRAO, isEmpresaId } from "../../lib/organizacao";

export default async function NovoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; responsavel?: string }>;
}) {
  const { empresa, responsavel } = await searchParams;
  const ativa = isEmpresaId(empresa) ? empresa : EMPRESA_PADRAO;
  const [obras, fornecedores] = await Promise.all([
    fetchObrasDeCompra(ativa),
    fetchFornecedores(ativa),
  ]);

  return (
    <ComprasNovoPedidoView
      empresa={ativa}
      obras={obras?.items ?? []}
      fornecedores={fornecedores?.items ?? []}
      responsavelPadrao={responsavel ?? ""}
    />
  );
}
