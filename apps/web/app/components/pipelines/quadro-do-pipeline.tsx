"use client";

import type { BulkDealsAction, Deal, Pipeline } from "@plugga/shared";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { aplicarFiltros, FILTROS_INICIAIS, hojeNoFuso, type Visao } from "../../lib/negocios";
import { KanbanDoPipeline } from "./kanban-do-pipeline";
import { ListaDeNegocios } from "./lista-de-negocios";

export type AcoesDoNegocio = {
  moverEtapa: (negocio: Deal, etapaId: string) => Promise<void>;
  ganhar: (negocio: Deal) => void;
  perder: (negocio: Deal) => void;
  transferir: (negocio: Deal) => void;
  novoNaEtapa: (etapaId: string) => void;
  emLote: (ids: string[], acao: BulkDealsAction) => Promise<boolean>;
};

/** Barra de rolagem minimalista (suave, quase invisível, sem setas e com largura compacta). */
function BarraRolagemMinimalista({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState({ thumbWidth: 48, thumbLeft: 0, visivel: true });
  const [emArrasto, setEmArrasto] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const atualizar = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      if (scrollWidth <= clientWidth + 2) {
        setPosicao((p) => ({ ...p, visivel: false }));
        return;
      }
      const larguraTrilho = trilhoRef.current?.clientWidth ?? 380;
      const proporcaoVisivel = Math.min(1, clientWidth / scrollWidth);
      const thumbWidth = Math.max(48, larguraTrilho * proporcaoVisivel);
      const maxScroll = scrollWidth - clientWidth;
      const maxThumbLeft = larguraTrilho - thumbWidth;
      const thumbLeft = maxScroll > 0 ? (scrollLeft / maxScroll) * maxThumbLeft : 0;
      setPosicao({ thumbWidth, thumbLeft, visivel: true });
    };

    atualizar();
    el.addEventListener("scroll", atualizar, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(atualizar);
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    window.addEventListener("resize", atualizar);

    return () => {
      el.removeEventListener("scroll", atualizar);
      window.removeEventListener("resize", atualizar);
      ro?.disconnect();
    };
  }, [containerRef]);

  const aoClicarTrilho = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target !== trilhoRef.current) return;
    const el = containerRef.current;
    const trilho = trilhoRef.current;
    if (!el || !trilho) return;

    const rect = trilho.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const maxThumbLeft = rect.width - posicao.thumbWidth;
    const novoLeft = Math.max(0, Math.min(maxThumbLeft, clickX - posicao.thumbWidth / 2));
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxThumbLeft > 0) {
      el.scrollTo({ left: (novoLeft / maxThumbLeft) * maxScroll, behavior: "smooth" });
    }
  };

  const aoIniciarArrasto = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    const trilho = trilhoRef.current;
    if (!el || !trilho) return;

    setEmArrasto(true);
    el.style.scrollBehavior = "auto";
    el.style.scrollSnapType = "none";

    const startX = e.clientX;
    const startScrollLeft = el.scrollLeft;
    const larguraTrilho = trilho.clientWidth;
    const maxThumbLeft = larguraTrilho - posicao.thumbWidth;
    const maxScroll = el.scrollWidth - el.clientWidth;

    let frameId: number | null = null;

    const aoMover = (ev: MouseEvent) => {
      if (maxThumbLeft <= 0) return;
      const deltaX = ev.clientX - startX;
      const scrollDelta = (deltaX / maxThumbLeft) * maxScroll;
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        el.scrollLeft = startScrollLeft + scrollDelta;
      });
    };

    const aoSoltar = () => {
      if (frameId) cancelAnimationFrame(frameId);
      setEmArrasto(false);
      el.style.scrollBehavior = "smooth";
      el.style.scrollSnapType = "";
      window.removeEventListener("mousemove", aoMover);
      window.removeEventListener("mouseup", aoSoltar);
    };

    window.addEventListener("mousemove", aoMover);
    window.addEventListener("mouseup", aoSoltar);
  };

  if (!posicao.visivel) return null;

  return (
    <div className="barra-rolagem-externa" aria-hidden="true">
      <div
        className="barra-rolagem-trilho"
        ref={trilhoRef}
        onClick={aoClicarTrilho}
      >
        <div
          className={`barra-rolagem-polegar${emArrasto ? " barra-rolagem-polegar--arrastando" : ""}`}
          style={{ width: posicao.thumbWidth, transform: `translateX(${posicao.thumbLeft}px)` }}
          onMouseDown={aoIniciarArrasto}
        />
      </div>
    </div>
  );
}

/** As duas visões compartilham os dados e ações do mesmo pipeline. */
export function QuadroDoPipeline({
  pipeline,
  negocios,
  busca,
  visao,
  acoes,
}: {
  pipeline: Pipeline;
  negocios: Deal[];
  busca: string;
  visao: Visao;
  usuarioId: string | null;
  acoes: AcoesDoNegocio;
}) {
  const hoje = hojeNoFuso();
  const colunasRef = useRef<HTMLDivElement>(null);

  // No Kanban entram os abertos filtrados pela busca; na Lista entram todos filtrados pela busca.
  const visiveis = useMemo(
    () => aplicarFiltros(negocios, { ...FILTROS_INICIAIS, busca, status: visao === "kanban" ? "open" : "todos" }, hoje),
    [negocios, busca, visao, hoje],
  );

  return (
    <div className="quadro-pipeline" style={{ "--cor": pipeline.color } as CSSProperties}>
      {/* Barra de rolagem minimalista FORA do shape do painel do kanban */}
      {visao === "kanban" ? <BarraRolagemMinimalista key={`${pipeline.id}-${pipeline.stages.length}`} containerRef={colunasRef} /> : null}

      <section className="painel-quadro" aria-label={`Negócios do pipeline ${pipeline.name}`}>
        {visao === "kanban" ? (
          <KanbanDoPipeline
            pipeline={pipeline}
            negocios={visiveis}
            acoes={acoes}
            colunasRef={colunasRef}
          />
        ) : null}
        {visao === "lista" ? <ListaDeNegocios pipeline={pipeline} negocios={visiveis} acoes={acoes} /> : null}
      </section>
    </div>
  );
}
