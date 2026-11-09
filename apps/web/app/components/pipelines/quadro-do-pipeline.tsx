"use client";

import type { BulkDealsAction, Deal, DealPriority, Pipeline, PipelinePerson } from "@plugga/shared";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { aplicarFiltros, FILTROS_INICIAIS, hojeNoFuso, type Visao } from "../../lib/negocios";
import { KanbanDoPipeline } from "./kanban-do-pipeline";
import { ListaDeNegocios } from "./lista-de-negocios";
import { campoCorrespondeAoFiltro } from "../../lib/campos-do-pipeline";
import { TextField } from "../ui/fields";
import campoStyles from "./campos-do-pipeline.module.css";

export type AcoesDoNegocio = {
  definirPrioridade: (negocio: Deal, prioridade: DealPriority | null) => Promise<Deal | null>;
  moverEtapa: (negocio: Deal, etapaId: string, antesDeId?: string | null) => Promise<Deal | null>;
  abrirDetalhes: (negocio: Deal) => void;
  atualizar: (negocio: Deal) => void;
  ganhar: (negocio: Deal) => void;
  perder: (negocio: Deal) => void;
  transferir: (negocio: Deal) => void;
  novoNaEtapa: (etapaId: string) => void;
  emLote: (ids: string[], acao: BulkDealsAction) => Promise<boolean>;
  converter?: (negocio: Deal) => void;
  convertendoId?: string | null;
};

/** Barra de rolagem minimalista (suave, quase invisível, sem setas e com largura compacta). */
export function BarraRolagemMinimalista({ containerRef, className = "" }: { containerRef: RefObject<HTMLDivElement | null>; className?: string }) {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState({ thumbWidth: 48, thumbLeft: 0, visivel: true });
  const [emArrasto, setEmArrasto] = useState(false);

  // O trilho é remontado quando o quadro volta a precisar de rolagem.
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
      if (trilhoRef.current) ro.observe(trilhoRef.current);
    }
    window.addEventListener("resize", atualizar);

    return () => {
      el.removeEventListener("scroll", atualizar);
      window.removeEventListener("resize", atualizar);
      ro?.disconnect();
    };
  }, [containerRef, posicao.visivel]);

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
    <div className={`barra-rolagem-externa ${className}`} aria-hidden="true">
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
  responsaveis,
  pipeline,
  negocios,
  busca,
  visao,
  acoes,
  colunasRef,
}: {
  pipeline: Pipeline;
  responsaveis: PipelinePerson[];
  negocios: Deal[];
  busca: string;
  visao: Visao;
  usuarioId: string | null;
  acoes: AcoesDoNegocio;
  colunasRef: RefObject<HTMLDivElement | null>;
}) {
  const hoje = hojeNoFuso();
  const [filtroCampo, setFiltroCampo] = useState({ pipelineId: pipeline.id, campoId: "", valor: "" });
  const filtroAtual = filtroCampo.pipelineId === pipeline.id ? filtroCampo : { pipelineId: pipeline.id, campoId: "", valor: "" };
  const campoFiltrado = pipeline.fields?.find((campo) => campo.id === filtroAtual.campoId);

  // No Kanban entram os abertos filtrados pela busca; na Lista entram todos filtrados pela busca.
  const visiveis = useMemo(
    () => aplicarFiltros(negocios, { ...FILTROS_INICIAIS, busca, status: visao === "kanban" ? "open" : "todos" }, hoje, pipeline, responsaveis)
      .filter((negocio) => !campoFiltrado || campoCorrespondeAoFiltro(campoFiltrado, negocio.customFields?.[campoFiltrado.id], filtroAtual.valor, responsaveis)),
    [negocios, busca, visao, hoje, pipeline, responsaveis, campoFiltrado, filtroAtual.valor],
  );

  return (
    <div className="quadro-pipeline" style={{ "--cor": pipeline.color } as CSSProperties}>
      {pipeline.fields?.length ? <details className={campoStyles.filtros}><summary>Filtrar por dados de {pipeline.name}</summary><div className={campoStyles.grade}>
        <div className="ui-field"><label htmlFor="filtro-campo-pipeline">Campo</label><select id="filtro-campo-pipeline" className="ui-input" value={filtroAtual.campoId} onChange={(e) => setFiltroCampo({ pipelineId: pipeline.id, campoId: e.target.value, valor: "" })}><option value="">Todos os campos</option>{pipeline.fields.map((campo) => <option key={campo.id} value={campo.id}>{campo.name}</option>)}</select></div>
        <TextField label="Valor do filtro" value={filtroAtual.valor} disabled={!campoFiltrado} placeholder={campoFiltrado?.type === "boolean" ? "Sim ou Não" : "Digite o valor exibido"} onChange={(e) => setFiltroCampo({ ...filtroAtual, valor: e.target.value })} />
      </div></details> : null}
      <section className="painel-quadro" aria-label={`Negócios do pipeline ${pipeline.name}`}>
        {visao === "kanban" ? (
          <KanbanDoPipeline
            responsaveis={responsaveis}
            pipeline={pipeline}
            negocios={visiveis}
            acoes={acoes}
            colunasRef={colunasRef}
          />
        ) : null}
        {visao === "lista" ? <ListaDeNegocios responsaveis={responsaveis} pipeline={pipeline} negocios={visiveis} acoes={acoes} /> : null}
      </section>
    </div>
  );
}
