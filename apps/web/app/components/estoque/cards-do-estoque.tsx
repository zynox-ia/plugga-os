import { rotulosDaCategoriaDeItemDeEstoque, type ItemDeEstoqueNaLista } from "@plugga/shared";
import { ArrowRight, Eye, Package } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { valorEmReais } from "../../lib/compras";
import { qtd, qtdOuTraco } from "../../lib/estoque";
import estilosClientes from "../clientes/tela-clientes.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import styles from "./estoque.module.css";
import { legendaDoMinimo, NivelDoItem, SeloDaSituacao } from "./partes";

export type AcoesDoItem = { hrefDaFicha: (id: string) => string; aoAbrir: (id: string) => void; aoMovimentar: (item: ItemDeEstoqueNaLista) => void };

/** Visão padrão do Estoque: um card por item, com a caixa neutra, os três números, o nível e o valor. */
export function CardsDoEstoque({ itens, hrefDaFicha, aoAbrir, aoMovimentar }: { itens: ItemDeEstoqueNaLista[] } & AcoesDoItem) {
  return <div className={estilosClientes.areaCards}><div className={styles.grade}>
    {itens.map((i, indice) => {
      const s = i.saldo;
      const minimo = Number(i.estoqueMinimo);
      return <article key={i.id} className={`${estilosClientes.card} ${styles.cardItem} ${styles.entra}`} style={{ "--i": indice } as CSSProperties} aria-label={i.nome}>
        <header className={estilosClientes.cardTopo}>
          <span className={styles.caixa} aria-hidden="true"><Package size={20} /></span>
          <div className={estilosClientes.identidade}>
            <div className={estilosClientes.nomeLinha}>
              <h3><Link href={hrefDaFicha(i.id)} scroll={false}>{i.nome}</Link></h3>
              <SeloDaSituacao situacao={s.situacao} />
            </div>
            <div className={`${estilosClientes.tipoLocal} ${styles.metaCard}`}>
              <span>{i.codigo}</span><span aria-hidden="true">·</span><span>{rotulosDaCategoriaDeItemDeEstoque[i.categoria]}</span><span aria-hidden="true">·</span><EmpresaComPonto empresa={i.empresa} />
            </div>
          </div>
        </header>
        <dl className={styles.numerosCard}>
          <div><dt>Em estoque</dt><dd>{qtd(s.emEstoque, i.unidade)}</dd></div>
          <div><dt>Reservado</dt><dd>{qtdOuTraco(s.reservado, i.unidade)}</dd></div>
          <div className={styles.destaque}><dt>Disponível</dt><dd>{qtd(s.disponivel, i.unidade)}</dd></div>
        </dl>
        <NivelDoItem emEstoque={Number(s.emEstoque)} reservado={Number(s.reservado)} minimo={minimo} situacao={s.situacao} unidade={i.unidade}
          legenda={legendaDoMinimo(minimo, Number(s.faltaParaOMinimo), i.unidade)} />
        <footer className={estilosClientes.cardRodape}>
          <div className={styles.valorCard}><span>Valor</span><strong>{valorEmReais(s.valor) ?? "R$ 0,00"}</strong></div>
          <div className={styles.acoesCard}>
            <Button variant="secondary" size="sm" icon={<ArrowRight size={14} />} aria-label={`Movimentar ${i.nome}`} onClick={() => aoMovimentar(i)}>Movimentar</Button>
            <Button size="sm" icon={<Eye size={14} />} aria-label={`Ver item ${i.nome}`} onClick={() => aoAbrir(i.id)}>Ver item</Button>
          </div>
        </footer>
      </article>;
    })}
  </div></div>;
}
