"use client";

import { PRAZO_DA_ETAPA_DE_COMPRA_EM_DIAS_UTEIS, type EtapaDeCompra, type PedidoDeCompraResumo, type QuadroDeComprasResposta } from "@plugga/shared";
import { Ban, Building2, CalendarDays, CheckCircle2, Clock, FileText, HardHat, Kanban, Plus, UserRound } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { COR_DA_EMPRESA, COR_DA_ETAPA, ROTULO_CURTO_DA_ETAPA, ROTULO_DA_EMPRESA, diaCurto, numeroDoPedido, textoDoDestino, textoDoPrazo, valorCurto, valorEmReais } from "../../lib/compras";
import { calcularLayoutKanban, ESPACO_COLUNAS_KANBAN } from "../../lib/layout-kanban";
import estilosCartao from "../pipelines/cartao-de-negocio.module.css";
import { Avatar } from "../pipelines/icones";
import styles from "./compras.module.css";

type Coluna = QuadroDeComprasResposta["colunas"][number];
type ColunaDoQuadro = Omit<Coluna, "etapa"> & { etapa: EtapaDeCompra | "cancelado" };

export function EmpresaDoPedido({ empresa, curta = false }: { empresa: PedidoDeCompraResumo["empresa"]; curta?: boolean }) {
  const nome = ROTULO_DA_EMPRESA[empresa];
  return <span className={styles.empresa} title={`Empresa: ${nome}`}>
    <span className={styles.empresaPonto} style={{ background: COR_DA_EMPRESA[empresa] }} aria-hidden="true" />
    {curta ? nome.split(" ")[0] : nome}
  </span>;
}

/** Selo do prazo da etapa atual. A cor nunca fala sozinha: o texto diz a situação. */
export function SeloDoPrazo({ pedido }: { pedido: Pick<PedidoDeCompraResumo, "situacao" | "situacaoDoPrazo" | "prazoDaEtapaEm"> }) {
  const tom = pedido.situacao === "cancelado" ? styles.prazoCancelado
    : pedido.situacao === "concluido" || pedido.situacaoDoPrazo === "no_prazo" ? styles.prazoOk
    : pedido.situacaoDoPrazo === "vence_hoje" ? styles.prazoHoje : estilosCartao.parado;
  const Icone = pedido.situacao === "cancelado" ? Ban : pedido.situacao === "concluido" ? CheckCircle2 : Clock;
  return <span className={`${estilosCartao.dias} ${tom}`}><Icone size={12} aria-hidden="true" />{textoDoPrazo(pedido)}</span>;
}

const ICONE_DO_DESTINO = { obra: HardHat, cliente: UserRound, interno: Building2 } as const;

function CartaoDePedido({ pedido, aoAbrir }: { pedido: PedidoDeCompraResumo; aoAbrir: (id: string) => void }) {
  const numero = numeroDoPedido(pedido.numero);
  const Destino = ICONE_DO_DESTINO[pedido.destino.tipo];
  const destino = textoDoDestino(pedido.destino);
  const responsavel = pedido.responsavel?.nome ?? "Sem responsável";
  return <article className={`cartao-negocio ${estilosCartao.cartao}${pedido.situacao === "cancelado" ? ` ${styles.cartaoCancelado}` : ""}`} aria-label={`Pedido ${numero}: ${pedido.titulo}`}>
    <header className={estilosCartao.cabecalho}>
      <span className={estilosCartao.codigo}><FileText size={14} aria-hidden="true" /><span>{numero}</span></span>
      <EmpresaDoPedido empresa={pedido.empresa} curta />
    </header>
    <div className={estilosCartao.topo}><div className={estilosCartao.identidade}>
      <h4 className={estilosCartao.titulo}><button type="button" onClick={() => aoAbrir(pedido.id)}>{pedido.titulo}</button></h4>
      <p className={estilosCartao.cliente} title={destino}><Destino size={12} aria-hidden="true" /><span>{destino}</span></p>
    </div></div>
    <div className={estilosCartao.metadados}>
      <span className={estilosCartao.chegada} title={`Entrega desejada em ${pedido.prazoEntregaDesejado.split("-").reverse().join("/")}`}>
        <span className={estilosCartao.calendario}><CalendarDays size={14} aria-hidden="true" /></span>
        <time dateTime={pedido.prazoEntregaDesejado}>Entrega {diaCurto(pedido.prazoEntregaDesejado)}</time>
      </span>
      <span className={`${estilosCartao.status} ${styles.valor}`} data-status="open">{valorEmReais(pedido.valor, true) ?? "Sem valor"}</span>
    </div>
    <footer className={estilosCartao.rodape}>
      <div className={estilosCartao.responsavel} title={`Responsável: ${responsavel}`}><Avatar id={pedido.responsavel?.id} nome={responsavel} tamanho="pequeno" /><span>{responsavel}</span></div>
      <SeloDoPrazo pedido={pedido} />
    </footer>
  </article>;
}

/**
 * Quadro com as 7 etapas (e a de cancelados, quando pedida). Sem arrastar: a
 * etapa avança pela ação da ficha, porque cada passagem exige um dado.
 */
export function QuadroDeCompras({ colunas, cancelados, colunasRef, aoAbrir, aoNovo }: {
  colunas: Coluna[];
  cancelados: PedidoDeCompraResumo[] | null;
  colunasRef: RefObject<HTMLDivElement | null>;
  aoAbrir: (id: string) => void;
  /** Ausente para quem não cria pedido (o Financeiro). */
  aoNovo?: () => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const todas: ColunaDoQuadro[] = cancelados
    ? [...colunas, { etapa: "cancelado", quantidade: cancelados.length, valorTotal: String(cancelados.reduce((s, p) => s + Number(p.valor ?? 0), 0)), vencidos: 0, vencemHoje: 0, pedidos: cancelados }]
    : colunas;
  const [layout, setLayout] = useState<ReturnType<typeof calcularLayoutKanban> | null>(null);

  useLayoutEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    const atualizar = () => setLayout(calcularLayoutKanban(elemento.clientWidth, todas.length));
    atualizar();
    const observer = new ResizeObserver(atualizar);
    observer.observe(elemento);
    return () => observer.disconnect();
  }, [todas.length]);

  return <div className="quadro-area-colunas" ref={areaRef}>
    <div className="quadro-colunas" ref={colunasRef} tabIndex={0} role="region" aria-label="Etapas de compras"
      style={{ "--espaco-colunas": `${ESPACO_COLUNAS_KANBAN}px`, ...(layout ? { "--largura-coluna": `${layout.larguraColuna}px`, "--largura-quadro": `${layout.larguraQuadro}px` } : {}) } as CSSProperties}>
      {todas.map((coluna) => {
        const ehCancelado = coluna.etapa === "cancelado";
        const nome = ehCancelado ? "Cancelados" : ROTULO_CURTO_DA_ETAPA[coluna.etapa as EtapaDeCompra];
        const cor = ehCancelado ? "#B42332" : COR_DA_ETAPA[coluna.etapa as EtapaDeCompra];
        const prazo = !ehCancelado && coluna.etapa !== "concluido" ? PRAZO_DA_ETAPA_DE_COMPRA_EM_DIAS_UTEIS[coluna.etapa as Exclude<EtapaDeCompra, "concluido">] : null;
        return <section key={coluna.etapa} className="coluna-etapa" aria-labelledby={`etapa-${coluna.etapa}`} style={{ "--cor": cor } as CSSProperties}>
          <header className="coluna-topo">
            <div className="coluna-titulo"><Kanban size={16} className="coluna-titulo-icone" style={{ color: cor }} aria-hidden="true" /><h3 id={`etapa-${coluna.etapa}`}>{nome}</h3></div>
            <div className={styles.topoDireita}>
              <span className="coluna-quantidade" aria-label={`${coluna.quantidade} pedidos`}>{String(coluna.quantidade).padStart(2, "0")}</span>
              {coluna.etapa === "pedido_gerado" && aoNovo ? <button type="button" className="coluna-novo" aria-label="Novo pedido" title="Novo pedido" onClick={aoNovo}><Plus size={14} aria-hidden="true" /></button> : null}
            </div>
          </header>
          <div className="coluna-meta">
            <span className="coluna-soma">{valorCurto(coluna.valorTotal)}</span>
            {prazo ? <span className="coluna-parado" title={`Prazo desta etapa: ${prazo} dias úteis`}><Clock size={11} aria-hidden="true" />{prazo}d úteis</span>
              : coluna.etapa === "concluido" ? <span className={`coluna-parado ${styles.notaColuna}`} title="Concluídos nos últimos 30 dias, sem filtro de período">30 dias</span> : null}
          </div>
          <div className="coluna-corpo" role="region" aria-label={`Pedidos em ${nome}`} tabIndex={0}>
            {coluna.pedidos.length > 0
              ? coluna.pedidos.map((pedido) => <div key={pedido.id} className={`${styles.cartaoQuadro} plg-lift`}><CartaoDePedido pedido={pedido} aoAbrir={aoAbrir} /></div>)
              : <p className="coluna-vazia">{ehCancelado ? "Nenhum pedido cancelado" : "Sem pedidos nesta etapa"}</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
