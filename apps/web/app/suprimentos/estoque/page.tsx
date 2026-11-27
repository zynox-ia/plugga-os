import { EstadoDaApi } from "../../components/estado-da-api";
import { EstoqueView } from "../../components/estoque/estoque-view";
import { fetchItemDeEstoque, fetchItensDeEstoque, fetchMovimentacoesDeEstoque } from "../../lib/api";
import { hojeEmManaus } from "../../lib/compras";
import { consultaDeItens, consultaDeMovimentacoes, ehUuid, lerFiltrosDeEstoque } from "../../lib/estoque";
import { acessoDoEstoque } from "../../lib/estoque-acesso";
import { exigirPagina } from "../../lib/exigir-pagina";

export default async function EstoquePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/suprimentos/estoque");
  const parametros = await searchParams;
  const filtros = lerFiltrosDeEstoque(parametros);
  const movimentos = filtros.visao === "movimentacoes";
  // Os menus de item (registrar, filtro de Item) usam todos os itens ativos; a visão usa a consulta filtrada.
  const semFiltroDeItens = !filtros.busca && !filtros.empresa && !filtros.categoria && !filtros.saldo;

  const [todos, filtrados, movs, ficha] = await Promise.all([
    fetchItensDeEstoque(),
    movimentos || semFiltroDeItens ? Promise.resolve(null) : fetchItensDeEstoque(consultaDeItens(filtros)),
    movimentos ? fetchMovimentacoesDeEstoque(consultaDeMovimentacoes(filtros)) : Promise.resolve(null),
    ehUuid(parametros.item) ? fetchItemDeEstoque(parametros.item) : Promise.resolve(null),
  ]);
  if (!todos.ok) return <EstadoDaApi erro={todos.erro} eyebrow="Estoque" />;
  if (filtrados && !filtrados.ok) return <EstadoDaApi erro={filtrados.erro} eyebrow="Estoque" />;
  if (movs && !movs.ok) return <EstadoDaApi erro={movs.erro} eyebrow="Estoque" />;
  const saldo = filtrados?.ok ? filtrados.dados : todos.dados;

  return (
    <EstoqueView
      filtros={filtros}
      itens={saldo.itens}
      todosOsItens={todos.dados.itens}
      movimentacoes={movs?.ok ? movs.dados : null}
      ficha={ficha?.ok ? ficha.dados : null}
      fichaNaoEncontrada={Boolean(parametros.item) && !(ficha?.ok)}
      hoje={hojeEmManaus()}
      acesso={acessoDoEstoque(sessao.acesso)}
    />
  );
}
