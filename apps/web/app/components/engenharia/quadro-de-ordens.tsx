"use client";

import { DIAS_DE_CONCLUIDAS_NO_QUADRO, type OrdemDeServicoResumo, type QuadroDeOrdensResposta } from "@plugga/shared";
import { CalendarDays, Kanban } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { calcularLayoutKanban, ESPACO_COLUNAS_KANBAN } from "../../lib/layout-kanban";
import { agendaDaOrdem, primeiroNome, ROTULO_DA_COLUNA, ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import estilosCartao from "../pipelines/cartao-de-negocio.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import styles from "./engenharia.module.css";
import { IconeDoTipo } from "./partes";

function CartaoDeOrdem({ ordem, hoje, aoAbrir }: { ordem: OrdemDeServicoResumo; hoje: string; aoAbrir: (id: string) => void }) {
  const agenda = agendaDaOrdem(ordem, hoje);
  const quando = [agenda.dia, agenda.detalhe].filter(Boolean).join(" · ");
  return <article className={`cartao-negocio ${estilosCartao.cartao} ${styles.cartaoQuadro}`} aria-label={`${ordem.codigo}: ${ordem.cliente.nome}`}>
    <header className={estilosCartao.cabecalho}>
      <span className={estilosCartao.codigo}><IconeDoTipo tipo={ordem.tipo} tamanho={14} /><span>{ordem.codigo}</span></span>
      <EmpresaComPonto empresa={ordem.empresa} curto className={styles.empresaQuadro} />
    </header>
    <div className={estilosCartao.topo}><div className={estilosCartao.identidade}>
      <h4 className={estilosCartao.titulo}><button type="button" onClick={() => aoAbrir(ordem.id)}>{ordem.cliente.nome}</button></h4>
      <p className={estilosCartao.cliente} title={`${ROTULO_DO_TIPO[ordem.tipo]} · ${ordem.descricao}`}><span>{ROTULO_DO_TIPO[ordem.tipo]} · {ordem.descricao}</span></p>
    </div></div>
    <footer className={estilosCartao.rodape}>
      <span className={`${styles.quandoQuadro} ${agenda.tom === "atraso" ? styles.atraso : agenda.tom === "aviso" ? styles.aviso : ""}`} title={quando}>
        <CalendarDays size={13} aria-hidden="true" /><span>{quando}</span>
      </span>
      <span className={`${styles.pilula} ${ordem.tecnico ? "" : styles.semTecnico}`} title={ordem.tecnico ? `Técnico: ${ordem.tecnico.nome}` : undefined}>{ordem.tecnico ? primeiroNome(ordem.tecnico.nome) : "Sem técnico"}</span>
    </footer>
  </article>;
}

/**
 * Quadro com as 6 colunas do ciclo (as canceladas ficam fora, na lista com o
 * filtro). Sem arrastar: a O.S. avança pela ação da ficha, porque cada passagem
 * exige um dado (técnico e data, check-in, laudo com fotos, termo).
 */
export function QuadroDeOrdens({ colunas, hoje, colunasRef, aoAbrir }: {
  colunas: QuadroDeOrdensResposta["colunas"];
  hoje: string;
  colunasRef: RefObject<HTMLDivElement | null>;
  aoAbrir: (id: string) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ReturnType<typeof calcularLayoutKanban> | null>(null);

  useLayoutEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    const atualizar = () => setLayout(calcularLayoutKanban(elemento.clientWidth, colunas.length));
    atualizar();
    const observer = new ResizeObserver(atualizar);
    observer.observe(elemento);
    return () => observer.disconnect();
  }, [colunas.length]);

  return <div className="quadro-area-colunas" ref={areaRef}>
    <div className="quadro-colunas" ref={colunasRef} tabIndex={0} role="region" aria-label="Etapas das ordens de serviço"
      style={{ "--espaco-colunas": `${ESPACO_COLUNAS_KANBAN}px`, ...(layout ? { "--largura-coluna": `${layout.larguraColuna}px`, "--largura-quadro": `${layout.larguraQuadro}px` } : {}) } as CSSProperties}>
      {colunas.map((coluna) => {
        const nome = ROTULO_DA_COLUNA[coluna.coluna];
        return <section key={coluna.coluna} className="coluna-etapa" aria-labelledby={`coluna-os-${coluna.coluna}`} style={{ "--cor": "var(--ui-primary)" } as CSSProperties}>
          <header className="coluna-topo">
            <div className="coluna-titulo"><Kanban size={16} className="coluna-titulo-icone" aria-hidden="true" /><h3 id={`coluna-os-${coluna.coluna}`}>{nome}</h3></div>
            <span className="coluna-quantidade" aria-label={`${coluna.quantidade} ordens de serviço`}>{String(coluna.quantidade).padStart(2, "0")}</span>
          </header>
          <div className="coluna-meta">
            {coluna.atrasadas > 0 ? <span className={styles.notaColuna}>{coluna.atrasadas} {coluna.atrasadas === 1 ? "atrasada" : "atrasadas"}</span>
              : coluna.coluna === "concluidas" ? <span className={styles.notaColuna} title={`Concluídas nos últimos ${DIAS_DE_CONCLUIDAS_NO_QUADRO} dias`}>últimos {DIAS_DE_CONCLUIDAS_NO_QUADRO} dias</span> : null}
          </div>
          <div className="coluna-corpo" role="region" aria-label={`Ordens de serviço em ${nome}`} tabIndex={0}>
            {coluna.ordens.length > 0
              ? coluna.ordens.map((ordem) => <div key={ordem.id} className={`${styles.cartaoQuadro} plg-lift`}><CartaoDeOrdem ordem={ordem} hoje={hoje} aoAbrir={aoAbrir} /></div>)
              : <p className="coluna-vazia">Nenhuma O.S. nesta etapa</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
