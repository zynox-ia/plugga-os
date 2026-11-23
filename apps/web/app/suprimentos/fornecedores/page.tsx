import { EstadoDaApi } from "../../components/estado-da-api";
import { FornecedoresView } from "../../components/fornecedores/fornecedores-view";
import { fetchFornecedor, fetchFornecedores } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";
import { lerFiltrosDeFornecedores } from "../../lib/fornecedores";

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; situacao?: string; categoria?: string; fornecedor?: string }>;
}) {
  await exigirPagina("/suprimentos/fornecedores");
  const parametros = await searchParams;
  const filtros = lerFiltrosDeFornecedores(parametros);

  const [lista, ficha] = await Promise.all([
    fetchFornecedores(filtros),
    parametros.fornecedor ? fetchFornecedor(parametros.fornecedor) : Promise.resolve(null),
  ]);
  if (!lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Fornecedores" />;

  return (
    <FornecedoresView
      itens={lista.dados.itens}
      contagem={lista.dados.contagem}
      filtros={filtros}
      ficha={ficha?.ok ? ficha.dados : null}
      fichaNaoEncontrada={ficha !== null && !ficha.ok}
    />
  );
}
