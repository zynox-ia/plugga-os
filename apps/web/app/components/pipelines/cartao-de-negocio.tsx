"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { ArrowRight, CalendarDays, Check, Clock, Eye, FileText, MoreHorizontal, User, UserCheck, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { diasNaEtapa, estaParado, negocioConvertido } from "../../lib/negocios";
import { formatarDataHora, FUSO_HORARIO } from "../../lib/format";
import { Avatar } from "./icones";

import type { AcoesDoNegocio } from "./quadro-do-pipeline";
import { SeletorBadgePrioridade } from "./seletor-badge-prioridade";
import styles from "./cartao-de-negocio.module.css";

const formatoChegada = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: FUSO_HORARIO });
const STATUS_DO_LEAD = { open: "Em aberto", won: "Contrato assinado", lost: "Perdido" } as const;

export function MenuDoNegocio({
  negocio,
  pipeline,
  acoes,
  aoVerLead,
  menuClassName = "",
  mostrarPrioridade = false,
}: {
  negocio: Deal;
  pipeline: Pipeline;
  acoes: AcoesDoNegocio;
  aoVerLead?: () => void;
  menuClassName?: string;
  mostrarPrioridade?: boolean;
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
        aria-label={`Ações de ${negocio.lead.name}`}
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
              aria-label={`Ações de ${negocio.lead.name}`}
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

              {mostrarPrioridade ? (
                <>
                  <span className="menu-negocio-titulo">Prioridade</span>
                  {(
                    [
                      { valor: null, rotulo: "Sem prioridade" },
                      { valor: "urgente", rotulo: "Urgente" },
                      { valor: "medio", rotulo: "Médio" },
                      { valor: "normal", rotulo: "Normal" },
                    ] as const
                  ).map((opcao) => (
                    <button
                      key={opcao.rotulo}
                      type="button"
                      role="menuitemradio"
                      aria-checked={negocio.priority === opcao.valor}
                      onClick={escolher(() => void acoes.definirPrioridade(negocio, opcao.valor))}
                    >
                      {negocio.priority === opcao.valor ? <Check size={14} aria-hidden="true" /> : <span style={{ width: 14 }} aria-hidden="true" />}
                      {opcao.rotulo}
                    </button>
                  ))}
                  <span className="menu-negocio-divisor" role="separator" />
                </>
              ) : null}
              {negocio.status === "open" ? (
                <>
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
                  {!negocioConvertido(negocio) && acoes.converter ? (
                    <button type="button" role="menuitem" disabled={Boolean(acoes.convertendoId)} onClick={escolher(() => acoes.converter?.(negocio))}>
                      <UserCheck size={14} aria-hidden="true" /> {acoes.convertendoId === negocio.id ? "Convertendo…" : "Converter em cliente"}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Cartão compacto: identificação, etiquetas e acompanhamento do atendimento. */
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
  aoComecarArrasto: (elemento: HTMLElement) => void;
  aoTerminarArrasto: () => void;
}) {

  const arrastou = useRef(false);
  const dias = diasNaEtapa(negocio);
  const parado = estaParado(negocio, pipeline);

  return (
    <>
      <article
        className={`cartao-negocio ${styles.cartao}${arrastando ? " cartao-negocio--arrastando" : ""}${parado ? " cartao-negocio--parado" : ""}`}
        aria-label={`Lead ${negocio.lead.name}`}
        draggable
        onDragStart={(evento) => {
          arrastou.current = true;
          evento.dataTransfer.effectAllowed = "move";
          evento.dataTransfer.setData("text/plain", negocio.id);
          aoComecarArrasto(evento.currentTarget);
        }}
        onDragEnd={() => {
          setTimeout(() => { arrastou.current = false; }, 100);
          aoTerminarArrasto();
        }}
        onClick={(e) => {
          if (arrastou.current || (e.target as HTMLElement).closest("button")) return;
          acoes.abrirDetalhes(negocio);
        }}
      >
        <header className={styles.cabecalho}>
          <span className={styles.codigo} title={`Identificador abreviado. ID completo: ${negocio.id}`}>
            <FileText size={14} aria-hidden="true" />
            <span>PLU-{String(negocio.number).padStart(4, "0")}</span>
          </span>
          <div className={styles.acoesCabecalho}>
            <SeletorBadgePrioridade nome={negocio.lead.name} value={negocio.priority ?? ""} onChange={(prioridade) => void acoes.definirPrioridade(negocio, prioridade || null)} />
            <MenuDoNegocio negocio={negocio} pipeline={pipeline} acoes={acoes} aoVerLead={() => acoes.abrirDetalhes(negocio)} menuClassName={styles.menuVidro} />
          </div>
        </header>
        <div className={styles.topo}>
          <div className={styles.identidade}>
            <h4 className={styles.titulo}>
              <button type="button" aria-label={`Ver lead ${negocio.lead.name}`} onClick={() => acoes.abrirDetalhes(negocio)}>
                {negocio.lead.name}
              </button>
            </h4>
            <p className={styles.cliente} title={negocio.title}>
              <User size={12} aria-hidden="true" />
              <span>{negocio.title}</span>
            </p>
          </div>
        </div>

        <div className={styles.metadados}>
          <span className={styles.chegada} title={`Chegada em ${formatarDataHora(negocio.createdAt)}`}>
            <span className={styles.calendario}><CalendarDays size={14} aria-hidden="true" /></span>
            <time dateTime={negocio.createdAt}>{formatoChegada.format(new Date(negocio.createdAt))}</time>
          </span>
          <span className={styles.status} data-status={negocio.status}>{STATUS_DO_LEAD[negocio.status]}</span>
        </div>

        {negocio.tags.length > 0 ? (
          <div className={styles.etiquetas}>
            {negocio.tags.map((tag) => (
              <span key={tag.id} className={styles.etiqueta} style={{ "--cor-etiqueta": tag.color } as CSSProperties}>
                {tag.name}
              </span>
            ))}
          </div>
        ) : null}

        <footer className={styles.rodape}>
          <div className={styles.responsavel} title={`Responsável: ${negocio.owner.name}`}>
            <Avatar id={negocio.owner.id} nome={negocio.owner.name} tamanho="pequeno" />
            <span>{negocio.owner.name}</span>
          </div>
          <span className={`${styles.dias}${parado ? ` ${styles.parado}` : ""}`} title={parado ? "Parado além do prazo configurado nesta etapa" : "Tempo nesta etapa"}>
            <Clock size={12} aria-hidden="true" />
            {parado ? `Parado há ${dias}d` : `${dias}d na etapa`}
          </span>
        </footer>
      </article>
    </>
  );
}
