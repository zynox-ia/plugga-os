"use client";

import type { Pipeline, PipelinePerson } from "@plugga/shared";
import { TextField } from "../ui/fields";
import type { PropsEdicaoLead } from "./ficha-do-lead";
import styles from "./detalhes-do-lead-modal.module.css";
import camposStyles from "./campos-proprios-do-negocio.module.css";

export function CamposPropriosDoNegocio({ pipeline, responsaveis, rascunho, aoAlterar, erros }: PropsEdicaoLead & { pipeline: Pipeline; responsaveis: PipelinePerson[] }) {
  if (!pipeline.fields?.length) return null;
  const solar = pipeline.processProfile?.key === "solar_commercial";
  function alterar(id: string, valor: string | boolean | null) {
    aoAlterar((atual) => atual && { ...atual, customFields: { ...atual.customFields, [id]: valor } });
  }
  return <div className={`${styles.painelCard}${solar ? ` ${camposStyles.solar}` : ""}`}>
    <div className={`${styles.painelCardHeader}${solar ? ` ${camposStyles.inteira}` : ""}`}><h4>Dados de {pipeline.name}</h4></div>
    {erros.customFields ? <p className={`ui-field-error${solar ? ` ${camposStyles.inteira}` : ""}`} role="alert">{erros.customFields}</p> : null}
    {pipeline.fields.map((campo) => {
      const valor = rascunho.customFields[campo.id];
      const id = `campo-negocio-${campo.id}`;
      const erro = erros[`customFields.${campo.id}`];
      if (campo.type === "select" || campo.type === "person" || campo.type === "boolean") {
        const opcoes = campo.type === "boolean" ? [{ id: "true", name: "Sim" }, { id: "false", name: "Não" }]
          : campo.type === "person" ? responsaveis : campo.options;
        return <div className="ui-field" key={campo.id}><label htmlFor={id}>{campo.name}</label>
          <select id={id} className="ui-input" value={valor == null ? "" : String(valor)} aria-invalid={!!erro} aria-describedby={erro ? `${id}-erro` : undefined} onChange={(e) => alterar(campo.id, e.target.value === "" ? null : campo.type === "boolean" ? e.target.value === "true" : e.target.value)}>
            <option value="">Não informado</option>
            {typeof valor === "string" && valor && !opcoes.some((opcao) => opcao.id === valor) ? <option value={valor} disabled>{campo.type === "person" ? "Pessoa indisponível" : "Opção indisponível"}</option> : null}
            {opcoes.map((opcao) => <option value={opcao.id} key={opcao.id}>{opcao.name}</option>)}
          </select>{erro ? <p id={`${id}-erro`} className="ui-field-error">{erro}</p> : null}
        </div>;
      }
      const decimal = campo.type === "number" || campo.type === "money";
      return <TextField key={campo.id} id={id} label={campo.name} type={campo.type === "date" ? "date" : "text"} inputMode={decimal ? "decimal" : undefined} value={typeof valor === "string" ? decimal ? valor.replace(".", ",") : valor : ""} maxLength={decimal ? 26 : 4000} hint={decimal ? "Sem separador de milhar. Exemplo: 1234,50." : undefined} prefix={campo.type === "money" ? "R$" : undefined} error={erro} onChange={(e) => alterar(campo.id, (decimal ? e.target.value.replace(",", ".") : e.target.value) || null)} />;
    })}
  </div>;
}
