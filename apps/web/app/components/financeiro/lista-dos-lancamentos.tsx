"use client";

import type { LancamentoResumo } from "@plugga/shared";
import { ArrowDownLeft, Eye, Receipt } from "lucide-react";
import type { CSSProperties } from "react";

import { valorEmReais } from "../../lib/compras";
import { prazoDoLancamento, resumoDoLancamento, rotuloDoValor, seloDaEtapa, somaDoTipo, temPendenciaNoOmie } from "../../lib/financeiro";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { ShellCard, ShellTable } from "../plugga-shell";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import styles from "./lancamentos.module.css";
import { rotuloDoTipo, SetaDoTipo } from "./partes";

/**
 * Lista dos Lançamentos no padrão das tabelas aprovadas (Equipe e a lista de
 * negócios do CRM): a 1ª coluna à esquerda, as demais ao centro, ações em 100 px;
 * no celular, cada linha vira um card com o rótulo da coluna.
 */
export function ListaDosLancamentos({ itens, total, aoAbrir }: { itens: LancamentoResumo[]; total: number; aoAbrir: (id: string) => void }) {
  const entradas = valorEmReais(somaDoTipo(itens, "entrada")) ?? "R$ 0,00";
  const saidas = valorEmReais(somaDoTipo(itens, "saida")) ?? "R$ 0,00";
  // Com o teto da lista, os totais são só dos carregados: a frase diz isso.
  const recorte = total > itens.length ? ` nos ${itens.length} mostrados` : "";
  return <div className={`lista-negocios ${estilosLista.lista} ${styles.lista}`}>
    <ShellCard className="table-card lista-negocios-card">
      <div className="card-heading"><div className={estilosLista.cabecalhoTabela}>
        <div><h2>{total === 1 ? "1 lançamento" : `${total} lançamentos`}</h2><span>{entradas} em entradas · {saidas} em saídas{recorte}</span></div>
      </div></div>
      <div className={estilosLista.rolagemTabela} role="region" aria-label="Lançamentos" tabIndex={0}>
        <ShellTable caption="Lançamentos">
          <thead><tr><th scope="col">Lançamento</th><th scope="col">Valor</th><th scope="col">Vencimento</th><th scope="col">Etapa</th><th scope="col">Ações</th></tr></thead>
          <tbody>{itens.map((l, indice) => {
            const prazo = prazoDoLancamento(l);
            const selo = seloDaEtapa(l);
            const Icone = l.tipo === "saida" ? Receipt : ArrowDownLeft;
            return <tr key={l.id} className={styles.entra} style={{ "--i": indice } as CSSProperties}
              onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) aoAbrir(l.id); }}>
              <td data-l="Lançamento"><div className={estilosLista.oportunidade}>
                <span className={estilosLista.iconeOportunidade} aria-hidden="true"><Icone size={16} /></span>
                <div className="celula-lead-bloco">
                  <button type="button" className={`lead-nome ${estilosLista.titulo}`} title={l.favorecido.nome} onClick={() => aoAbrir(l.id)}>{l.favorecido.nome}</button>
                  <span className={`${estilosLista.codigo} ${styles.codigoComEmpresa}`}><span className={styles.textoSecundario} title={`${l.codigo} · ${resumoDoLancamento(l)}`}>{l.codigo} · {resumoDoLancamento(l)}</span><EmpresaComPonto empresa={l.empresa} curto className={styles.empresaDaLinha} /></span>
                </div>
              </div></td>
              <td data-l="Valor"><div className={estilosLista.valor}>
                <strong><span className={styles.seta} title={rotuloDoTipo(l.tipo)}><SetaDoTipo tipo={l.tipo} tamanho={13} /></span>{valorEmReais(l.valor)}</strong>
                <small>{rotuloDoValor(l)}</small>
              </div></td>
              <td data-l="Vencimento"><div className={estilosLista.valor}>
                <strong>{prazo.data}</strong>
                {prazo.relativo ? <small className={prazo.tom ? styles[prazo.tom] : undefined}>{prazo.relativo}</small> : null}
              </div></td>
              <td data-l="Etapa"><div className={estilosLista.etapa}>
                <span className="ui-badge ui-tone--neutral" title={selo.completo}>{selo.completo}</span>
                {temPendenciaNoOmie(l) ? <small className={styles.perigo}>{l.omie.estado === "erro" ? "Não foi ao OMIE" : "Diferente no OMIE"}</small> : null}
              </div></td>
              <td><div className={estilosLista.acoesLinha}><Button variant="secondary" size="sm" iconOnly icon={<Eye size={14} />} aria-label={`Ver ${l.codigo}`} onClick={() => aoAbrir(l.id)} /></div></td>
            </tr>;
          })}</tbody>
        </ShellTable>
      </div>
      <nav className="lista-paginacao" aria-label="Paginação dos lançamentos">
        <span className="lista-paginacao-info" role="status">
          {total > itens.length
            ? <>Mostrando os <strong>{itens.length}</strong> primeiros de <strong>{total}</strong> lançamentos. Use os filtros para ver os demais.</>
            : <>Mostrando <strong>{itens.length}</strong> {itens.length === 1 ? "lançamento" : "lançamentos"}</>}
        </span>
      </nav>
    </ShellCard>
  </div>;
}
