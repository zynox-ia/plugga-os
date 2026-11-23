import type { OcorrenciaDeTarefa } from "@plugga/shared";
import type { CSSProperties } from "react";

import { linhaDaOcorrencia, prazoDaOcorrencia, ROTULO_DA_EMPRESA_DA_TAREFA, type ConfiguracaoDeTarefas } from "../../lib/tarefas";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { ShellCard } from "../plugga-shell";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { AcoesDaTarefa, iconeDaOcorrencia, SeloDaTarefa, type AcoesDaOcorrencia } from "./partes";
import styles from "./tarefas.module.css";

const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/** A empresa da tarefa: o ponto da cor, ou "Plugga e Waze" quando vale para as duas. */
export function EmpresaDaTarefa({ empresa }: { empresa: OcorrenciaDeTarefa["empresa"] }) {
  return empresa === "ambas" ? <span>{ROTULO_DA_EMPRESA_DA_TAREFA.ambas}</span> : <EmpresaComPonto empresa={empresa} />;
}

/**
 * Lista no padrão das tabelas aprovadas: a tarefa à esquerda e o resto
 * centralizado, com o progresso do período no cabeçalho. Até 900 px vira cartão.
 */
export function ListaDeTarefas({ titulo, progresso, mostrarBarra, itens, hoje, config, aoAbrir, ...acoes }: {
  titulo: string;
  progresso: { texto: string; concluidas: number; total: number };
  /** Sem barra no período Atrasadas (todas pendentes). */
  mostrarBarra: boolean;
  itens: OcorrenciaDeTarefa[];
  hoje: string;
  config: ConfiguracaoDeTarefas;
  aoAbrir: (o: OcorrenciaDeTarefa) => void;
} & AcoesDaOcorrencia) {
  return <div className={`lista-negocios ${estilosLista.lista} ${styles.lista}`}>
    <ShellCard className={`table-card lista-negocios-card ${styles.cartaoTabela}`}>
      <div className={`card-heading ${styles.cabecalhoDaLista}`}>
        <div><h2>{titulo}</h2><span>{progresso.texto}</span></div>
        {mostrarBarra && progresso.total > 0 ? <div className={styles.progresso} role="progressbar" aria-label="Tarefas concluídas" aria-valuemin={0} aria-valuemax={progresso.total} aria-valuenow={progresso.concluidas}>
          <span style={{ width: `${(progresso.concluidas / progresso.total) * 100}%` }} />
        </div> : null}
      </div>
      <div className={`table-wrap ${styles.tabelaWrap}`} role="region" aria-label={titulo} tabIndex={0}>
        <table className={styles.tabela}>
          <caption className="sr-only">{titulo}, com o responsável, a empresa, o prazo e a situação</caption>
          <colgroup><col className={styles.cTarefa} /><col className={styles.cResp} /><col className={styles.cEmpresa} /><col className={styles.cPrazo} /><col className={styles.cSituacao} /><col className={styles.cAcoes} /></colgroup>
          <thead><tr><th scope="col">Tarefa</th><th scope="col">Responsável</th><th scope="col">Empresa</th><th scope="col">Prazo</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead>
          <tbody>{itens.map((o, i) => {
            const Icone = iconeDaOcorrencia(o);
            const prazo = prazoDaOcorrencia(o, hoje);
            return <tr key={o.id} className={styles.entra} style={{ "--i": i } as CSSProperties}>
              <td data-l="Tarefa"><div className={estilosLista.oportunidade}>
                <span className={`${estilosLista.iconeOportunidade} ${styles.iconeLinha}`} aria-hidden="true"><Icone size={16} /></span>
                <div className={`celula-lead-bloco ${styles.blocoTarefa}`}>
                  <button type="button" className={`lead-nome ${estilosLista.titulo} ${styles.nomeTarefa}`} title={o.titulo} onClick={() => aoAbrir(o)}>{o.titulo}</button>
                  <span className={`${estilosLista.codigo} ${styles.cortado}`} title={linhaDaOcorrencia(o)}>{o.categoria ? `${o.categoria} · ` : ""}{linhaDaOcorrencia(o)}</span>
                </div>
              </div></td>
              <td data-l="Responsável"><span className={styles.duasLinhas}><span>{primeiro(o.responsavel.nome)}</span>{o.substituto ? <small>substituto: {primeiro(o.substituto.nome)}</small> : null}</span></td>
              <td data-l="Empresa"><EmpresaDaTarefa empresa={o.empresa} /></td>
              <td data-l="Prazo"><span className={styles.duasLinhas}><span>{prazo.dia}</span><small className={prazo.tom ? styles.perigo : undefined}>{prazo.detalhe}</small></span></td>
              <td data-l="Situação"><SeloDaTarefa situacao={o.situacao} /></td>
              <td><AcoesDaTarefa ocorrencia={o} config={config} {...acoes} /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </ShellCard>
  </div>;
}
