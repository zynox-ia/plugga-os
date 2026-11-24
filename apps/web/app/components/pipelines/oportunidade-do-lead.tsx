"use client";

import type { Pipeline, PipelinePerson } from "@plugga/shared";
import { CampoDoLead, type PropsEdicaoLead } from "./ficha-do-lead";
import styles from "./detalhes-do-lead-modal.module.css";
import { CamposPropriosDoNegocio } from "./campos-proprios-do-negocio";
import { FichaSolarDoNegocio } from "./ficha-solar-do-negocio";

export function OportunidadeDoLead({ negocioId, aoVerDocumentos, rascunho, aoAlterar, erros, pipeline, responsaveis, podeAtribuir }: PropsEdicaoLead & { negocioId: string; aoVerDocumentos: () => void; pipeline: Pipeline; responsaveis: PipelinePerson[]; podeAtribuir: boolean }) {
  const alterar = (campo: "title" | "value" | "expectedCloseDate" | "ownerId", valor: string) => aoAlterar((atual) => atual && { ...atual, [campo]: valor });
  return <>
    <div className={styles.tituloSecao}><h3>Oportunidade comercial</h3><p>Valores, previsão de fechamento e equipe responsável pelo negócio.</p></div>
    <div className={styles.leadCardsGrid}>
      <div className={styles.painelCard}>
        <div className={styles.painelCardHeader}><h4>Dados do negócio</h4></div>
        <CampoDoLead rotulo="Título da oportunidade" erro={erros.title}><input className="ui-input" value={rascunho.title} maxLength={120} aria-invalid={!!erros.title} onChange={(e) => alterar("title", e.target.value)} /></CampoDoLead>
        <CampoDoLead rotulo={pipeline.valueLabel || "Investimento estimado"} erro={erros.value}><input className="ui-input" inputMode="decimal" value={rascunho.value} placeholder="0,00" aria-invalid={!!erros.value} onChange={(e) => alterar("value", e.target.value)} /><small className={styles.cockpitCardSub}>Valor em reais. Exemplo: 1.234,56.</small></CampoDoLead>
        <CampoDoLead rotulo="Previsão de fechamento" erro={erros.expectedCloseDate}><input className="ui-input" type="date" value={rascunho.expectedCloseDate} aria-invalid={!!erros.expectedCloseDate} onChange={(e) => alterar("expectedCloseDate", e.target.value)} /></CampoDoLead>
      </div>
      <div className={styles.painelCard}>
        <div className={styles.painelCardHeader}><h4>Responsável e etiquetas</h4></div>
        <CampoDoLead rotulo="Responsável comercial" erro={erros.ownerId}><select className="ui-input" disabled={!podeAtribuir} value={rascunho.ownerId} aria-invalid={!!erros.ownerId} onChange={(e) => alterar("ownerId", e.target.value)}>{responsaveis.map((pessoa) => <option key={pessoa.id} value={pessoa.id}>{pessoa.name}</option>)}</select></CampoDoLead>
        <fieldset className={styles.etiquetasEdicao}><legend>Etiquetas</legend>{pipeline.tags.length ? pipeline.tags.map((tag) => <label key={tag.id} className={styles.opcaoMarcavel}>
          <input type="checkbox" checked={rascunho.tagIds.includes(tag.id)} onChange={(e) => aoAlterar((atual) => atual && { ...atual, tagIds: e.target.checked ? [...atual.tagIds, tag.id] : atual.tagIds.filter((id) => id !== tag.id) })} />
          <span className="ui-dialog-tag-dot" style={{ backgroundColor: tag.color }} />{tag.name}
        </label>) : <p className={styles.cockpitCardSub}>Nenhuma etiqueta configurada neste pipeline.</p>}{erros.tagIds ? <span className={styles.erroCampo}>{erros.tagIds}</span> : null}</fieldset>
      </div>
      <CamposPropriosDoNegocio pipeline={pipeline} responsaveis={responsaveis} rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} />
      {pipeline.processProfile?.key === "solar_commercial" && rascunho.solarProject ? <FichaSolarDoNegocio negocioId={negocioId} projeto={rascunho.solarProject} erros={erros} aoVerDocumentos={aoVerDocumentos}
        aoAlterar={(solarProject) => aoAlterar((atual) => atual && { ...atual, solarProject })} /> : null}
    </div>
  </>;
}
