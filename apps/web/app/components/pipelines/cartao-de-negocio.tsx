"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { formatarDiaMes } from "../../lib/format";
import { diasNaEtapa, estaParado, hojeNoFuso, valorCurto } from "../../lib/negocios";
import { Avatar, Icone } from "./icones";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";

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
        <Icone nome="mais_opcoes" />
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
                <Icone nome="check" tamanho={14} /> {pipeline.wonLabel}
              </button>
              <button type="button" role="menuitem" className="menu-negocio--perdido" onClick={escolher(() => acoes.perder(negocio))}>
                <Icone nome="x" tamanho={14} /> {pipeline.lostLabel}
              </button>
              <button type="button" role="menuitem" onClick={escolher(() => acoes.transferir(negocio))}>
                <Icone nome="seta" tamanho={14} /> Mover para outro pipeline
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
  const previsaoVencida = negocio.expectedCloseDate !== null && negocio.expectedCloseDate < hojeNoFuso();

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
      <div className="cartao-negocio-topo">
        <h4>{negocio.title}</h4>
        <MenuDoNegocio negocio={negocio} pipeline={pipeline} acoes={acoes} />
      </div>
      <p className="cartao-negocio-cliente">
        {negocio.client.name}
        {negocio.contact ? <span> · {negocio.contact.name}</span> : null}
      </p>
      <div className="cartao-negocio-valor">
        <b>{negocio.value ? valorCurto(Number(negocio.value)) : "Sem valor"}</b>
        {negocio.expectedCloseDate ? (
          <span className={previsaoVencida ? "previsao previsao--vencida" : "previsao"} title="Previsão de fechamento">
            <Icone nome="calendario" tamanho={12} />
            {formatarDiaMes(`${negocio.expectedCloseDate}T12:00:00Z`)}
          </span>
        ) : null}
      </div>
      {negocio.tags.length > 0 ? (
        <div className="cartao-negocio-etiquetas">
          {negocio.tags.map((t) => (
            <span key={t.id} className="etiqueta" style={{ "--cor": t.color } as CSSProperties}>
              {t.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="cartao-negocio-rodape">
        <span className={parado ? "dias-na-etapa dias-na-etapa--parado" : "dias-na-etapa"} title={parado ? "Parado além do prazo da etapa" : "Dias nesta etapa"}>
          <Icone nome="relogio" tamanho={12} />
          {parado ? `Parado há ${dias}d` : `${dias}d na etapa`}
        </span>
        <Avatar id={negocio.owner.id} nome={negocio.owner.name} tamanho="pequeno" />
      </div>
    </article>
  );
}
