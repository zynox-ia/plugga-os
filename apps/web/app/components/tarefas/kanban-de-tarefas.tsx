"use client";

import { colunasDoKanbanDeTarefas, type ColunaDoKanbanDeTarefas, type OcorrenciaDeTarefa } from "@plugga/shared";
import { CheckCircle2, Clock, Paperclip, TriangleAlert, UserRound } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { calcularLayoutKanban, ESPACO_COLUNAS_KANBAN } from "../../lib/layout-kanban";
import { prazoDaOcorrencia, type ConfiguracaoDeTarefas } from "../../lib/tarefas";
import estilosCartao from "../pipelines/cartao-de-negocio.module.css";
import { EmpresaDaTarefa } from "./lista-de-tarefas";
import { AcoesDaTarefa, iconeDaOcorrencia, type AcoesDaOcorrencia } from "./partes";
import styles from "./tarefas.module.css";

const COLUNAS: Record<ColunaDoKanbanDeTarefas, { nome: string; icone: typeof Clock }> = {
  pendentes: { nome: "Pendentes", icone: Clock },
  atrasadas: { nome: "Atrasadas", icone: TriangleAlert },
  concluidas: { nome: "Concluídas", icone: CheckCircle2 },
};

/**
 * Kanban em 3 colunas (Pendentes, Atrasadas, Concluídas). A contagem de cada
 * coluna vem da API: cada dia não feito de uma recorrente conta como uma
 * ocorrência atrasada. Sem arrastar: concluir pede resultado e evidência.
 */
export function KanbanDeTarefas({ itens, contagens, hoje, config, colunasRef, aoAbrir, ...acoes }: {
  itens: OcorrenciaDeTarefa[];
  contagens: Record<ColunaDoKanbanDeTarefas, number>;
  hoje: string;
  config: ConfiguracaoDeTarefas;
  colunasRef: RefObject<HTMLDivElement | null>;
  aoAbrir: (o: OcorrenciaDeTarefa) => void;
} & AcoesDaOcorrencia) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ReturnType<typeof calcularLayoutKanban> | null>(null);
  useLayoutEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    // Só 3 colunas: elas dividem a largura toda (como no protótipo), sem ficar mais estreitas que o padrão do quadro.
    const atualizar = () => {
      const base = calcularLayoutKanban(elemento.clientWidth, colunasDoKanbanDeTarefas.length);
      const n = colunasDoKanbanDeTarefas.length;
      const larguraColuna = Math.max(base.larguraColuna, Math.floor((elemento.clientWidth - (n - 1) * ESPACO_COLUNAS_KANBAN) / n));
      setLayout({ ...base, larguraColuna, larguraQuadro: larguraColuna * n + (n - 1) * ESPACO_COLUNAS_KANBAN });
    };
    atualizar();
    const observer = new ResizeObserver(atualizar);
    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);

  return <div className="quadro-area-colunas" ref={areaRef}>
    <div className="quadro-colunas" ref={colunasRef} tabIndex={0} role="region" aria-label="Situações das tarefas"
      style={{ "--espaco-colunas": `${ESPACO_COLUNAS_KANBAN}px`, ...(layout ? { "--largura-coluna": `${layout.larguraColuna}px`, "--largura-quadro": `${layout.larguraQuadro}px` } : {}) } as CSSProperties}>
      {colunasDoKanbanDeTarefas.map((coluna) => {
        const { nome, icone: Icone } = COLUNAS[coluna];
        const daColuna = itens.filter((o) => o.coluna === coluna);
        return <section key={coluna} className="coluna-etapa" aria-labelledby={`tarefas-${coluna}`} style={{ "--cor": "var(--ui-primary)" } as CSSProperties}>
          <header className="coluna-topo">
            <div className="coluna-titulo"><Icone size={16} className="coluna-titulo-icone" aria-hidden="true" /><h3 id={`tarefas-${coluna}`}>{nome}</h3></div>
            <span className="coluna-quantidade" aria-label={`${contagens[coluna]} ${contagens[coluna] === 1 ? "tarefa" : "tarefas"}`}>{String(contagens[coluna]).padStart(2, "0")}</span>
          </header>
          <div className="coluna-corpo" role="region" aria-label={`Tarefas ${nome.toLowerCase()}`} tabIndex={0}>
            {daColuna.length ? daColuna.map((o) => {
              const prazo = prazoDaOcorrencia(o, hoje);
              const IconeDaTarefa = iconeDaOcorrencia(o);
              const evidencias = o.conclusao?.evidencias.length ?? 0;
              return <div key={o.id} className={`${styles.cartaoQuadro} plg-lift`}>
                <article className={`cartao-negocio ${estilosCartao.cartao} ${styles.cartaoQuadro}`} aria-label={o.titulo}>
                  <header className={estilosCartao.cabecalho}>
                    <span className={`${estilosCartao.codigo} ${styles.prazoDoCartao}`}><IconeDaTarefa size={14} aria-hidden="true" /><span className={prazo.tom ? styles.perigo : undefined}>{prazo.dia} · {prazo.detalhe}</span></span>
                  </header>
                  <div className={estilosCartao.topo}><div className={estilosCartao.identidade}>
                    <h4 className={estilosCartao.titulo}><button type="button" onClick={() => aoAbrir(o)}>{o.titulo}</button></h4>
                    <p className={`${estilosCartao.cliente} ${styles.empresaDoCartao}`}><EmpresaDaTarefa empresa={o.empresa} /></p>
                  </div></div>
                  <footer className={`${estilosCartao.rodape} ${styles.rodapeDoCartao}`}>
                    <span className={styles.responsavel}><UserRound size={12} aria-hidden="true" />{o.responsavel.nome.split(/\s+/)[0]}</span>
                    {evidencias ? <span className={styles.anexo} title={`${evidencias} ${evidencias === 1 ? "evidência" : "evidências"}`}><Paperclip size={13} aria-hidden="true" /><span className="sr-only">com evidência</span></span> : null}
                    <span className={styles.espaco} />
                    <AcoesDaTarefa ocorrencia={o} config={config} {...acoes} />
                  </footer>
                </article>
              </div>;
            }) : <p className="coluna-vazia">Nada aqui</p>}
            {daColuna.length < contagens[coluna] ? <p className={styles.notaColuna}>Mostrando {daColuna.length} de {contagens[coluna]}.</p> : null}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
