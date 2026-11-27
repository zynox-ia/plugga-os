import { EstadoDaApi } from "../../components/estado-da-api";
import { ComprasView } from "../../components/compras/compras-view";
import { fetchOpcoesDeCompra, fetchPedidoDeCompra, fetchPedidosDeCompra, fetchQuadroDeCompras } from "../../lib/api";
import { redirect } from "next/navigation";

import { consultaDaApi, hojeEmManaus, hrefDeCompras, lerFiltrosDeCompras, temFiltroSoDaLista } from "../../lib/compras";
import { ehUuid } from "../../lib/estoque";
import { exigirPagina } from "../../lib/exigir-pagina";
import { falhaDaFicha } from "../../lib/ficha-do-pedido";
import { podeCriarPedido } from "../../lib/papel-em-compras";

export default async function ComprasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/suprimentos/compras");
  const parametros = await searchParams;
  const filtros = lerFiltrosDeCompras(parametros);
  // No quadro não há Responsável nem Período: um link antigo com eles vai para o endereço limpo.
  if (temFiltroSoDaLista(parametros)) redirect(hrefDeCompras(filtros, parametros.pedido));
  const consulta = consultaDaApi(filtros, hojeEmManaus());

  const [quadro, lista, opcoes, ficha] = await Promise.all([
    filtros.visao === "quadro" ? fetchQuadroDeCompras(consulta) : Promise.resolve(null),
    filtros.visao === "lista"
      ? fetchPedidosDeCompra({ ...consulta, busca: filtros.busca, situacao: filtros.situacao === "todos" ? undefined : filtros.situacao })
      : filtros.cancelados
        ? fetchPedidosDeCompra({ ...consulta, situacao: "cancelado" })
        : Promise.resolve(null),
    fetchOpcoesDeCompra(),
    ehUuid(parametros.pedido) ? fetchPedidoDeCompra(parametros.pedido) : Promise.resolve(null),
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
      falhaDaFicha={falhaDaFicha(parametros.pedido, ficha)}
      podeCriar={podeCriarPedido(sessao.acesso)}
    />
  );
}
