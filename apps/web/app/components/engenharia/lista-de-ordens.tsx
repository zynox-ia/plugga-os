import type { OrdemDeServicoResumo } from "@plugga/shared";
import { Eye } from "lucide-react";
import type { CSSProperties } from "react";

import { primeiroNome, ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { ShellCard } from "../plugga-shell";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import styles from "./engenharia.module.css";
import { AgendaDaOrdem, IconeDoTipo, SeloDaEtapa } from "./partes";

/**
 * Lista no padrão das tabelas aprovadas: a primeira coluna à esquerda e as
 * demais centralizadas, sem rolagem lateral. A linha inteira abre a ficha.
 */
export function ListaDeOrdens({ ordens, total, resumo, hoje, aoAbrir }: {
  ordens: OrdemDeServicoResumo[];
  total: number;
  /** "2 atrasadas · 3 para agendar". */
  resumo: string;
  hoje: string;
  aoAbrir: (id: string) => void;
}) {
  return <div className={`lista-negocios ${estilosLista.lista} ${styles.lista}`}>
    <ShellCard className={`table-card lista-negocios-card ${styles.cartaoTabela}`}>
      <div className="card-heading"><div className={estilosLista.cabecalhoTabela}><div>
        <h2>{total === 1 ? "1 ordem de serviço" : `${total} ordens de serviço`}</h2>
        {resumo ? <span>{resumo}</span> : null}
      </div></div></div>
      <div className={`table-wrap ${styles.tabelaWrap}`} role="region" aria-label="Ordens de serviço" tabIndex={0}>
        <table className={styles.tabela}>
          <caption className="sr-only">Ordens de serviço, com o tipo, o técnico, a agenda e a etapa</caption>
          <colgroup><col className={styles.cOrdem} /><col className={styles.cTipo} /><col className={styles.cTecnico} /><col className={styles.cAgenda} /><col className={styles.cEtapa} /><col className={styles.cAcao} /></colgroup>
          <thead><tr>
            <th scope="col">Ordem de serviço</th><th scope="col">Tipo</th><th scope="col">Técnico</th><th scope="col">Agenda</th><th scope="col">Etapa</th><th scope="col">Ações</th>
          </tr></thead>
          <tbody>{ordens.map((o, indice) => <tr key={o.id} className={styles.entra} style={{ "--i": indice } as CSSProperties} tabIndex={0}
            onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) aoAbrir(o.id); }}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); aoAbrir(o.id); } }}>
            <td data-l="Ordem de serviço"><div className={estilosLista.oportunidade}>
              <span className={`${estilosLista.iconeOportunidade} ${styles.iconeLinha}`} aria-hidden="true"><IconeDoTipo tipo={o.tipo} tamanho={16} /></span>
              <div className={`celula-lead-bloco ${styles.blocoOrdem}`}>
                <button type="button" className={`lead-nome ${estilosLista.titulo} ${styles.nomeOrdem}`} title={o.cliente.nome} onClick={() => aoAbrir(o.id)}>{o.cliente.nome}</button>
                <span className={`${estilosLista.codigo} ${styles.linhaCodigo}`} title={o.descricao}>
                  <span className={styles.cortado}>{o.descricao}</span><span aria-hidden="true">·</span><span>{o.codigo}</span><span aria-hidden="true">·</span><EmpresaComPonto empresa={o.empresa} curto />
                </span>
              </div>
            </div></td>
            <td data-l="Tipo">{ROTULO_DO_TIPO[o.tipo]}</td>
            <td data-l="Técnico"><span className={styles.duasLinhas}>
              <span className={o.tecnico ? undefined : styles.semTecnico}>{o.tecnico ? primeiroNome(o.tecnico.nome) : "Sem técnico"}</span>
              {o.apoio ? <small>apoio: {primeiroNome(o.apoio.nome)}</small> : null}
            </span></td>
            <td data-l="Agenda"><AgendaDaOrdem ordem={o} hoje={hoje} centro /></td>
            <td data-l="Etapa"><SeloDaEtapa situacao={o.situacao} /></td>
            <td><div className={estilosLista.acoesLinha}>
              <Button variant="secondary" size="sm" iconOnly icon={<Eye size={15} />} className={styles.olho} aria-label={`Ver ${o.codigo}`} title="Ver a O.S." onClick={() => aoAbrir(o.id)} />
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </ShellCard>
  </div>;
}
