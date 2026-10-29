"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { Clock, Kanban } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type RefObject } from "react";

import { calcularLayoutKanban, ESPACO_COLUNAS_KANBAN } from "../../lib/layout-kanban";
import { somaDosValores, valorCurto } from "../../lib/negocios";
import { CartaoDeNegocio } from "./cartao-de-negocio";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";

type Alvo = { tipo: "etapa"; id: string };
const comCor = (cor: string) => ({ "--cor": cor }) as CSSProperties;
const mesmoAlvo = (a: Alvo | null, b: Alvo) => a !== null && a.id === b.id;

/**
 * Kanban: uma coluna por etapa, com contagem e soma dos valores.
 * Arrastar um card entre colunas altera sua etapa.
 */
export function KanbanDoPipeline({
  pipeline,
  negocios,
  acoes,
  colunasRef,
}: {
  pipeline: Pipeline;
  negocios: Deal[];
  acoes: AcoesDoNegocio;
  colunasRef?: RefObject<HTMLDivElement | null>;
}) {
  const [arrastando, setArrastando] = useState<Deal | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const internoRef = useRef<HTMLDivElement>(null);
  const refEfetivo = colunasRef ?? internoRef;
  const areaRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ReturnType<typeof calcularLayoutKanban> | null>(null);

  useLayoutEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    const atualizar = () => setLayout(calcularLayoutKanban(elemento.clientWidth, pipeline.stages.length));
    atualizar();
    const observer = new ResizeObserver(atualizar);
    observer.observe(elemento);
    return () => observer.disconnect();
  }, [pipeline.stages.length]);

  const terminar = () => {
    setArrastando(null);
    setAlvo(null);
  };

  /** Eventos de uma área que aceita o card arrastado. */
  const area = (destino: Alvo, soltar: (negocio: Deal) => void) => ({
    onDragOver: (evento: DragEvent) => {
      if (!arrastando) return;
      evento.preventDefault();
      if (!mesmoAlvo(alvo, destino)) setAlvo(destino);
    },
    onDragLeave: (evento: DragEvent) => {
      if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setAlvo(null);
    },
    onDrop: (evento: DragEvent) => {
      evento.preventDefault();
      const negocio = arrastando;
      terminar();
      if (negocio) soltar(negocio);
    },
  });

  return (
    <div className="quadro-area-colunas" ref={areaRef}>
      <div
        className="quadro-colunas"
        ref={refEfetivo}
        tabIndex={0}
        role="region"
        aria-label="Etapas do pipeline"
        style={{
          "--espaco-colunas": `${ESPACO_COLUNAS_KANBAN}px`,
          ...(layout ? {
            "--largura-coluna": `${layout.larguraColuna}px`,
            "--largura-quadro": `${layout.larguraQuadro}px`,
          } : {}),
        } as CSSProperties}
      >
        {pipeline.stages.map((etapa) => {
          const daEtapa = negocios.filter((n) => n.stageId === etapa.id);
          const destino: Alvo = { tipo: "etapa", id: etapa.id };
          return (
            <section
              key={etapa.id}
              className={`coluna-etapa${mesmoAlvo(alvo, destino) && arrastando?.stageId !== etapa.id ? " coluna-etapa--alvo" : ""}`}
              aria-labelledby={`etapa-${etapa.id}`}
              style={comCor(etapa.color)}
              {...area(destino, (negocio) => void acoes.moverEtapa(negocio, etapa.id))}
            >
              <header className="coluna-topo">
                <div className="coluna-titulo">
                  <Kanban size={16} className="coluna-titulo-icone" style={{ color: etapa.color }} aria-hidden="true" />
                  <h3 id={`etapa-${etapa.id}`}>{etapa.name}</h3>
                </div>
                <span className="coluna-quantidade" aria-label={`${daEtapa.length} negócios`}>
                  {String(daEtapa.length).padStart(2, "0")}
                </span>
              </header>

              <div className="coluna-meta">
                <span className="coluna-soma">{valorCurto(somaDosValores(daEtapa))}</span>
                {etapa.staleAfterDays !== null ? (
                  <span className="coluna-parado" title={`O negócio aparece como parado depois de ${etapa.staleAfterDays} dias nesta etapa`}>
                    <Clock size={11} aria-hidden="true" />
                    {etapa.staleAfterDays}d
                  </span>
                ) : null}
              </div>

              <div className="coluna-corpo">
                {daEtapa.length > 0 ? (
                  daEtapa.map((negocio) => (
                    <CartaoDeNegocio
                      key={negocio.id}
                      negocio={negocio}
                      pipeline={pipeline}
                      acoes={acoes}
                      arrastando={arrastando?.id === negocio.id}
                      aoComecarArrasto={() => setArrastando(negocio)}
                      aoTerminarArrasto={terminar}
                    />
                  ))
                ) : (
                  <p className="coluna-vazia">{arrastando ? "Solte aqui" : "Sem negócios nesta etapa"}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
