"use client";

import type { PipelineFieldInput } from "@plugga/shared";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "../modal";
import { Button } from "../ui/button";
import { TextField } from "../ui/fields";
import { SelectField } from "../ui/select-field";
import { Checkbox } from "../ui/selection";
import type { PropsDaSecao } from "./editor-de-pipeline";
import styles from "./campos-do-pipeline.module.css";

const TIPOS = [
  { value: "text", label: "Texto" }, { value: "number", label: "Número" },
  { value: "money", label: "Moeda (R$)" }, { value: "date", label: "Data" },
  { value: "select", label: "Seleção" }, { value: "boolean", label: "Sim ou não" },
  { value: "person", label: "Pessoa da equipe" },
];

export function SecaoCamposDoPipeline({ rascunho, aoAlterar, erros }: PropsDaSecao) {
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const campos = rascunho.fields;
  const perfil = rascunho.processProfile;
  const camposVinculados = new Set(perfil ? Object.values(perfil.bindings).map((referencia) => referencia.fieldId) : []);
  const opcoesVinculadas = new Set(perfil ? Object.values(perfil.bindings.installationType.options) : []);
  const alvo = campos.find((campo) => campo.chave === excluindo);
  const alterar = (indice: number, parcial: Partial<PipelineFieldInput>) => aoAlterar({ fields: campos.map((campo, i) => i === indice ? { ...campo, ...parcial } : campo) });
  function remover(chave: string) {
    const campo = campos.find((item) => item.chave === chave)!;
    aoAlterar({ fields: campos.filter((item) => item.chave !== chave), confirmedFieldRemovals: campo.id && campo.valueCount ? [...(rascunho.confirmedFieldRemovals ?? []), campo.id] : rascunho.confirmedFieldRemovals });
    setExcluindo(null);
  }
  function mover(indice: number, destino: number) {
    const copia = [...campos];
    const [campo] = copia.splice(indice, 1);
    copia.splice(destino, 0, campo!);
    aoAlterar({ fields: copia });
  }
  return <div className={styles.lista}>
    <p className={styles.nota}>Defina os dados próprios deste pipeline. A ordem abaixo também será usada na ficha do negócio.</p>
    {erros.fields ? <p className="aviso aviso--erro" role="alert">{erros.fields}</p> : null}
    {!campos.length ? <p className={styles.nota}>Nenhum campo configurado. Use “Adicionar campo” para começar.</p> : null}
    {campos.map((campo, indice) => {
      const vinculado = !!campo.id && camposVinculados.has(campo.id);
      return <section className={styles.campo} key={campo.chave} aria-label={`Campo ${indice + 1}: ${campo.name || "sem nome"}`}>
      <div className={styles.topo}><h3>{indice + 1}. {campo.name || "Novo campo"}</h3><div className={styles.acoes}>
        <Button variant="secondary" size="sm" iconOnly icon={<ChevronUp size={14} />} aria-label={`Subir campo ${campo.name || indice + 1}`} disabled={indice === 0} onClick={() => mover(indice, indice - 1)} />
        <Button variant="secondary" size="sm" iconOnly icon={<ChevronDown size={14} />} aria-label={`Descer campo ${campo.name || indice + 1}`} disabled={indice === campos.length - 1} onClick={() => mover(indice, indice + 1)} />
        <Button variant="danger" size="sm" iconOnly icon={<Trash2 size={14} />} aria-label={`Excluir campo ${campo.name || indice + 1}`} disabled={vinculado} onClick={() => campo.valueCount ? setExcluindo(campo.chave) : remover(campo.chave)} />
      </div></div>
      <div className={styles.grade}>
        <TextField label="Nome do campo" required maxLength={80} value={campo.name} onChange={(e) => alterar(indice, { name: e.target.value })} />
        <SelectField label="Tipo do campo" options={TIPOS} value={campo.type} disabled={vinculado || !!campo.valueCount} hint={vinculado ? "Usado na ficha Solar. O campo e seu tipo são preservados." : campo.valueCount ? "O tipo é preservado porque há negócios com este campo preenchido." : undefined} onChange={(type) => alterar(indice, { type: type as PipelineFieldInput["type"], options: type === "select" ? [{ name: "" }] : [] })} />
      </div>
      {campo.type === "select" ? <div className={styles.opcoes}>
        {(campo.options ?? []).map((opcao, i) => <div className={styles.opcao} key={opcao.id ?? i}>
          <TextField label={`Opção ${i + 1}`} value={opcao.name} required maxLength={80} onChange={(e) => alterar(indice, { options: campo.options!.map((item, j) => i === j ? { ...item, name: e.target.value } : item) })} />
          <Button variant="secondary" size="sm" iconOnly icon={<Trash2 size={14} />} aria-label={`Remover opção ${opcao.name || i + 1}`} disabled={campo.options!.length <= 1 || (campo.id === perfil?.bindings.installationType.fieldId && !!opcao.id && opcoesVinculadas.has(opcao.id))} onClick={() => alterar(indice, { options: campo.options!.filter((_, j) => i !== j) })} />
        </div>)}
        <Button variant="secondary" size="sm" disabled={(campo.options?.length ?? 0) >= 60} onClick={() => alterar(indice, { options: [...(campo.options ?? []), { name: "" }] })}>Adicionar opção</Button>
      </div> : null}
      <div className={styles.grade}>
        <Checkbox label="Mostrar no cartão do Kanban" checked={campo.showOnCard} onChange={(e) => alterar(indice, { showOnCard: e.target.checked })} />
        <Checkbox label="Mostrar na lista de negócios" checked={campo.showInList} onChange={(e) => alterar(indice, { showInList: e.target.checked })} />
      </div>
    </section>;
    })}
    {alvo ? <Modal rotulo="Excluir campo preenchido?" aoFechar={() => setExcluindo(null)}><div className={styles.confirmacao}>
      <h2>Excluir “{alvo.name}”?</h2><p>Este campo está preenchido em {alvo.valueCount} {alvo.valueCount === 1 ? "negócio" : "negócios"}. Ao salvar o pipeline, os valores serão removidos. O histórico anterior será preservado.</p>
      <div className={styles.acoes}><Button variant="secondary" autoFocus onClick={() => setExcluindo(null)}>Cancelar</Button><Button variant="danger" onClick={() => remover(alvo.chave)}>Excluir campo e valores</Button></div>
    </div></Modal> : null}
  </div>;
}
