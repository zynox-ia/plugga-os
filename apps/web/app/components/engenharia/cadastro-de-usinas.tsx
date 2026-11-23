import type { UsinaResumo } from "@plugga/shared";
import { Activity, Eye, Monitor, Sun, Zap } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { quandoNaFicha } from "../../lib/ordens-de-servico";
import { kwpLegivel, ROTULO_DA_SITUACAO_DO_MONITORAMENTO, rotuloDaUc } from "../../lib/usinas";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import styles from "./usinas.module.css";

/** "hoje, 08:20 · normal" da última conferência, ou "nunca conferida". */
function UltimoMonitoramento({ usina: u, hoje }: { usina: UsinaResumo; hoje: string }) {
  const m = u.ultimoMonitoramento;
  if (!m) return <span className={styles.duasLinhas}><span>Sem conferência</span><small>{u.ativa ? "conferir no monitoramento" : "inativa"}</small></span>;
  return <span className={styles.duasLinhas}>
    <span>{quandoNaFicha(m.conferido.em, hoje)}</span>
    <small className={m.situacao === "normal" ? undefined : styles.perigo}>{ROTULO_DA_SITUACAO_DO_MONITORAMENTO[m.situacao].toLowerCase()}</small>
  </span>;
}

/** O cadastro em cards, 3 por linha: UC e empresa no canto, a usina e o cliente, potência, plataforma e inversor. */
export function CadastroDeUsinas({ usinas, hoje, hrefDaFicha, aoAbrir }: { usinas: UsinaResumo[]; hoje: string; hrefDaFicha: (id: string) => string; aoAbrir: (id: string) => void }) {
  return <div className={styles.grade}>
    {usinas.map((u, i) => <article key={u.id} className={`${styles.card} ${styles.entra} ${u.ativa ? "" : styles.inativa}`} style={{ "--i": i } as CSSProperties} aria-label={u.nome}>
      <header className={styles.cardTopo}>
        <span className={styles.caixa} aria-hidden="true"><Sun size={20} /></span>
        <span className={styles.canto}>{rotuloDaUc(u.uc.codigo)}<span aria-hidden="true">·</span><EmpresaComPonto empresa={u.empresa} curto /></span>
      </header>
      <div className={styles.cardCorpo}>
        <h3><Link href={hrefDaFicha(u.id)} scroll={false}>{u.nome}</Link></h3>
        <p className={styles.muted}>{u.cliente.nome}{u.ativa ? "" : " · inativa"}</p>
      </div>
      <p className={styles.dadosDaUsina}>
        <span><Zap size={14} aria-hidden="true" />{kwpLegivel(u.potenciaKwp)} kWp</span>
        <span><Monitor size={14} aria-hidden="true" />{u.plataforma.nome}</span>
        {u.fabricante || u.modelo ? <span><Activity size={14} aria-hidden="true" />{[u.fabricante, u.modelo].filter(Boolean).join(" ")}</span> : null}
      </p>
      <footer className={styles.cardRodape}>
        <UltimoMonitoramento usina={u} hoje={hoje} />
        <span className={styles.espaco} />
        <span className={styles.pilula}>{u.osAbertas ? `${u.osAbertas} O.S. ${u.osAbertas === 1 ? "aberta" : "abertas"}` : "Sem O.S."}</span>
        <Button variant="secondary" size="sm" iconOnly icon={<Eye size={15} />} className={styles.redondo} aria-label={`Ver ${u.nome}`} title="Ver a usina" onClick={() => aoAbrir(u.id)} />
      </footer>
    </article>)}
  </div>;
}
