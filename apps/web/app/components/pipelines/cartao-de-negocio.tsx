"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { ArrowRight, Check, CheckSquare, Clock, MoreHorizontal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { diasNaEtapa, estaParado, hojeNoFuso, valorCurto } from "../../lib/negocios";
import { Avatar } from "./icones";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";

function formatarDue(dataStr: string | null): string {
  if (!dataStr) return "Sem data";
  const d = new Date(`${dataStr.slice(0, 10)}T12:00:00Z`);
  if (isNaN(d.getTime())) return dataStr;
  const dia = d.getUTCDate();
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mes = meses[d.getUTCMonth()];
  const ano = d.getUTCFullYear();
  return `${dia} ${mes}, ${ano}`;
}

/**
 * Ações do negócio aberto pelo teclado ou pelo mouse: a alternativa ao arrastar
 * para mudar de etapa, ganhar, perder ou mover para outro pipeline. O menu
 * abre num portal no <body>, em posição fixa calculada a partir do botão: a
 * coluna rola e o painel tem backdrop-filter, que prenderia um `fixed` dentro
 * dele. O menu acompanha o botão durante a rolagem e fecha quando ele deixa de estar visível.
 */
export function MenuDoNegocio({ negocio, pipeline, acoes }: { negocio: Deal; pipeline: Pipeline; acoes: AcoesDoNegocio }) {
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

  // Abre abaixo do botão; sem espaço embaixo, abre acima. Sempre dentro da janela.
  useLayoutEffect(() => {
    if (!aberto || !botao.current) return;
    // Considera também o recorte das colunas e de outros contêineres com overflow.
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
        onClick={() => {
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
  const dias = diasNaEtapa(negocio);
  const parado = estaParado(negocio, pipeline);
  const hoje = hojeNoFuso();
  const previsaoVencida = negocio.expectedCloseDate !== null && negocio.expectedCloseDate < hoje;

  const etapaIndex = pipeline.stages.findIndex((e) => e.id === negocio.stageId);
  const etapaNumero = etapaIndex >= 0 ? etapaIndex + 1 : 1;

  // Prioridade / Tag baseada em regras ou tags do negócio
  const primeiraTag = negocio.tags[0];
  let prioridadeTom: "alta" | "media" | "baixa" = "baixa";
  let prioridadeRotulo = "Low";

  if (primeiraTag) {
    const nomeNorm = primeiraTag.name.toLowerCase();
    if (nomeNorm.includes("alta") || nomeNorm.includes("high")) {
      prioridadeTom = "alta";
      prioridadeRotulo = "High";
    } else if (nomeNorm.includes("baixa") || nomeNorm.includes("low")) {
      prioridadeTom = "baixa";
      prioridadeRotulo = "Low";
    } else if (nomeNorm.includes("media") || nomeNorm.includes("média") || nomeNorm.includes("medium")) {
      prioridadeTom = "media";
      prioridadeRotulo = "Medium";
    } else {
      prioridadeTom = "media";
      prioridadeRotulo = primeiraTag.name;
    }
  } else if (parado) {
    prioridadeTom = "alta";
    prioridadeRotulo = "High";
  } else if (negocio.value && Number(negocio.value) >= 50000) {
    prioridadeTom = "alta";
    prioridadeRotulo = "High";
  } else if (negocio.value && Number(negocio.value) >= 15000) {
    prioridadeTom = "media";
    prioridadeRotulo = "Medium";
  } else {
    prioridadeTom = "baixa";
    prioridadeRotulo = "Low";
  }

  return (
    <article
      className={`cartao-negocio${arrastando ? " cartao-negocio--arrastando" : ""}${parado ? " cartao-negocio--parado" : ""}`}
      aria-label={`Negócio ${negocio.title}`}
      draggable
      onDragStart={(evento) => {
        evento.dataTransfer.effectAllowed = "move";
        evento.dataTransfer.setData("text/plain", negocio.id);
        aoComecarArrasto();
      }}
      onDragEnd={aoTerminarArrasto}
    >
      {/* 1. Topo: Due Date + Menu */}
      <div className="cartao-negocio-topo">
        <div className={`cartao-negocio-due${previsaoVencida ? " cartao-negocio-due--vencida" : ""}`}>
          <Clock size={12} aria-hidden="true" />
          <span>Due: {negocio.expectedCloseDate ? formatarDue(negocio.expectedCloseDate) : "Sem prazo"}</span>
        </div>
        <MenuDoNegocio negocio={negocio} pipeline={pipeline} acoes={acoes} />
      </div>

      {/* 2. Título & Subtítulo */}
      <div className="cartao-negocio-corpo">
        <h4>{negocio.title}</h4>
        <p className="cartao-negocio-cliente">
          {negocio.client.name}
          {negocio.contact ? <span> · {negocio.contact.name}</span> : null}
        </p>
      </div>

      {/* 3. Milestone / Etapa */}
      <div className="cartao-negocio-milestone">
        <CheckSquare size={13} className="cartao-negocio-milestone-icone" aria-hidden="true" />
        <span>Milestone {etapaIndex >= 0 ? etapaIndex : 0}/{pipeline.stages.length}</span>
        {negocio.value ? <span className="cartao-negocio-milestone-valor">· {valorCurto(Number(negocio.value))}</span> : null}
      </div>

      {/* 4. Assigned for */}
      <div className="cartao-negocio-assigned">
        <span className="cartao-negocio-assigned-rotulo">Assigned for</span>
        <div className="cartao-negocio-assigned-avatares">
          <Avatar id={negocio.owner.id} nome={negocio.owner.name} tamanho="pequeno" />
        </div>
      </div>

      {/* 5. Rodapé: Prioridade + Código/Dias */}
      <div className="cartao-negocio-rodape">
        <div className={`cartao-negocio-prioridade cartao-negocio-prioridade--${prioridadeTom}`}>
          <span className="cartao-negocio-prioridade-icone" aria-hidden="true">▲</span>
          <span>{prioridadeRotulo}</span>
        </div>

        <div className="cartao-negocio-meta">
          <span className="cartao-negocio-codigo">#{etapaNumero}</span>
          <span className={parado ? "dias-na-etapa dias-na-etapa--parado" : "dias-na-etapa"} title={parado ? "Parado além do prazo da etapa" : "Dias nesta etapa"}>
            <Clock size={11} aria-hidden="true" />
            {parado ? `Parado há ${dias}d` : `${dias}d`}
          </span>
        </div>
      </div>
    </article>
  );
}
