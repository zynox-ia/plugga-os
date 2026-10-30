"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { ArrowRight, Calendar, Check, Clock, Eye, MoreHorizontal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { diasNaEtapa, estaParado, hojeNoFuso, valorCurto } from "../../lib/negocios";
import { Avatar } from "./icones";
import { DetalhesDoLeadModal } from "./detalhes-do-lead-modal";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";

function formatarDataCurta(dataStr: string | null): string {
  if (!dataStr) return "";
  const d = new Date(`${dataStr.slice(0, 10)}T12:00:00Z`);
  if (isNaN(d.getTime())) return dataStr;
  const dia = d.getUTCDate();
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mes = meses[d.getUTCMonth()];
  return `${dia} ${mes}`;
}

/**
 * Ações do negócio aberto pelo teclado ou pelo mouse: a alternativa ao arrastar
 * para mudar de etapa, ganhar, perder ou mover para outro pipeline.
 */
export function MenuDoNegocio({
  negocio,
  pipeline,
  acoes,
  aoVerLead,
}: {
  negocio: Deal;
  pipeline: Pipeline;
  acoes: AcoesDoNegocio;
  aoVerLead?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: MouseEvent) => {
      const alvo = evento.target as Node;
      if (!raiz.current?.contains(alvo) && !menu.current?.contains(alvo)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => {
      document.removeEventListener("mousedown", fora);
    };
  }, [aberto]);

  useLayoutEffect(() => {
    if (!aberto || !botao.current) return;
    const visibilidade = new IntersectionObserver(([entrada]) => {
      if (entrada && !entrada.isIntersecting) setAberto(false);
    });
    visibilidade.observe(botao.current);
    const posicionar = () => {
      if (!botao.current || !menu.current) return;
      const alvo = botao.current.getBoundingClientRect();
      if (alvo.bottom <= 0 || alvo.top >= window.innerHeight || alvo.right <= 0 || alvo.left >= window.innerWidth) {
        setAberto(false);
        return;
      }
      const { width, height } = menu.current.getBoundingClientRect();
      const abaixo = alvo.bottom + 4;
      const top = abaixo + height > window.innerHeight - 8 ? Math.max(8, alvo.top - 4 - height) : abaixo;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, alvo.right - width));
      setPosicao({ top, left });
    };
    posicionar();
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    return () => {
      visibilidade.disconnect();
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberto]);

  const escolher = (acao: () => void) => () => {
    setAberto(false);
    acao();
  };

  return (
    <div
      className="menu-negocio"
      ref={raiz}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(evento) => {
        if (evento.key === "Escape" && aberto) {
          evento.preventDefault();
          evento.stopPropagation();
          setAberto(false);
        }
      }}
    >
      <button
        ref={botao}
        type="button"
        className="botao-icone"
        aria-label={`Ações de ${negocio.title}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={(e) => {
          e.stopPropagation();
          setPosicao(null);
          setAberto((a) => !a);
        }}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>
      {aberto
        ? createPortal(
            <div
              ref={menu}
              className="menu-negocio-lista"
              role="menu"
              aria-label={`Ações de ${negocio.title}`}
              style={posicao ? { top: posicao.top, left: posicao.left } : { visibility: "hidden" }}
            >
              {aoVerLead ? (
                <>
                  <button type="button" role="menuitem" onClick={escolher(aoVerLead)}>
                    <Eye size={14} aria-hidden="true" /> Ver detalhes do lead
                  </button>
                  <span className="menu-negocio-divisor" role="separator" />
                </>
              ) : null}

              <span className="menu-negocio-titulo">Mover para etapa</span>
              {pipeline.stages
                .filter((e) => e.id !== negocio.stageId)
                .map((e) => (
                  <button key={e.id} type="button" role="menuitem" onClick={escolher(() => void acoes.moverEtapa(negocio, e.id))}>
                    <span className="ponto-cor" style={{ background: e.color }} aria-hidden="true" />
                    {e.name}
                  </button>
                ))}
              <span className="menu-negocio-divisor" role="separator" />
              <button type="button" role="menuitem" className="menu-negocio--ganho" onClick={escolher(() => acoes.ganhar(negocio))}>
                <Check size={14} aria-hidden="true" /> {pipeline.wonLabel}
              </button>
              <button type="button" role="menuitem" className="menu-negocio--perdido" onClick={escolher(() => acoes.perder(negocio))}>
                <X size={14} aria-hidden="true" /> {pipeline.lostLabel}
              </button>
              <button type="button" role="menuitem" onClick={escolher(() => acoes.transferir(negocio))}>
                <ArrowRight size={14} aria-hidden="true" /> Mover para outro pipeline
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Card do Kanban do CRM:
 * - Exibe tags reais do lead, título, cliente e valor em destaque.
 * - Fornece o botão direto "Ver lead" para abrir o modal de detalhes do lead.
 * - Elimina dados desnecessários (Milestone, Due:, Assigned for, prioridade fake).
 */
export function CartaoDeNegocio({
  negocio,
  pipeline,
  acoes,
  arrastando,
  aoComecarArrasto,
  aoTerminarArrasto,
}: {
  negocio: Deal;
  pipeline: Pipeline;
  acoes: AcoesDoNegocio;
  arrastando: boolean;
  aoComecarArrasto: () => void;
  aoTerminarArrasto: () => void;
}) {
  const [modalLeadAberto, setModalLeadAberto] = useState(false);
  const arrastou = useRef(false);

  const dias = diasNaEtapa(negocio);
  const parado = estaParado(negocio, pipeline);
  const hoje = hojeNoFuso();
  const previsaoVencida = negocio.expectedCloseDate !== null && negocio.expectedCloseDate < hoje;

  return (
    <>
      <article
        className={`cartao-negocio${arrastando ? " cartao-negocio--arrastando" : ""}${parado ? " cartao-negocio--parado" : ""}`}
        aria-label={`Negócio ${negocio.title}`}
        draggable
        onDragStart={(evento) => {
          arrastou.current = true;
          evento.dataTransfer.effectAllowed = "move";
          evento.dataTransfer.setData("text/plain", negocio.id);
          aoComecarArrasto();
        }}
        onDragEnd={() => {
          setTimeout(() => {
            arrastou.current = false;
          }, 100);
          aoTerminarArrasto();
        }}
        onClick={(e) => {
          if (arrastou.current) return;
          if ((e.target as HTMLElement).closest("button")) return;
          setModalLeadAberto(true);
        }}
      >
        {/* 1. Topo: Tags Reais + Ação "Ver lead" + Menu ⋯ */}
        <div className="cartao-negocio-topo">
          <div className="cartao-negocio-tags">
            {negocio.tags.slice(0, 2).map((tag) => (
              <span key={tag.id} className="cartao-negocio-tag" style={{ borderLeft: `3px solid ${tag.color}` }}>
                <span>{tag.name}</span>
              </span>
            ))}
            {negocio.tags.length > 2 ? (
              <span className="cartao-negocio-tag" title={negocio.tags.slice(2).map((t) => t.name).join(", ")}>
                +{negocio.tags.length - 2}
              </span>
            ) : null}
            {parado && negocio.tags.length === 0 ? (
              <span className="cartao-negocio-alerta-parado" title="Parado além do limite de dias desta etapa">
                <Clock size={11} aria-hidden="true" />
                <span>Parado há {dias}d</span>
              </span>
            ) : null}
          </div>

          <div className="cartao-negocio-acoes-topo">
            <button
              type="button"
              className="cartao-negocio-btn-ver"
              aria-label={`Ver lead ${negocio.title}`}
              title="Ver detalhes do lead"
              onClick={(e) => {
                e.stopPropagation();
                setModalLeadAberto(true);
              }}
            >
              <Eye size={12} aria-hidden="true" />
              <span>Ver lead</span>
            </button>
            <MenuDoNegocio
              negocio={negocio}
              pipeline={pipeline}
              acoes={acoes}
              aoVerLead={() => setModalLeadAberto(true)}
            />
          </div>
        </div>

        {/* 2. Corpo: Título, Cliente e Valor em Destaque */}
        <div className="cartao-negocio-corpo">
          <h4>{negocio.title}</h4>
          <p className="cartao-negocio-cliente">
            {negocio.client.name}
            {negocio.contact ? <span> · {negocio.contact.name}</span> : null}
          </p>
          {negocio.value ? (
            <div className="cartao-negocio-valor">
              <span>{valorCurto(Number(negocio.value))}</span>
            </div>
          ) : null}
        </div>

        {/* 3. Rodapé: Responsável + Previsão / Dias */}
        <div className="cartao-negocio-rodape">
          <div className="cartao-negocio-owner" title={`Responsável: ${negocio.owner.name}`}>
            <Avatar id={negocio.owner.id} nome={negocio.owner.name} tamanho="pequeno" />
            <span className="cartao-negocio-owner-nome">{negocio.owner.name}</span>
          </div>

          <div className="cartao-negocio-meta">
            {negocio.expectedCloseDate ? (
              <span
                className={`cartao-negocio-data${previsaoVencida ? " cartao-negocio-data--vencida" : ""}`}
                title={previsaoVencida ? "Previsão de fechamento em atraso" : "Previsão de fechamento"}
              >
                <Calendar size={12} aria-hidden="true" />
                <span>{formatarDataCurta(negocio.expectedCloseDate)}</span>
              </span>
            ) : null}
            <span
              className={parado ? "dias-na-etapa dias-na-etapa--parado" : "dias-na-etapa"}
              title={parado ? "Parado além do prazo da etapa" : "Dias nesta etapa"}
            >
              <Clock size={11} aria-hidden="true" />
              <span>{dias}d</span>
            </span>
          </div>
        </div>
      </article>

      {/* Modal de Detalhes do Lead */}
      {modalLeadAberto ? (
        <DetalhesDoLeadModal
          negocio={negocio}
          pipeline={pipeline}
          acoes={acoes}
          aoFechar={() => setModalLeadAberto(false)}
        />
      ) : null}
    </>
  );
}
