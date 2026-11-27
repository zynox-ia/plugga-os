"use client";

import { Eye, FileCode2, FileText, Link2, Paperclip } from "lucide-react";
import type { CSSProperties } from "react";

import { valorEmReais } from "../../lib/compras";
import type { NotaFiscal } from "../../lib/notas-fiscais";
import estilosClientes from "../clientes/tela-clientes.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import estilosLancamentos from "./lancamentos.module.css";
import styles from "./notas-fiscais.module.css";

const diaLegivel = (dia: string) => dia.split("-").reverse().join("/");

/**
 * A visão em Cards das Notas fiscais (PLU-361, protótipo): a mesma grade e o mesmo
 * card de Lançamentos (3, 4, 2 e 1 colunas). Ícone da nota e, no canto, o número com
 * a empresa; o cliente (entradas) ou fornecedor (saídas) como título; a emissão; o
 * valor em destaque; e o rodapé com o lançamento vinculado, o arquivo e o olho que
 * abre a ficha. O card inteiro também abre a ficha, como a linha da lista.
 */
export function CardsDasNotasFiscais({ notas, destaque, aoAbrir }: { notas: readonly NotaFiscal[]; destaque: string | null; aoAbrir: (id: string) => void }) {
  return <div className={estilosLancamentos.areaCards}><div className={estilosLancamentos.grade}>
    {notas.map((nota, indice) => <CardDaNota key={nota.id} nota={nota} indice={indice} destacada={destaque === nota.id} aoAbrir={aoAbrir} />)}
  </div></div>;
}

function CardDaNota({ nota, indice, destacada, aoAbrir }: { nota: NotaFiscal; indice: number; destacada: boolean; aoAbrir: (id: string) => void }) {
  const valor = valorEmReais(nota.valor) ?? "R$ 0,00";
  return <article data-nota={nota.id} data-selected={destacada || undefined} aria-label={`Nota nº ${nota.numero}: ${nota.contraparte.nome}, ${valor}`}
    className={`${estilosClientes.card} ${estilosLancamentos.card} ${estilosLancamentos.entra} ${styles.cardDaNota}`} style={{ "--i": indice } as CSSProperties}
    onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) aoAbrir(nota.id); }}>
    <div className={estilosLancamentos.topo}>
      <span className={estilosLancamentos.caixa} aria-hidden="true"><FileText size={20} /></span>
      <div className={estilosLancamentos.canto}>
        <span>Nº {nota.numero}</span><span aria-hidden="true">·</span><EmpresaComPonto empresa={nota.empresa} curto />
      </div>
    </div>
    <div className={estilosLancamentos.quem}>
      <h3><button type="button" className={styles.tituloDoCard} title={nota.contraparte.nome} onClick={() => aoAbrir(nota.id)}>{nota.contraparte.nome}</button></h3>
      <p>Emitida em {diaLegivel(nota.emitidaEm)}</p>
    </div>
    <div className={estilosLancamentos.valor}><strong>{valor}</strong></div>
    <footer className={estilosLancamentos.rodape}>
      {nota.lancamento
        ? <span className={estilosLancamentos.prazo}><span className={styles.codigo}><Link2 size={13} aria-hidden="true" /><span className="sr-only">Lançamento </span>{nota.lancamento.codigo}</span><small>{nota.lancamento.situacao}</small></span>
        : <span className={`${estilosLancamentos.prazo} ${styles.semNada}`}>Sem vínculo</span>}
      {nota.arquivo
        ? <span className={styles.arquivo} title={nota.arquivo.nome}>{nota.arquivo.formato === "xml" ? <FileCode2 size={15} aria-hidden="true" /> : <Paperclip size={15} aria-hidden="true" />}{nota.arquivo.formato.toUpperCase()}</span>
        : <span className={styles.semNada}>Sem arquivo</span>}
      <Button variant="secondary" size="sm" iconOnly icon={<Eye size={14} />} aria-label={`Abrir nota nº ${nota.numero}`} onClick={() => aoAbrir(nota.id)} />
    </footer>
  </article>;
}
