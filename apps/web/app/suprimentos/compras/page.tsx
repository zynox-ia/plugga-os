import { EstadoDaApi } from "../../components/estado-da-api";
import { ComprasView } from "../../components/compras/compras-view";
import { fetchOpcoesDeCompra, fetchPedidoDeCompra, fetchPedidosDeCompra, fetchQuadroDeCompras } from "../../lib/api";
import { consultaDaApi, hojeEmManaus, lerFiltrosDeCompras } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { podeCriarPedido } from "../../lib/papel-em-compras";

export default async function ComprasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/suprimentos/compras");
  const parametros = await searchParams;
  const filtros = lerFiltrosDeCompras(parametros);
  const consulta = consultaDaApi(filtros, hojeEmManaus());

  const [quadro, lista, opcoes, ficha] = await Promise.all([
    filtros.visao === "quadro" ? fetchQuadroDeCompras(consulta) : Promise.resolve(null),
    filtros.visao === "lista"
      ? fetchPedidosDeCompra({ ...consulta, busca: filtros.busca, situacao: filtros.situacao === "todos" ? undefined : filtros.situacao })
      : filtros.cancelados
        ? fetchPedidosDeCompra({ ...consulta, situacao: "cancelado" })
        : Promise.resolve(null),
    fetchOpcoesDeCompra(),
    parametros.pedido ? fetchPedidoDeCompra(parametros.pedido) : Promise.resolve(null),
  ]);
  if (quadro && !quadro.ok) return <EstadoDaApi erro={quadro.erro} eyebrow="Compras" />;
  if (lista && !lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Compras" />;
  if (!opcoes.ok) return <EstadoDaApi erro={opcoes.erro} eyebrow="Compras" />;

  return (
    <ComprasView
      filtros={filtros}
      colunas={quadro?.ok ? quadro.dados.colunas : []}
      pedidos={lista?.ok ? lista.dados.itens : []}
      total={lista?.ok ? lista.dados.total : 0}
      opcoes={opcoes.dados}
      ficha={ficha?.ok ? ficha.dados : null}
      fichaNaoEncontrada={ficha !== null && !ficha.ok}
      podeCriar={podeCriarPedido(sessao.acesso)}
    />
  );
}
