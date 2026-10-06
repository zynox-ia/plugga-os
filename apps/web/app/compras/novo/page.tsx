import { ComprasNovoPedidoView } from "../../components/compras-novo-pedido-view";
import { EstadoDaApi } from "../../components/estado-da-api";
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

  // Sem obras e fornecedores o formulário não tem como ser preenchido: mostrar
  // o erro real, em vez de um formulário que parece vazio por escolha.
  const voltar = { href: "/compras", rotulo: "Voltar à lista" };
  if (!obras.ok) return <EstadoDaApi erro={obras.erro} eyebrow="Compras" voltar={voltar} />;
  if (!fornecedores.ok) return <EstadoDaApi erro={fornecedores.erro} eyebrow="Compras" voltar={voltar} />;

  return (
    <ComprasNovoPedidoView
      empresa={ativa}
      obras={obras.dados.items}
      fornecedores={fornecedores.dados.items}
      responsavelPadrao={responsavel ?? ""}
    />
  );
}
