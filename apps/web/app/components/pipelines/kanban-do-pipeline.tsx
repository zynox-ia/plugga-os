"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { useState, type CSSProperties, type DragEvent } from "react";
import { createPortal } from "react-dom";

import { somaDosValores, valorCurto } from "../../lib/negocios";
import { CartaoDeNegocio } from "./cartao-de-negocio";
import { Icone } from "./icones";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";

type Alvo = { tipo: "etapa"; id: string } | { tipo: "ganho" | "perda" | "transferencia" };
const comCor = (cor: string) => ({ "--cor": cor }) as CSSProperties;
const mesmoAlvo = (a: Alvo | null, b: Alvo) => a !== null && a.tipo === b.tipo && (a.tipo !== "etapa" || (b.tipo === "etapa" && a.id === b.id));

/**
 * Kanban: uma coluna por etapa, com quantidade e soma. Arrastar um card para
 * outra coluna muda a etapa; enquanto se arrasta, aparecem as zonas de Ganho,
 * Perdido e Mover para outro pipeline (que não são colunas).
 */
export function KanbanDoPipeline({ pipeline, negocios, acoes }: { pipeline: Pipeline; negocios: Deal[]; acoes: AcoesDoNegocio }) {
  const [arrastando, setArrastando] = useState<Deal | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);

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
    <>
      <div className="quadro-colunas">
        {pipeline.stages.map((etapa, i) => {
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
                  <span className="coluna-ordem" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 id={`etapa-${etapa.id}`}>{etapa.name}</h3>
                  <span className="coluna-contagem" aria-label={`${daEtapa.length} negócios`}>
                    {daEtapa.length}
                  </span>
                  <button type="button" className="botao-icone coluna-novo" aria-label={`Novo negócio em ${etapa.name}`} title="Novo negócio nesta etapa" onClick={() => acoes.novoNaEtapa(etapa.id)}>
                    <Icone nome="mais" tamanho={15} />
                  </button>
                </div>
                <div className="coluna-meta">
                  <span className="coluna-soma">{valorCurto(somaDosValores(daEtapa))}</span>
                  {etapa.staleAfterDays !== null ? (
                    <span className="coluna-parado" title={`O negócio aparece como parado depois de ${etapa.staleAfterDays} dias nesta etapa`}>
                      <Icone nome="relogio" tamanho={12} />
                      {etapa.staleAfterDays}d
                    </span>
                  ) : null}
                </div>
              </header>
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

      {arrastando ? (
        // Portal: o painel tem backdrop-filter, que prenderia o `fixed` dentro dele.
        createPortal(
          <div className="zonas-desfecho" aria-hidden="true">
            <div className={`zona zona--ganho${alvo?.tipo === "ganho" ? " zona--alvo" : ""}`} {...area({ tipo: "ganho" }, acoes.ganhar)}>
              <Icone nome="check" /> {pipeline.wonLabel}
            </div>
            <div className={`zona zona--perdido${alvo?.tipo === "perda" ? " zona--alvo" : ""}`} {...area({ tipo: "perda" }, acoes.perder)}>
              <Icone nome="x" /> {pipeline.lostLabel}
            </div>
            <div className={`zona zona--mover${alvo?.tipo === "transferencia" ? " zona--alvo" : ""}`} {...area({ tipo: "transferencia" }, acoes.transferir)}>
              <Icone nome="seta" /> Mover para outro pipeline
            </div>
          </div>,
          document.body,
        )
      ) : (
        <footer className="quadro-rodape">
          <span className="quadro-rodape-rotulo">Desfechos</span>
          <span className="desfecho desfecho--ganho">
            <Icone nome="check" tamanho={14} />
            {pipeline.wonLabel}
          </span>
          <span className="desfecho desfecho--perdido">
            <Icone nome="x" tamanho={14} />
            {pipeline.lostLabel}
          </span>
          <span className="quadro-rodape-dica">Arraste um negócio até Ganho ou Perdido para encerrá-lo, ou use o menu ⋯ do card.</span>
        </footer>
      )}
    </>
  );
}
