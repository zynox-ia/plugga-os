import type { ReactNode } from "react";

import { ShellCard } from "../plugga-shell";
import styles from "./suprimentos.module.css";

/**
 * Card de métrica de Suprimentos, no padrão dos cards de cenário da aba
 * Previsão do CRM (`pipelines/previsao-do-pipeline.tsx`): rótulo e ícone,
 * número em 26 px peso 500, nota atenuada e, quando faz sentido, a barra.
 */
export function CardDeMetrica({ rotulo, valor, nota, icone, barra, tom = "primaria" }: {
  rotulo: string;
  valor: ReactNode;
  nota: ReactNode;
  icone: ReactNode;
  /** Percentual de 0 a 100; ausente, sem barra. */
  barra?: number;
  tom?: "primaria" | "ambar";
}) {
  return <ShellCard className={styles.metrica}>
    <div className={styles.metricaCorpo}>
      <span className={styles.metricaRotulo}>{rotulo}<span className={styles.metricaIcone} aria-hidden="true">{icone}</span></span>
      <b className={styles.metricaValor}>{valor}</b>
      <small className={styles.metricaNota}>{nota}</small>
      {barra === undefined ? null : <span className={`${styles.barra} ${tom === "ambar" ? styles.barraAmbar : ""}`} aria-hidden="true"><span className="plg-barra" style={{ inlineSize: `${Math.max(0, Math.min(100, barra))}%` }} /></span>}
    </div>
  </ShellCard>;
}

/** A fileira de 4 cards no topo da tela (2 por linha abaixo de 1100 px). */
export function MetricasDoTopo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className={styles.metricas} role="group" aria-label={rotulo}>{children}</div>;
}
