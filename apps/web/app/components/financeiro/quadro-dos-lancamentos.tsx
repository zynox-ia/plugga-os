"use client";

import type { ColunaDoQuadroFinanceiro, LancamentoResumo, QuadroFinanceiro } from "@plugga/shared";
import { CalendarDays, Kanban } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { valorCurto, valorEmReais } from "../../lib/compras";
import { prazoDoLancamento, resumoDoLancamento, seloDaEtapa } from "../../lib/financeiro";
import { calcularLayoutKanban, ESPACO_COLUNAS_KANBAN } from "../../lib/layout-kanban";
import estilosCartao from "../pipelines/cartao-de-negocio.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import styles from "./lancamentos.module.css";
import { SetaDoTipo } from "./partes";

/** As 4 colunas comuns aos dois tipos; o card mostra a etapa própria do tipo. */
const COLUNAS: Record<ColunaDoQuadroFinanceiro, { nome: string; nota: string; vazio: string }> = {
  preparo: { nome: "Em preparo", nota: "Saídas para aprovar · entradas antes do envio", vazio: "Nada em preparo" },
  aberto: { nome: "A pagar ou a receber", nota: "Aprovadas ou enviadas, aguardando o dinheiro", vazio: "Nada aguardando" },
  liquidado: { nome: "Pago ou recebido", nota: "Falta conciliar com o extrato", vazio: "Nada a conciliar" },
  conciliado: { nome: "Conciliado", nota: "Neste mês", vazio: "Nada conciliado neste mês" },
};
/** O azul da marca, pelo token: segue o tema. */
const COR = "var(--ui-primary)";

function CartaoDoLancamento({ l, aoAbrir }: { l: LancamentoResumo; aoAbrir: (id: string) => void }) {
  const prazo = prazoDoLancamento(l);
  const selo = seloDaEtapa(l);
  return <article className={`cartao-negocio ${estilosCartao.cartao}`} aria-label={`${l.codigo}: ${l.favorecido.nome}`}>
    <header className={estilosCartao.cabecalho}>
      <span className={estilosCartao.codigo}><SetaDoTipo tipo={l.tipo} tamanho={14} /><span>{l.codigo}</span></span>
      <EmpresaComPonto empresa={l.empresa} curto className={styles.empresaQuadro} />
    </header>
    <div className={estilosCartao.topo}><div className={estilosCartao.identidade}>
      <h4 className={estilosCartao.titulo}><button type="button" onClick={() => aoAbrir(l.id)}>{l.favorecido.nome}</button></h4>
      <p className={estilosCartao.cliente} title={resumoDoLancamento(l)}><span>{resumoDoLancamento(l)}</span></p>
    </div></div>
    <p className={styles.valorQuadro}>{valorEmReais(l.valor)}</p>
    <footer className={`${estilosCartao.rodape} ${styles.rodapeQuadro}`}>
      {/* A coluna estreita mostra o que sinaliza: o prazo relativo em aberto, o dia depois de liquidado. */}
      <span className={`${styles.prazoQuadro} ${prazo.tom ? styles[prazo.tom] : ""}`} title={prazo.relativo ? `${prazo.data} · ${prazo.relativo}` : prazo.data}>
        <CalendarDays size={12} aria-hidden="true" /><span>{l.liquidadoEm || l.cancelado || !prazo.relativo ? prazo.data : prazo.relativo}</span>
      </span>
      <span className="ui-badge ui-tone--neutral" title={selo.completo}>{selo.curto}</span>
    </footer>
  </article>;
}

/** Quadro com as 4 colunas, sem arrastar: a etapa avança pela ação da ficha. */
export function QuadroDosLancamentos({ colunas, colunasRef, aoAbrir }: {
  colunas: QuadroFinanceiro["colunas"];
  colunasRef: RefObject<HTMLDivElement | null>;
  aoAbrir: (id: string) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ReturnType<typeof calcularLayoutKanban> | null>(null);

  useLayoutEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    const atualizar = () => setLayout(calcularLayoutKanban(elemento.clientWidth, colunas.length));
    atualizar();
    const observer = new ResizeObserver(atualizar);
    observer.observe(elemento);
    return () => observer.disconnect();
  }, [colunas.length]);

  return <div className="quadro-pipeline" style={{ "--cor": COR } as CSSProperties}>
    <section className="painel-quadro" aria-label="Quadro dos lançamentos">
      <div className="quadro-area-colunas" ref={areaRef}>
        <div className="quadro-colunas" ref={colunasRef} tabIndex={0} role="region" aria-label="Situações dos lançamentos"
          style={{ "--espaco-colunas": `${ESPACO_COLUNAS_KANBAN}px`, ...(layout ? { "--largura-coluna": `${layout.larguraColuna}px`, "--largura-quadro": `${layout.larguraQuadro}px` } : {}) } as CSSProperties}>
          {colunas.map((coluna) => {
            const info = COLUNAS[coluna.id];
            const escondidos = coluna.quantidade - coluna.itens.length;
            return <section key={coluna.id} className="coluna-etapa" aria-labelledby={`coluna-${coluna.id}`} style={{ "--cor": COR } as CSSProperties}>
              <header className="coluna-topo">
                <div className="coluna-titulo"><Kanban size={16} className="coluna-titulo-icone" style={{ color: COR }} aria-hidden="true" /><h3 id={`coluna-${coluna.id}`}>{info.nome}</h3></div>
                <span className="coluna-quantidade" aria-label={coluna.quantidade === 1 ? "1 lançamento" : `${coluna.quantidade} lançamentos`}>{String(coluna.quantidade).padStart(2, "0")}</span>
              </header>
              <div className="coluna-meta">
                <span className="coluna-soma" title={`${info.nota}. Entradas e saídas da coluna.`}>+{valorCurto(coluna.totalEntradas)} · −{valorCurto(coluna.totalSaidas)}</span>
              </div>
              <div className="coluna-corpo" role="region" aria-label={`Lançamentos em ${info.nome}`} tabIndex={0}>
                {coluna.itens.length > 0
                  ? coluna.itens.map((l) => <div key={l.id} className={`${styles.cartaoQuadro} plg-lift`}><CartaoDoLancamento l={l} aoAbrir={aoAbrir} /></div>)
                  : <p className="coluna-vazia">{info.vazio}</p>}
                {escondidos > 0 ? <p className="coluna-vazia">E mais {escondidos}. Use a lista ou os filtros para ver todos.</p> : null}
              </div>
            </section>;
          })}
        </div>
      </div>
    </section>
  </div>;
}
