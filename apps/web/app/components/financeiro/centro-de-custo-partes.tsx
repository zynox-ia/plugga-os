import { FlaskConical, Sun, Wrench, type LucideIcon } from "lucide-react";

import { barraDoOrcamento, reais, resumoDoProjeto, type Projeto, type SituacaoDoProjeto } from "../../lib/prototipo-centro-de-custo";
import type { Tone } from "../ui";
import styles from "./centro-de-custo.module.css";

/** Partes do Centro de custo (PLU-362) usadas pela lista e pelo detalhe; sem estado, servem ao servidor e ao cliente. */

export const TOM_DA_SITUACAO: Record<SituacaoDoProjeto, Tone> = { nao_iniciado: "neutral", em_andamento: "info", concluido: "success" };

/** O ícone do projeto: físico (energia solar, eletroposto) ou serviço. */
export const iconeDoProjeto = (p: Pick<Projeto, "classe">): LucideIcon => (p.classe === "servico" ? Wrench : Sun);

/** O selo discreto de que a tela é um protótipo com dados inventados. */
export function SeloDoPrototipo() {
  return <span className={styles.prototipo} title="Protótipo para avaliação: nenhum número desta tela é real.">
    <FlaskConical size={14} aria-hidden="true" />Protótipo · dados de exemplo
  </span>;
}

/** O orçamento consumido: barra e percentual, em perigo quando passa de 100%. */
export function Orcamento({ projeto }: { projeto: Projeto }) {
  const { orcamento } = resumoDoProjeto(projeto);
  if (!orcamento) return <span className={styles.semOrcamento}>Sem orçamento</span>;
  return <span className={styles.orcamento}>
    <strong className={orcamento.estourou ? styles.negativo : undefined}>{orcamento.percentual}%</strong>
    <span className={`${styles.trilho} ${orcamento.estourou ? styles.trilhoEstourado : ""}`} aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, orcamento.percentual)}%` }} /></span>
    <small>{orcamento.estourou ? "acima do orçamento" : `de ${reais(orcamento.valor)}`}</small>
  </span>;
}

/**
 * A barra do orçamento no estilo da barra do Estoque (pedido do André em
 * 27/11/2026): sólido o que já saiu, hachurado o a pagar, o traço no limite do
 * orçamento e a legenda embaixo; âmbar perto do limite, vermelho quando passa.
 * Só `span`, para caber também dentro da nota de um card de métrica.
 */
export function BarraDoOrcamento({ projeto }: { projeto: Projeto }) {
  const b = barraDoOrcamento(resumoDoProjeto(projeto));
  if (!b) return <span className={styles.semOrcamentoNaLinha}>Sem orçamento</span>;
  return <span className={`${styles.barraOrc} ${styles[`barraOrc_${b.tom}`]}`} role="img" aria-label={b.rotulo}>
    <span className={styles.barraOrcTrilho} aria-hidden="true">
      <span className={styles.barraOrcAPagar} style={{ width: `${b.comprometido}%` }} />
      <span className={styles.barraOrcSaiu} style={{ width: `${b.saiu}%` }} />
      <span className={styles.barraOrcLimite} style={{ left: `${b.limite}%` }} />
    </span>
    <span className={styles.barraOrcLegenda} aria-hidden="true">{b.legenda}</span>
  </span>;
}
