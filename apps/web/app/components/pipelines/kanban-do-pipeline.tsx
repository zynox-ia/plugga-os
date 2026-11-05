"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { Clock, Kanban, Plus } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { calcularLayoutKanban, ESPACO_COLUNAS_KANBAN } from "../../lib/layout-kanban";
import { somaDosValores, valorCurto } from "../../lib/negocios";
import { CartaoDeNegocio } from "./cartao-de-negocio";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";
import { useArrastoKanban } from "./use-arrasto-kanban";
import styles from "./kanban-arrasto.module.css";

const comCor = (cor: string) => ({ "--cor": cor }) as CSSProperties;

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
  const internoRef = useRef<HTMLDivElement>(null);
  const refEfetivo = colunasRef ?? internoRef;
  const { arrasto, alvo, comecar, terminar } = useArrastoKanban(refEfetivo);
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

  const espaco = <div className={styles.insercao} data-testid="kanban-insercao" aria-hidden="true" style={{ height: arrasto?.altura }} />;

  return (
    <div className="quadro-area-colunas" ref={areaRef}>
      <div
        className={`quadro-colunas${arrasto ? ` ${styles.rolando}` : ""}`}
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
          const alvoDaEtapa = alvo?.etapaId === etapa.id;
          return (
            <section
              key={etapa.id}
              className="coluna-etapa"
              data-etapa-id={etapa.id}
              aria-labelledby={`etapa-${etapa.id}`}
              style={comCor(etapa.color)}
              onDragOver={(evento) => { if (arrasto) evento.preventDefault(); }}
              onDrop={(evento) => {
                if (!arrasto || !alvoDaEtapa) return;
                evento.preventDefault();
                void acoes.moverEtapa(arrasto.negocio, etapa.id, alvo.antesDeId);
                terminar();
              }}
            >
              <header className="coluna-topo">
                <div className="coluna-titulo">
                  <Kanban size={16} className="coluna-titulo-icone" style={{ color: etapa.color }} aria-hidden="true" />
                  <h3 id={`etapa-${etapa.id}`}>{etapa.name}</h3>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span className="coluna-quantidade" aria-label={`${daEtapa.length} negócios`}>
                    {String(daEtapa.length).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    className="coluna-novo"
                    aria-label={`Novo lead em ${etapa.name}`}
                    title={`Novo lead em ${etapa.name}`}
                    onClick={() => acoes.novoNaEtapa(etapa.id)}
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                </div>
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

              <div className={`coluna-corpo ${styles.corpo}`} data-corpo-etapa role="region" aria-label={`Negócios em ${etapa.name}`} tabIndex={0}>
                {daEtapa.length > 0 ? (
                  daEtapa.map((negocio) => (
                    <Fragment key={negocio.id}>
                      {alvoDaEtapa && alvo.antesDeId === negocio.id ? espaco : null}
                      <div
                        data-cartao-id={negocio.id}
                        className={`${styles.cartao}${arrasto?.negocio.id === negocio.id ? ` ${styles.origem}` : ""}`}
                        style={arrasto?.negocio.id === negocio.id ? { width: arrasto.largura } : undefined}
                      >
                        <CartaoDeNegocio
                          negocio={negocio}
                          pipeline={pipeline}
                          acoes={acoes}
                          arrastando={arrasto?.negocio.id === negocio.id}
                          aoComecarArrasto={(elemento) => comecar(negocio, elemento)}
                          aoTerminarArrasto={terminar}
                        />
                      </div>
                    </Fragment>
                  ))
                ) : (
                  !alvoDaEtapa ? <p className="coluna-vazia">{arrasto ? "Solte aqui" : "Sem negócios nesta etapa"}</p> : null
                )}
                {alvoDaEtapa && alvo.antesDeId === null ? espaco : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
