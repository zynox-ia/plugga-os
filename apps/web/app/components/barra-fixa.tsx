"use client";

import { Filter } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

import styles from "./barra-fixa.module.css";
import { FiltroComBusca, type OpcaoDoMenu } from "./suprimentos/menu-com-busca";
import { Button, Dialog } from "./ui";

/**
 * Barra de visualização, busca e filtros que gruda no topo da área de conteúdo
 * (padrão aprovado pelo André nos Lançamentos do Financeiro). O título e os
 * metric cards sobem com a página; a barra fica presa, compacta (abas só com
 * ícone, busca menor, tudo numa linha) e com fundo translúcido e desfoque. A
 * 390 px a barra mostra a busca, "Visualização" e "Filtros", que abre a folha
 * com a busca e os filtros empilhados; presa, a busca fica só na folha.
 *
 * A página que usa a barra leva `classeDaPaginaComBarra` na raiz: ela tira o
 * respiro de cima do `.main-content` para nada passar nítido por cima da barra.
 * A rolagem é a do `.main-content` (ou da janela): sem rolagem interna na lista.
 */

export const classeDaPaginaComBarra = styles.pagina;

/** O ancestral que rola (o `.main-content` do app), para o observador saber quando a barra prende. */
function ancestralQueRola(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (/(auto|scroll)/.test(overflowY)) return p;
  }
  return null;
}

export type VisaoDaBarra = { rotulo?: string; opcoes: OpcaoDoMenu[]; valor: string; aoMudar: (v: string) => void };

export function BarraFixa({ rotulo, abas, busca, filtros, acoesQuandoPresa, movel }: {
  /** Nome acessível da barra ("Visualização, busca e filtros"). */
  rotulo: string;
  /** O tablist das visões (Cards · Lista · …). Presa, as abas ficam só com o ícone. */
  abas: ReactNode;
  /** O formulário de busca (`equipe-busca`). */
  busca?: ReactNode;
  /** Os filtros e o "Limpar", alinhados à direita. */
  filtros?: ReactNode;
  /** Ações que só aparecem com a barra presa (ex.: "Novo item" só com ícone). */
  acoesQuandoPresa?: ReactNode;
  /** A 390 px: o menu de visualização, a contagem de filtros ativos e o conteúdo da folha. */
  movel?: { visao: VisaoDaBarra; filtrosAtivos: number; folha: ReactNode; rotuloDoResultado?: string; aoLimpar?: () => void };
}) {
  const sentinela = useRef<HTMLDivElement>(null);
  const [presa, setPresa] = useState(false);
  const [folhaAberta, setFolhaAberta] = useState(false);

  useEffect(() => {
    const el = sentinela.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const raiz = ancestralQueRola(el);
    const obs = new IntersectionObserver(([e]) => {
      if (!e) return;
      const topo = e.rootBounds?.top ?? 0;
      setPresa(!e.isIntersecting && e.boundingClientRect.top < topo);
    }, { root: raiz, threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const visao = movel?.visao;
  const atual = visao?.opcoes.find((o) => o.value === visao.valor);
  return <>
    <div ref={sentinela} className={styles.sentinela} aria-hidden="true" />
    <div className={`${styles.barra} ${presa ? styles.presa : ""}`} role="region" aria-label={rotulo} data-presa={presa || undefined}>
      <div className={styles.abas}>{abas}</div>
      {busca ? <div className={styles.busca}>{busca}</div> : null}
      {movel && visao ? <div className={styles.movel}>
        <FiltroComBusca label={visao.rotulo ?? "Visualização"} icon={atual?.icon ?? <Filter />} options={visao.opcoes} value={visao.valor} onChange={visao.aoMudar} />
        <Button variant="secondary" icon={<Filter size={16} />} aria-haspopup="dialog" onClick={() => setFolhaAberta(true)}
          aria-label={`Filtros${movel.filtrosAtivos ? `, ${movel.filtrosAtivos} ${movel.filtrosAtivos === 1 ? "ativo" : "ativos"}` : ""}`}>
          Filtros{movel.filtrosAtivos ? <span className={styles.conta} aria-hidden="true">{movel.filtrosAtivos}</span> : null}
        </Button>
      </div> : null}
      {filtros ? <div className={styles.filtros}>{filtros}</div> : null}
      {acoesQuandoPresa ? <div className={styles.acoesPresa} aria-hidden={!presa || undefined}>{acoesQuandoPresa}</div> : null}
    </div>
    {folhaAberta && movel ? <FolhaDeFiltros aoFechar={() => setFolhaAberta(false)} rotuloDoResultado={movel.rotuloDoResultado} aoLimpar={movel.aoLimpar}>{movel.folha}</FolhaDeFiltros> : null}
  </>;
}

/** A folha da 390 px: a busca e os filtros empilhados, cada um com o rótulo; aplicam na hora. */
export function FolhaDeFiltros({ children, aoFechar, rotuloDoResultado = "Ver resultados", aoLimpar }: {
  children: ReactNode; aoFechar: () => void; rotuloDoResultado?: string; aoLimpar?: () => void;
}) {
  return <Dialog title="Filtros" description="Busca e filtros. Aplicam na hora." icon={<Filter size={20} />} size="estreita" onClose={aoFechar} cancelText="Fechar"
    footer={<>{aoLimpar ? <Button variant="secondary" onClick={aoLimpar}>Limpar filtros</Button> : null}<Button onClick={aoFechar}>{rotuloDoResultado}</Button></>}>
    <div className={styles.folha}>{children}</div>
  </Dialog>;
}

/** Um campo da folha: rótulo em cima e o filtro na largura toda. */
export function CampoDaFolha({ rotulo, children }: { rotulo: string; children: ReactElement }) {
  return <div className={styles.campoDaFolha}><span className={styles.rotuloDaFolha}>{rotulo}</span>{children}</div>;
}
