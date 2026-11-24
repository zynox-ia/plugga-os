import type { OcorrenciaDeTarefa } from "@plugga/shared";
import { Activity, ArrowRight, CalendarCheck, Check, CheckCircle2, Clock, Eye, FileCheck, KeyRound, Repeat, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { ConfiguracaoDeTarefas } from "../../lib/tarefas";
import { Button } from "../ui";
import styles from "./tarefas.module.css";

/** Ícone da tarefa: concluída, automática (monitoramento, protocolos), única ou recorrente. */
export function iconeDaOcorrencia(o: Pick<OcorrenciaDeTarefa, "situacao" | "automacao" | "atalho" | "tipo">): LucideIcon {
  if (o.situacao === "concluida") return CheckCircle2;
  if (o.automacao === "engenharia.monitoramento_do_dia") return Activity;
  if (o.automacao === "engenharia.protocolos_do_dia") return FileCheck;
  if (o.atalho === "agencia_virtual") return KeyRound;
  return o.tipo === "unica" ? CalendarCheck : Repeat;
}

/** O selo da situação, com o ícone (sem o ponto do Badge), como no protótipo; a cor acompanha o texto. */
export function SeloDaTarefa({ situacao }: { situacao: OcorrenciaDeTarefa["situacao"] }) {
  const [tom, Icone, texto] = situacao === "concluida" ? ["success", Check, "Concluída"] as const
    : situacao === "atrasada" ? ["danger", TriangleAlert, "Atrasada"] as const
    : ["neutral", Clock, situacao === "vence_hoje" ? "Vence hoje" : "Pendente"] as const;
  return <span className={`ui-badge ui-tone--${tom} ${styles.selo}`}><Icone size={12} aria-hidden="true" />{texto}</span>;
}

export type AcoesDaOcorrencia = {
  aoConcluir: (o: OcorrenciaDeTarefa) => void;
  aoVer: (o: OcorrenciaDeTarefa) => void;
};

/** Concluir (quando a API permite), o atalho para a tela do trabalho e, na concluída, ver o que foi feito. */
export function AcoesDaTarefa({ ocorrencia: o, config, aoConcluir, aoVer }: { ocorrencia: OcorrenciaDeTarefa; config: ConfiguracaoDeTarefas } & AcoesDaOcorrencia) {
  const atalho = o.atalho ? config.atalhos[o.atalho] : undefined;
  const podeConcluir = o.acoesPermitidas.includes("concluir");
  return <div className={styles.acoes}>
    {o.situacao === "concluida" && o.conclusao
      ? <Button variant="secondary" size="sm" iconOnly icon={<Eye size={15} />} className={styles.redondo} aria-label={`Ver o que foi feito em ${o.titulo}`} title="Ver o que foi feito" onClick={() => aoVer(o)} /> : null}
    {podeConcluir
      ? <Button size="sm" iconOnly icon={<Check size={15} />} className={styles.redondo} aria-label={`Concluir ${o.titulo}`} title={o.exigeEvidencia ? "Concluir com evidência" : "Concluir"} onClick={() => aoConcluir(o)} /> : null}
    {atalho
      ? <Link href={atalho.href} className={`button button--${podeConcluir || o.situacao === "concluida" ? "secondary" : "primary"} ui-button ui-button--sm ui-button--icon-only ${styles.redondo}`} aria-label={atalho.rotulo} title={atalho.rotulo}>
        <span className="ui-button-icon" aria-hidden="true"><ArrowRight size={15} /></span>
      </Link> : null}
  </div>;
}
