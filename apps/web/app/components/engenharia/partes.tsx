import type { OrdemDeServicoResumo, SituacaoDaOrdemDeServico, TipoDeOrdemDeServico } from "@plugga/shared";
import {
  Activity,
  BatteryCharging,
  ClipboardList,
  FileText,
  ListChecks,
  MapPin,
  PlugZap,
  ShieldCheck,
  SlidersHorizontal,
  SolarPanel,
  Siren,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { agendaDaOrdem, ROTULO_DA_SITUACAO } from "../../lib/ordens-de-servico";
import styles from "./engenharia.module.css";

/** Um ícone por tipo de O.S., como no protótipo (chave para manutenção, alarme para emergência, pino para visita). */
export const ICONE_DO_TIPO: Record<TipoDeOrdemDeServico, LucideIcon> = {
  manutencao: Wrench,
  limpeza: Sparkles,
  garantia: ShieldCheck,
  emergencia: Siren,
  visita_tecnica: MapPin,
  instalacao: SolarPanel,
  configuracao: SlidersHorizontal,
  comissionamento: ListChecks,
  orcamento_tecnico: FileText,
  eletroposto: PlugZap,
  grid_zero_bess: BatteryCharging,
  analise_energia: Activity,
  outros: ClipboardList,
};

export function IconeDoTipo({ tipo, tamanho = 18 }: { tipo: TipoDeOrdemDeServico; tamanho?: number }) {
  const Icone = ICONE_DO_TIPO[tipo];
  return <Icone size={tamanho} aria-hidden="true" />;
}

/** Selo neutro da etapa: o texto diz a situação, sem cor por etapa (poucas cores). */
export function SeloDaEtapa({ situacao }: { situacao: SituacaoDaOrdemDeServico }) {
  return <span className={styles.selo} data-situacao={situacao}>{ROTULO_DA_SITUACAO[situacao]}</span>;
}

/** O dia e, embaixo, o horário, o atraso (vermelho) ou a nova data (âmbar). */
export function AgendaDaOrdem({ ordem, hoje, centro = false }: {
  ordem: Pick<OrdemDeServicoResumo, "situacao" | "agendadaPara" | "prazo" | "atrasada">;
  hoje: string;
  centro?: boolean;
}) {
  const agenda = agendaDaOrdem(ordem, hoje);
  return <span className={`${styles.agenda} ${centro ? styles.agendaCentro : ""}`}>
    <span className={styles.agendaDia}>{agenda.dia}</span>
    {agenda.detalhe ? <small className={agenda.tom === "atraso" ? styles.atraso : agenda.tom === "aviso" ? styles.aviso : undefined}>{agenda.detalhe}</small> : null}
  </span>;
}
