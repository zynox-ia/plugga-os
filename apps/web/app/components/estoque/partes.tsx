import { rotulosDaSituacaoDoSaldo, rotulosDoTipoDeMovimentacao, type SituacaoDoSaldo, type TipoDeMovimentacao } from "@plugga/shared";
import { Ban, Check, Clock3, Download, Pencil, TriangleAlert, Undo2, Upload, type LucideIcon } from "lucide-react";

import { nivelDoItem, qtd, TOM_DA_SITUACAO } from "../../lib/estoque";
import styles from "./estoque.module.css";

const ICONE_DA_SITUACAO: Record<SituacaoDoSaldo, LucideIcon> = { normal: Check, abaixo_do_minimo: TriangleAlert, zerado: Ban };

/** Selo de situação do saldo (Normal, Abaixo do mínimo, Zerado): a cor só aqui. */
export function SeloDaSituacao({ situacao }: { situacao: SituacaoDoSaldo }) {
  const Icone = ICONE_DA_SITUACAO[situacao];
  return <span className={`ui-badge ui-tone--${TOM_DA_SITUACAO[situacao]} ${styles.selo}`}><Icone size={11} aria-hidden="true" />{rotulosDaSituacaoDoSaldo[situacao]}</span>;
}

export const ICONE_DO_TIPO: Record<TipoDeMovimentacao, LucideIcon> = { entrada: Download, saida: Upload, ajuste: Pencil, reserva: Clock3, liberacao: Undo2 };
const TOM_DO_TIPO: Record<TipoDeMovimentacao, string> = { entrada: "success", saida: "info", ajuste: "warning", reserva: "neutral", liberacao: "neutral" };

export function SeloDoTipo({ tipo }: { tipo: TipoDeMovimentacao }) {
  const Icone = ICONE_DO_TIPO[tipo];
  return <span className={`ui-badge ui-tone--${TOM_DO_TIPO[tipo]} ${styles.selo}`}><Icone size={11} aria-hidden="true" />{rotulosDoTipoDeMovimentacao[tipo]}</span>;
}

/**
 * Barra de nível do item: o saldo (azul; âmbar abaixo do mínimo; vermelho
 * zerado), o reservado hachurado no fim do saldo e o traço do mínimo.
 */
export function NivelDoItem({ emEstoque, reservado, minimo, situacao, unidade, grande = false, legenda }: {
  emEstoque: number; reservado: number; minimo: number; situacao: SituacaoDoSaldo; unidade: string; grande?: boolean; legenda?: string | null;
}) {
  const n = nivelDoItem(emEstoque, reservado, minimo);
  const rotulo = `Nível do estoque: ${qtd(emEstoque, unidade)}${reservado > 0 ? `, ${qtd(reservado, unidade)} reservados` : ""}${minimo > 0 ? `, mínimo ${qtd(minimo, unidade)}` : ", sem mínimo"}`;
  return <div className={`${styles.nivel} ${grande ? styles.nivelGrande : ""}`} role="img" aria-label={rotulo}>
    <div className={styles.nivelTrilho} aria-hidden="true">
      <span className={`${styles.nivelSaldo} ${styles[`nivel_${situacao}`]}`} style={{ width: `${n.saldo}%` }} />
      {n.reserva > 0 ? <span className={styles.nivelReserva} style={{ left: `${n.reservaInicio}%`, width: `${n.reserva}%` }} /> : null}
      {n.minimo !== null ? <span className={styles.nivelMinimo} style={{ left: `${n.minimo}%` }}>{grande ? <em>mínimo</em> : null}</span> : null}
    </div>
    {legenda ? <small aria-hidden="true">{legenda}</small> : null}
  </div>;
}

/** "Mínimo 300 m · faltam 120 m", "Sem estoque mínimo". */
export function legendaDoMinimo(minimo: number, falta: number, unidade: string): string {
  if (minimo <= 0) return "Sem estoque mínimo";
  return `Mínimo ${qtd(minimo, unidade)}${falta > 0 ? ` · faltam ${qtd(falta, unidade)}` : ""}`;
}
