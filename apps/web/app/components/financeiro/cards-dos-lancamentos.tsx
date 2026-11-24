import type { LancamentoResumo } from "@plugga/shared";
import { Eye, Paperclip, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { valorEmReais } from "../../lib/compras";
import { prazoDoLancamento, resumoDoLancamento, rotuloDoValor, seloDaEtapa, temPendenciaNoOmie } from "../../lib/financeiro";
import estilosClientes from "../clientes/tela-clientes.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import styles from "./lancamentos.module.css";
import { ICONE_DA_NATUREZA, SetaDoTipo } from "./partes";

export type AcoesDoLancamento = { hrefDaFicha: (id: string) => string; aoAbrir: (id: string) => void };

/**
 * Visão padrão dos Lançamentos (PLU-336): o card em três níveis do protótipo
 * aprovado. Quem e a descrição; o valor em destaque; o prazo e a etapa no
 * rodapé. Código e empresa discretos no canto; o OMIE só aparece quando há
 * pendência. No máximo uma cor de destaque por card.
 */
export function CardsDosLancamentos({ itens, hrefDaFicha, aoAbrir }: { itens: LancamentoResumo[] } & AcoesDoLancamento) {
  return <div className={styles.areaCards}><div className={styles.grade}>
    {itens.map((l, indice) => <CardDoLancamento key={l.id} l={l} indice={indice} hrefDaFicha={hrefDaFicha} aoAbrir={aoAbrir} />)}
  </div></div>;
}

function CardDoLancamento({ l, indice, hrefDaFicha, aoAbrir }: { l: LancamentoResumo; indice: number } & AcoesDoLancamento) {
  // A conta pode nascer sem categoria (CC14, a da compra): ícone genérico até ser classificada.
  const Icone = ICONE_DA_NATUREZA[l.categoria?.natureza ?? "outros"];
  const prazo = prazoDoLancamento(l);
  const selo = seloDaEtapa(l);
  const pendencia = temPendenciaNoOmie(l);
  const valor = valorEmReais(l.valor) ?? "R$ 0,00";
  const resumo = resumoDoLancamento(l);
  return <article className={`${estilosClientes.card} ${styles.card} ${styles.entra}`} style={{ "--i": indice } as CSSProperties}
    aria-label={`${l.codigo}: ${l.favorecido.nome}, ${valor}${pendencia ? ", com pendência no OMIE" : ""}`}>
    <div className={styles.topo}>
      <span className={styles.caixa} aria-hidden="true" title={l.categoria?.nome ?? "Sem categoria"}><Icone size={20} /></span>
      <div className={styles.canto}>
        {pendencia ? <span className={styles.pendencia} role="img" aria-label="Pendência no OMIE" title="Pendência no OMIE: veja na ficha"><TriangleAlert size={13} aria-hidden="true" /></span> : null}
        <span>{l.codigo}</span><span aria-hidden="true">·</span><EmpresaComPonto empresa={l.empresa} curto />
      </div>
    </div>
    <div className={styles.quem}>
      <h3><Link href={hrefDaFicha(l.id)} scroll={false} title={l.favorecido.nome}>{l.favorecido.nome}</Link></h3>
      <p title={resumo}>{resumo}</p>
    </div>
    <div className={styles.valor}><strong>{valor}</strong><small><SetaDoTipo tipo={l.tipo} />{rotuloDoValor(l)}</small></div>
    <footer className={styles.rodape}>
      <span className={styles.prazo}>
        {l.liquidadoEm || l.cancelado ? null : <span className="sr-only">Vencimento </span>}
        <span>{prazo.data}</span>
        {prazo.relativo ? <small className={prazo.tom ? styles[prazo.tom] : undefined}>{prazo.relativo}</small> : null}
      </span>
      {l.anexos > 0 ? <span className={styles.anexo} title={l.anexos === 1 ? "1 anexo" : `${l.anexos} anexos`}><Paperclip size={13} aria-hidden="true" /><span className="sr-only">{l.anexos === 1 ? "1 anexo" : `${l.anexos} anexos`}</span></span> : null}
      <span className="ui-badge ui-tone--neutral" title={selo.completo}>{selo.curto}</span>
      <Button variant="secondary" size="sm" iconOnly icon={<Eye size={14} />} aria-label={`Ver ${l.codigo}`} onClick={() => aoAbrir(l.id)} />
    </footer>
  </article>;
}
