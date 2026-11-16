"use client";

import { solarStageRoles, type ActivateSolarProcessRequest, type SolarStageRole } from "@plugga/shared";
import { CircleCheck, Workflow } from "lucide-react";
import { useState } from "react";

import { formatarData } from "../../lib/format";
import type { Rascunho } from "../../lib/pipelines";
import { ativarProcessoSolar, SOLAR_STAGE_ROLE_LABELS, sugestaoDeAtivacao } from "../../lib/processo-solar";
import { Alert, Button } from "../ui";
import { SelectField } from "../ui/select-field";
import styles from "./campos-do-pipeline.module.css";

const CRIAR_KIT = "__criar__";

/**
 * Ativação do processo Solar (PLU-320). Cada etapa recebe um papel; a Validação
 * do Kit pode ser criada no fim. Negócios, históricos e tarefas não são tocados:
 * os abertos passam a ser cobrados no próximo avanço.
 */
export function SecaoProcessoSolar({ rascunho, alteracoesPendentes, aoAtivado }: {
  rascunho: Rascunho; alteracoesPendentes: boolean; aoAtivado: () => Promise<void>;
}) {
  const ativacao = rascunho.processProfile?.activation;
  const etapas = rascunho.stages.filter((etapa): etapa is typeof etapa & { id: string } => !!etapa.id);
  const [mapa, setMapa] = useState<Record<SolarStageRole, string>>(() => {
    const sugestao = sugestaoDeAtivacao(etapas.map((etapa) => etapa.id));
    return Object.fromEntries(solarStageRoles.map((role) => [role, role === "validacaoKit" ? sugestao?.validacaoKit ?? CRIAR_KIT : sugestao?.[role] ?? ""])) as Record<SolarStageRole, string>;
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nomeDaEtapa = (id: string) => etapas.find((etapa) => etapa.id === id)?.name ?? "Etapa removida";

  if (ativacao) {
    return <div className={styles.lista}>
      <Alert tone="success" title={`Processo Solar ativo desde ${formatarData(ativacao.activatedAt)}`}>
        Tarefas, prazos e bloqueios valem para todas as entradas. Etapas do processo não podem ser removidas, acrescentadas ou reordenadas.
      </Alert>
      <dl className={styles.mapaProcesso}>
        {solarStageRoles.map((role) => <div key={role}><dt>{SOLAR_STAGE_ROLE_LABELS[role]}</dt><dd><CircleCheck size={14} aria-hidden="true" />{nomeDaEtapa(ativacao.stages[role])}</dd></div>)}
      </dl>
    </div>;
  }

  const opcoes = etapas.map((etapa) => ({ value: etapa.id, label: etapa.name }));
  async function ativar() {
    setErro(null);
    const stages = Object.fromEntries(solarStageRoles.map((role) => [role, role === "validacaoKit" && mapa[role] === CRIAR_KIT ? null : mapa[role]])) as ActivateSolarProcessRequest["stages"];
    if (solarStageRoles.some((role) => stages[role] === "")) return setErro("Escolha uma etapa para cada papel do processo.");
    setEnviando(true);
    try {
      await ativarProcessoSolar(rascunho.id!, stages);
      await aoAtivado();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível ativar o processo.");
    } finally {
      setEnviando(false);
    }
  }

  return <div className={styles.lista}>
    <p className={styles.nota}>Associe cada papel do processo Solar a uma etapa deste pipeline. Os nomes das etapas continuam editáveis.</p>
    <Alert tone="info" title="O que muda ao ativar">
      Negócios novos e abertos passam a ter tarefas com prazo em dias úteis de Manaus e são cobrados no próximo avanço. Etapas já passadas não são cobradas; ganhos e perdidos não mudam.
    </Alert>
    {erro ? <Alert tone="danger" title={erro} /> : null}
    {alteracoesPendentes ? <Alert tone="warning" title="Salve ou descarte as alterações do pipeline antes de ativar o processo." /> : null}
    <section className={styles.campo} aria-label="Etapas do processo Solar">
      <div className={styles.topo}><h3><Workflow size={16} aria-hidden="true" /> Etapas do processo</h3></div>
      <div className={styles.grade}>
        {solarStageRoles.map((role) => <SelectField
          key={role}
          label={SOLAR_STAGE_ROLE_LABELS[role]}
          value={mapa[role] || undefined}
          placeholder="Selecione"
          disabled={enviando}
          options={role === "validacaoKit" ? [{ value: CRIAR_KIT, label: "Criar etapa “Validação do Kit” no fim" }, ...opcoes] : opcoes}
          onChange={(valor) => setMapa((atual) => ({ ...atual, [role]: valor }))}
        />)}
      </div>
    </section>
    <div><Button variant="primary" icon={<Workflow size={16} />} loading={enviando} disabled={enviando || alteracoesPendentes} onClick={() => void ativar()}>Ativar processo Solar</Button></div>
  </div>;
}
