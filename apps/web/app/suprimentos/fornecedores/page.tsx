import { EstadoDaApi } from "../../components/estado-da-api";
import { FornecedoresView } from "../../components/fornecedores/fornecedores-view";
import { fetchCotacoesDoFornecedor, fetchDesempenhoDoFornecedor, fetchFornecedor, fetchFornecedores } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";
import { lerFiltrosDeFornecedores } from "../../lib/fornecedores";
import { podeVerCompras } from "../../lib/papel-em-compras";

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; situacao?: string; categoria?: string; fornecedor?: string }>;
}) {
  const sessao = await exigirPagina("/suprimentos/fornecedores");
  const parametros = await searchParams;
  const filtros = lerFiltrosDeFornecedores(parametros);
  const id = parametros.fornecedor;

  // A ficha rica (PLU-334) chega inteira: cadastro, desempenho e histórico de cotações.
  const [lista, ficha, desempenho, cotacoes] = await Promise.all([
    fetchFornecedores(filtros),
    id ? fetchFornecedor(id) : Promise.resolve(null),
    id ? fetchDesempenhoDoFornecedor(id) : Promise.resolve(null),
    id ? fetchCotacoesDoFornecedor(id) : Promise.resolve(null),
  ]);
  if (!lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Fornecedores" />;

  return (
    <FornecedoresView
      itens={lista.dados.itens}
      contagem={lista.dados.contagem}
      filtros={filtros}
      ficha={ficha?.ok ? { fornecedor: ficha.dados, desempenho: desempenho?.ok ? desempenho.dados : null, cotacoes: cotacoes?.ok ? cotacoes.dados : null } : null}
      fichaNaoEncontrada={ficha !== null && !ficha.ok}
      podeAbrirCompras={podeVerCompras(sessao.acesso)}
    />
  );
}
