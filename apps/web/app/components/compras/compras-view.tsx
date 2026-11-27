"use client";

import type { OpcoesDeCompraResposta, PedidoDeCompra, PedidoDeCompraResumo, QuadroDeComprasResposta } from "@plugga/shared";
import { Ban, Building2, CalendarDays, List, RotateCw, ShoppingCart, SquareKanban, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactElement } from "react";

import { hrefDeCompras, numeroDoPedido, ROTULO_DA_EMPRESA, periodosDeCompra, ROTULO_DO_PERIODO, textoDoDestino, textosDaBusca, type FiltrosDeCompras } from "../../lib/compras";
import type { FalhaDaFicha } from "../../lib/ficha-do-pedido";
import { BarraFixa, CampoDaFolha, classeDaPaginaComBarra, classeDosControlesDaBarra } from "../barra-fixa";
import estilosClientes from "../clientes/tela-clientes.module.css";
import { BarraRolagemMinimalista } from "../pipelines/quadro-do-pipeline";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus, IconSearch } from "../ui";
import styles from "./compras.module.css";
import { FichaDoPedido } from "./ficha-do-pedido";
import { ListaDeCompras } from "./lista-de-compras";
import { NovoPedido } from "./novo-pedido";
import { QuadroDeCompras } from "./quadro-de-compras";

type Coluna = QuadroDeComprasResposta["colunas"][number];

/** No quadro a busca é local (a API do quadro não busca); na lista ela vai para a API. */
function casaComBusca(p: PedidoDeCompraResumo, busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  return `${numeroDoPedido(p.numero)} ${p.numero} ${p.titulo} ${textoDoDestino(p.destino)}`.toLowerCase().includes(q);
}

/**
 * Compras (PLU-328): um quadro com as 7 etapas para Plugga e Waze, com a
 * empresa como filtro, e a lista de todos os pedidos. Filtros e ficha vão no
 * endereço; a etapa só avança pela ação da ficha.
 */
export function ComprasView({ filtros, colunas, pedidos, total, opcoes, ficha, falhaDaFicha, podeCriar }: {
  filtros: FiltrosDeCompras;
  /** Só quem opera Compras cria pedido; o Financeiro abre a tela para aprovar e pagar. */
  podeCriar: boolean;
  colunas: Coluna[];
  pedidos: PedidoDeCompraResumo[];
  total: number;
  opcoes: OpcoesDeCompraResposta;
  ficha: PedidoDeCompra | null;
  falhaDaFicha: FalhaDaFicha | null;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [criando, setCriando] = useState(false);
  const colunasRef = useRef<HTMLDivElement>(null);
  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);

  const quadro = filtros.visao === "quadro";
  const ir = (parcial: Partial<FiltrosDeCompras>, pedido: string | null = null) => router.push(hrefDeCompras({ ...filtros, ...parcial }, pedido), { scroll: false });
  const abrir = (id: string) => ir({}, id);
  const fecharFicha = () => ir({});
  const filtrado = Boolean(filtros.busca || filtros.empresa || filtros.responsavel || filtros.destino || filtros.periodo);
  const limpar = () => { setBusca(""); router.push(hrefDeCompras({ visao: filtros.visao, cancelados: filtros.cancelados, situacao: filtros.situacao }), { scroll: false }); };

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    const termo = busca.trim() || undefined;
    if (quadro) { router.replace(hrefDeCompras({ ...filtros, busca: termo }), { scroll: false }); return; }
    ir({ busca: termo });
  }

  // No quadro a busca filtra enquanto se digita.
  const termo = quadro ? busca : "";
  const colunasVisiveis = colunas.map((c) => {
    const visiveis = c.pedidos.filter((p) => casaComBusca(p, termo));
    return visiveis.length === c.pedidos.length ? c : { ...c, pedidos: visiveis, quantidade: visiveis.length, valorTotal: String(visiveis.reduce((s, p) => s + Number(p.valor ?? 0), 0)) };
  });
  const canceladosVisiveis = filtros.cancelados ? pedidos.filter((p) => casaComBusca(p, termo)) : null;
  const semPedidos = quadro && !filtrado && colunas.every((c) => c.quantidade === 0);

  const textoDaBusca = textosDaBusca(filtros.visao);
  const campoDeBusca = (sufixo: string) => <form className="equipe-busca" onSubmit={buscar} role="search" aria-label="Buscar pedidos">
    <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar pedidos"><IconSearch className="equipe-busca-icon" /></button>
    <input id={`compras-busca-${sufixo}`} className="equipe-busca-input" type="search" maxLength={150} aria-label={textoDaBusca.rotulo} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={textoDaBusca.dica} />
  </form>;
  const filtroDeEmpresa = <FiltroComBusca key="empresa" label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"} onChange={(v) => ir({ empresa: v === "todas" ? undefined : (v as FiltrosDeCompras["empresa"]) })}
    options={[{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, ...(["plugga", "waze"] as const).map((e) => ({ value: e, label: ROTULO_DA_EMPRESA[e], icon: <PontoDaEmpresa empresa={e} /> }))]} />;
  // Responsável e Período só na lista (pedido do André); no quadro ficam Empresa, Cancelados e a busca.
  const filtrosDaLista: [string, ReactElement][] = [
    ["Empresa", filtroDeEmpresa],
    ["Responsável", <FiltroComBusca key="responsavel" label="Responsável" icon={<UserRound />} semFiltro="todos" value={filtros.responsavel ?? "todos"} onChange={(v) => ir({ responsavel: v === "todos" ? undefined : v })}
      options={[{ value: "todos", label: "Todos os responsáveis", icon: <UserRound /> }, ...opcoes.pessoas.map((p) => ({ value: p.id, label: p.nome, icon: <UserRound /> }))]} />],
    ["Período", <FiltroComBusca key="periodo" label="Período" icon={<CalendarDays />} semFiltro="qualquer" value={filtros.periodo ?? "qualquer"} onChange={(v) => ir({ periodo: v === "qualquer" ? undefined : (v as FiltrosDeCompras["periodo"]) })}
      options={[{ value: "qualquer", label: "Qualquer período", icon: <CalendarDays /> }, ...periodosDeCompra.map((p) => ({ value: p, label: ROTULO_DO_PERIODO[p], icon: <CalendarDays /> }))]} />],
  ];
  const visoes = <nav className={estilosPipelines.visoes} aria-label="Visualização dos pedidos">
    <Link href={hrefDeCompras({ ...filtros, visao: "quadro" })} aria-current={quadro ? "page" : undefined} scroll={false}><SquareKanban size={15} aria-hidden="true" /><span>Quadro</span></Link>
    <Link href={hrefDeCompras({ ...filtros, visao: "lista" })} aria-current={!quadro ? "page" : undefined} scroll={false}><List size={15} aria-hidden="true" /><span>Todos os pedidos</span></Link>
  </nav>;
  const novoPedido = podeCriar ? <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Novo pedido</Button> : null;

  return (
    <div className={`pagina-pipelines ${estilosPipelines.pagina} ${styles.tabelas} ${quadro ? "" : `${classeDaPaginaComBarra} ${styles.paginaDaLista}`}`}>
      <header className={estilosPipelines.cabecalho}>
        <div className={estilosPipelines.tituloGrupo}>
          <h1 className={estilosPipelines.titulo}>Compras</h1>
          <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Acompanhe os pedidos de compra, das cotações ao recebimento.</h2>
        </div>
        <div className={estilosPipelines.acoes}>
          {novoPedido}
        </div>
      </header>

      {quadro ? <div className={`${estilosPipelines.navegacao} ${classeDosControlesDaBarra}`}>
        {visoes}
        <BarraRolagemMinimalista containerRef={colunasRef} className={estilosPipelines.rolagem} />
        <div className={`${estilosPipelines.navegacaoDireita} ${styles.filtros}`} role="group" aria-label="Filtros de pedidos">
          <div className={styles.buscaDoQuadro}>{campoDeBusca("quadro")}</div>
          <div className={styles.filtro}>{filtroDeEmpresa}</div>
          <Button variant="secondary" className={styles.alternar} aria-pressed={filtros.cancelados} icon={<Ban size={16} />} onClick={() => ir({ cancelados: !filtros.cancelados })}>
            Cancelados{canceladosVisiveis ? <span className={styles.conta}> {String(canceladosVisiveis.length).padStart(2, "0")}</span> : null}
          </Button>
          {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
        </div>
      </div> : <BarraFixa rotulo="Visualização, busca e filtros dos pedidos"
        abas={visoes}
        busca={campoDeBusca("barra")}
        filtros={<div className={`${styles.filtros} ${styles.filtrosDaBarra}`} role="group" aria-label="Filtros de pedidos">
          {filtrosDaLista.map(([rotulo, filtro]) => <div key={rotulo} className={styles.filtro}>{filtro}</div>)}
          {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
        </div>}
        acoesQuandoPresa={podeCriar ? <Button iconOnly icon={<IconPlus />} aria-label="Novo pedido" title="Novo pedido" onClick={() => setCriando(true)} /> : undefined}
        movel={{
          visao: { opcoes: [{ value: "quadro", label: "Quadro", icon: <SquareKanban /> }, { value: "lista", label: "Todos os pedidos", icon: <List /> }], valor: filtros.visao, aoMudar: (v) => ir({ visao: v as FiltrosDeCompras["visao"] }) },
          filtrosAtivos: [filtros.busca, filtros.empresa, filtros.responsavel, filtros.periodo].filter(Boolean).length,
          aoLimpar: filtrado ? limpar : undefined,
          rotuloDoResultado: `Ver ${pedidos.length} ${pedidos.length === 1 ? "pedido" : "pedidos"}`,
          folha: <>{campoDeBusca("folha")}{filtrosDaLista.map(([rotulo, filtro]) => <CampoDaFolha key={rotulo} rotulo={rotulo}>{filtro}</CampoDaFolha>)}</>,
        }} />}

      {falhaDaFicha?.tipo === "nao_encontrada" ? <p className="aviso aviso--alerta" role="status">{falhaDaFicha.texto}</p> : null}
      {falhaDaFicha?.tipo === "consulta" ? <div className={`aviso aviso--erro ${styles.falhaDaFicha}`} role="alert">
        <span>{falhaDaFicha.texto}</span>
        <Button variant="secondary" size="sm" icon={<RotateCw size={14} />} onClick={() => router.refresh()}>Tentar de novo</Button>
      </div> : null}

      {quadro ? (
        <div className="quadro-pipeline" style={{ "--cor": "#7C5CFF" } as CSSProperties}>
          <section className="painel-quadro" aria-label="Pedidos de compra">
            <div className={styles.areaQuadro}>
              {semPedidos ? <div className={styles.vazioQuadro} role="status"><div className="lista-negocios-vazia">
                <div className="lista-negocios-vazia-icone" aria-hidden="true"><ShoppingCart size={22} /></div>
                <h3 className="lista-negocios-vazia-titulo">Nenhum pedido de compra ainda</h3>
                <p className="lista-negocios-vazia-desc">Quando alguém pedir material ou serviço, o pedido entra em “Pedido gerado” e segue pelas etapas daqui.</p>
                {podeCriar ? <Button size="sm" icon={<IconPlus />} onClick={() => setCriando(true)}>Abrir o primeiro pedido</Button> : null}
              </div></div> : null}
              <QuadroDeCompras colunas={colunasVisiveis} cancelados={canceladosVisiveis} colunasRef={colunasRef} aoAbrir={abrir} aoNovo={podeCriar ? () => setCriando(true) : undefined} />
            </div>
          </section>
        </div>
      ) : (
        <ListaDeCompras pedidos={pedidos} total={total} situacao={filtros.situacao} filtrado={filtrado} aoMudarSituacao={(situacao) => ir({ situacao })} aoAbrir={abrir} aoLimpar={limpar} />
      )}

      {criando && podeCriar ? <NovoPedido opcoes={opcoes} aoCancelar={() => setCriando(false)} aoSalvar={(pedido) => { setCriando(false); ir({}, pedido.id); router.refresh(); }} /> : null}
      {ficha ? <FichaDoPedido key={ficha.id} pedido={ficha} opcoes={opcoes} aoFechar={fecharFicha} aoAtualizar={() => router.refresh()} /> : null}
    </div>
  );
}
