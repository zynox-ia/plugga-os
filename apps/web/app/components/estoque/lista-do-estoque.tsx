import { rotulosDaCategoriaDeItemDeEstoque, type ItemDeEstoqueNaLista } from "@plugga/shared";
import { ArrowRight, Package } from "lucide-react";
import type { CSSProperties } from "react";

import { valorEmReais } from "../../lib/compras";
import { qtd, qtdOuTraco } from "../../lib/estoque";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { ShellCard } from "../plugga-shell";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import type { AcoesDoItem } from "./cards-do-estoque";
import styles from "./estoque.module.css";
import { SeloDaSituacao } from "./partes";

/** Lista do saldo no padrão das tabelas aprovadas (Equipe e Acessos, lista de negócios): 9 colunas que cabem na página, sem rolagem lateral. */
export function ListaDoEstoque({ itens, valorTotal, aoAbrir, aoMovimentar }: { itens: ItemDeEstoqueNaLista[]; valorTotal: string } & Omit<AcoesDoItem, "hrefDaFicha">) {
  return <div className={`lista-negocios ${estilosLista.lista} ${styles.lista}`}>
    <ShellCard className={`table-card lista-negocios-card ${styles.cartaoTabela}`}>
      <div className="card-heading"><div className={estilosLista.cabecalhoTabela}><div>
        <h2>{itens.length === 1 ? "1 item" : `${itens.length} itens`}</h2>
        <span>{valorEmReais(valorTotal) ?? "R$ 0,00"} em estoque, pelo custo médio</span>
      </div></div></div>
      <div className={`table-wrap ${styles.tabelaWrap}`} role="region" aria-label="Saldo do estoque" tabIndex={0}>
        <table className={styles.tabelaSaldo}>
          <caption className="sr-only">Saldo do estoque por item</caption>
          <colgroup><col className={styles.cItem} /><col className={styles.cEmpresa} /><col className={styles.cNum} /><col className={styles.cNum} /><col className={styles.cNum} /><col className={styles.cNum} /><col className={styles.cValor} /><col className={styles.cSituacao} /><col className={styles.cAcao} /></colgroup>
          <thead><tr>
            <th scope="col">Item</th><th scope="col">Empresa</th><th scope="col">Em estoque</th><th scope="col">Reservado</th><th scope="col">Disponível</th><th scope="col">Mínimo</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Movimentar</span></th>
          </tr></thead>
          <tbody>{itens.map((i, indice) => <tr key={i.id} className={styles.entra} style={{ "--i": indice } as CSSProperties} tabIndex={0}
            onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) aoAbrir(i.id); }}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); aoAbrir(i.id); } }}>
            <td data-l="Item"><div className={estilosLista.oportunidade}>
              <span className={estilosLista.iconeOportunidade} aria-hidden="true"><Package size={16} /></span>
              <div className={`celula-lead-bloco ${styles.blocoItem}`}>
                <button type="button" className={`lead-nome ${estilosLista.titulo} ${styles.nomeItem}`} title={i.nome} onClick={() => aoAbrir(i.id)}>{i.nome}</button>
                <span className={estilosLista.codigo}>{i.codigo} · {rotulosDaCategoriaDeItemDeEstoque[i.categoria]}</span>
              </div>
            </div></td>
            <td data-l="Empresa"><EmpresaComPonto empresa={i.empresa} /></td>
            <td data-l="Em estoque">{qtd(i.saldo.emEstoque, i.unidade)}</td>
            <td data-l="Reservado">{qtdOuTraco(i.saldo.reservado, i.unidade)}</td>
            <td data-l="Disponível"><strong>{qtd(i.saldo.disponivel, i.unidade)}</strong></td>
            <td data-l="Mínimo">{qtdOuTraco(i.estoqueMinimo, i.unidade)}</td>
            <td data-l="Valor">{valorEmReais(i.saldo.valor) ?? "R$ 0,00"}</td>
            <td data-l="Situação"><SeloDaSituacao situacao={i.saldo.situacao} /></td>
            <td><div className={estilosLista.acoesLinha}>
              <Button variant="secondary" size="sm" iconOnly icon={<ArrowRight size={14} />} aria-label={`Movimentar ${i.nome}`} onClick={() => aoMovimentar(i)} />
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </ShellCard>
  </div>;
}
