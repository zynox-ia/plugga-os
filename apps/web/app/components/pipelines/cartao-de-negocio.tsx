"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { ArrowRight, Calendar, Check, Clock, Eye, MoreHorizontal, User, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { diasNaEtapa, estaParado, hojeNoFuso, valorCurto } from "../../lib/negocios";
import { Avatar } from "./icones";
import { DetalhesDoLeadModal } from "./detalhes-do-lead-modal";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";

function formatarDataCompleta(dataStr: string | null): string {
  if (!dataStr) return "";
  const d = new Date(`${dataStr.slice(0, 10)}T12:00:00Z`);
  if (isNaN(d.getTime())) return dataStr;
  const dia = d.getUTCDate();
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mes = meses[d.getUTCMonth()];
  const ano = d.getUTCFullYear();
  return `${dia} ${mes}, ${ano}`;
}

export function MenuDoNegocio({
  negocio,
  pipeline,
  acoes,
  aoVerLead,
  menuClassName = "",
}: {
  negocio: Deal;
  pipeline: Pipeline;
  acoes: AcoesDoNegocio;
  aoVerLead?: () => void;
  menuClassName?: string;
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
        className="botao-icone cartao-negocio-menu-btn"
        aria-label={`Ações de ${negocio.title}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={(e) => {
          e.stopPropagation();
          setPosicao(null);
          setAberto((a) => !a);
        }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {aberto
        ? createPortal(
            <div
              ref={menu}
              className={`menu-negocio-lista ${menuClassName}`}
              role="menu"
              aria-label={`Ações de ${negocio.title}`}
              style={posicao ? { top: posicao.top, left: posicao.left } : { visibility: "hidden" }}
            >
              {aoVerLead ? (
                <>
                  <button type="button" role="menuitem" onClick={escolher(aoVerLead)}>
                    <Eye size={14} aria-hidden="true" /> Ver detalhes do lead
                  </button>
                  {negocio.status === "open" ? <span className="menu-negocio-divisor" role="separator" /> : null}
                </>
              ) : null}

              {negocio.status === "open" ? <>
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
              </> : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Card do Kanban do CRM ampliado e com distribuição generosa de espaço:
 * - Área espaçosa para leitura confortável.
 * - Topo com tags reais, status de parado e menu de ações.
 * - Título proeminente e dados do cliente/contato.
 * - Destaque ao valor financeiro do negócio.
 * - Rodapé organizado com avatar e nome do responsável, previsão de fechamento e botão de ação 'Ver lead'.
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
        className={`cartao-negocio cartao-negocio--ampliado${arrastando ? " cartao-negocio--arrastando" : ""}${parado ? " cartao-negocio--parado" : ""}`}
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
        {/* Bloco 1: Topo com Tags, Alerta de Parado e Ações */}
        <div className="cartao-negocio-topo">
          <div className="cartao-negocio-tags-area">
            {negocio.tags.map((tag) => (
              <span
                key={tag.id}
                className="cartao-negocio-tag"
                style={{
                  borderLeftColor: tag.color,
                  backgroundColor: `${tag.color}14`,
                  color: "#0F294A",
                }}
              >
                {tag.name}
              </span>
            ))}
            {parado ? (
              <span className="cartao-negocio-alerta-parado" title="Parado além do prazo configurado nesta etapa">
                <Clock size={12} aria-hidden="true" />
                <span>Parado há {dias}d</span>
              </span>
            ) : (
              <span className="cartao-negocio-dias" title="Tempo nesta etapa">
                <Clock size={12} aria-hidden="true" />
                <span>{dias}d na etapa</span>
              </span>
            )}
          </div>

          <div className="cartao-negocio-topo-acoes">
            <MenuDoNegocio
              negocio={negocio}
              pipeline={pipeline}
              acoes={acoes}
              aoVerLead={() => setModalLeadAberto(true)}
            />
          </div>
        </div>

        {/* Bloco 2: Título da Oportunidade e Dados do Cliente */}
        <div className="cartao-negocio-corpo">
          <h4 className="cartao-negocio-titulo">{negocio.title}</h4>
          <div className="cartao-negocio-cliente-info">
            <User size={13} className="cartao-negocio-cliente-icone" aria-hidden="true" />
            <span className="cartao-negocio-cliente-nome">{negocio.client.name}</span>
            {negocio.contact ? (
              <span className="cartao-negocio-contato-nome">· {negocio.contact.name}</span>
            ) : null}
          </div>
        </div>

        {/* Bloco 3: Valor Comercial e Previsão */}
        <div className="cartao-negocio-destaque-linha">
          {negocio.value ? (
            <div className="cartao-negocio-valor-bloco">
              <span className="cartao-negocio-valor-label">{pipeline.valueLabel || "Valor"}</span>
              <span className="cartao-negocio-valor">
                {valorCurto(Number(negocio.value))}
              </span>
            </div>
          ) : (
            <div className="cartao-negocio-valor-bloco">
              <span className="cartao-negocio-valor-label">Sem valor</span>
              <span className="cartao-negocio-valor-vazio">—</span>
            </div>
          )}

          {negocio.expectedCloseDate ? (
            <div className="cartao-negocio-previsao-bloco">
              <span className="cartao-negocio-previsao-label">Previsão</span>
              <div
                className={`cartao-negocio-previsao-tag${previsaoVencida ? " cartao-negocio-previsao-tag--vencida" : ""}`}
                title={previsaoVencida ? "Previsão de fechamento em atraso" : "Previsão de fechamento"}
              >
                <Calendar size={12} aria-hidden="true" />
                <span>{formatarDataCompleta(negocio.expectedCloseDate)}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Bloco 4: Rodapé Espaçoso com Responsável e Botão 'Ver lead' */}
        <div className="cartao-negocio-rodape">
          <div className="cartao-negocio-owner-box" title={`Responsável: ${negocio.owner.name}`}>
            <Avatar id={negocio.owner.id} nome={negocio.owner.name} tamanho="pequeno" />
            <div className="cartao-negocio-owner-detalhe">
              <span className="cartao-negocio-owner-cargo">Responsável</span>
              <span className="cartao-negocio-owner-nome">{negocio.owner.name}</span>
            </div>
          </div>

          <button
            type="button"
            className="cartao-negocio-btn-ver-destacado"
            aria-label={`Ver lead ${negocio.title}`}
            title="Ver detalhes completos do lead"
            onClick={(e) => {
              e.stopPropagation();
              setModalLeadAberto(true);
            }}
          >
            <Eye size={14} aria-hidden="true" />
            <span>Ver lead</span>
          </button>
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
