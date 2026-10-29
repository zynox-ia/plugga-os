"use client";

import type { CompanyKey } from "@plugga/shared";
import { useState } from "react";

import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { CORES, NOME_DA_COR, type Rascunho } from "../../lib/pipelines";
import { TextField, TextareaField } from "../ui/fields";
import { IconAlertTriangle } from "../ui/icons";
import { Radio } from "../ui/selection";
import { SecaoEquipe, SecaoEtapas, SecaoEtiquetas } from "./secoes-do-pipeline";

type Aba = "geral" | "etapas" | "etiquetas" | "equipe";
const ABAS: { id: Aba; rotulo: string; campos: string[] }[] = [
  { id: "geral", rotulo: "Geral", campos: ["companyId", "name", "description", "valueLabel", "color"] },
  { id: "etapas", rotulo: "Etapas", campos: ["stages", "wonLabel", "lostLabel"] },
  { id: "etiquetas", rotulo: "Etiquetas", campos: ["tags"] },
  { id: "equipe", rotulo: "Equipe", campos: ["members"] },
];

export type PropsDaSecao = { rascunho: Rascunho; aoAlterar: (parcial: Partial<Rascunho>) => void; erros: Record<string, string> };

export function EditorDePipeline({
  rascunho,
  aoAlterar,
  empresasPermitidas,
  nomesDaEquipe,
  negociosPorEtapa,
  totalDeNegocios,
  erros,
}: PropsDaSecao & {
  empresasPermitidas: CompanyKey[];
  nomesDaEquipe: Record<string, string>;
  negociosPorEtapa: Record<string, number>;
  totalDeNegocios: number;
}) {
  const [aba, setAba] = useState<Aba>("geral");

  return (
    <div className="editor-pipeline">
      <nav className="abas-editor" role="tablist" aria-label="Seções do pipeline">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`aba-${a.id}`}
            aria-controls={`painel-${a.id}`}
            aria-selected={aba === a.id}
            className={`aba-item${aba === a.id ? " aba-item--ativa" : ""}`}
            onClick={() => setAba(a.id)}
          >
            <span>{a.rotulo}</span>
            {a.campos.some((campo) => erros[campo]) ? <span className="marca-erro" aria-label="(com erro)" /> : null}
          </button>
        ))}
      </nav>
      <section id={`painel-${aba}`} role="tabpanel" aria-labelledby={`aba-${aba}`} className="painel-pipeline">
        {aba === "geral" ? <SecaoGeral rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} empresasPermitidas={totalDeNegocios > 0 ? [rascunho.companyId] : empresasPermitidas} totalDeNegocios={totalDeNegocios} /> : null}
        {aba === "etapas" ? <SecaoEtapas rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} negociosPorEtapa={negociosPorEtapa} /> : null}
        {aba === "etiquetas" ? <SecaoEtiquetas rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} /> : null}
        {aba === "equipe" ? <SecaoEquipe rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} nomesDaEquipe={nomesDaEquipe} /> : null}
      </section>
    </div>
  );
}

function SecaoGeral({ rascunho, aoAlterar, erros, empresasPermitidas, totalDeNegocios }: PropsDaSecao & { empresasPermitidas: CompanyKey[]; totalDeNegocios: number }) {
  return (
    <div className="form-grade">
      <TextField
        id="pipeline-nome"
        label="Nome do pipeline"
        required
        value={rascunho.name}
        maxLength={60}
        placeholder="Ex.: Solar"
        error={erros.name}
        onChange={(e) => aoAlterar({ name: e.target.value })}
      />
      <TextField
        id="pipeline-valor"
        label="Nome do campo de valor"
        required
        value={rascunho.valueLabel}
        maxLength={40}
        placeholder="Ex.: Investimento estimado"
        error={erros.valueLabel}
        onChange={(e) => aoAlterar({ valueLabel: e.target.value })}
      />

      <fieldset className="inteira secao-empresa-pipeline">
        <label className="ui-field-label">
          Empresa <span className="ui-required">(obrigatório)</span>
        </label>
        <div className="opcoes-empresa">
          {Object.values(EMPRESAS_POR_ID).map((empresa) => {
            const permitida = empresasPermitidas.includes(empresa.id);
            const selecionada = rascunho.companyId === empresa.id;
            return (
              <div
                key={empresa.id}
                className={`ui-role-card opcao-empresa opcao-empresa--${empresa.id}${selecionada ? " ui-role-card--active" : ""}${permitida ? "" : " opcao-empresa--bloqueada"}`}
                onClick={() => permitida && aoAlterar({ companyId: empresa.id, members: [] })}
              >
                <Radio
                  name="pipeline-empresa"
                  label={empresa.nome}
                  description={empresa.descricao}
                  checked={selecionada}
                  disabled={!permitida}
                  onChange={() => aoAlterar({ companyId: empresa.id, members: [] })}
                />
              </div>
            );
          })}
        </div>
        <div className="ui-alert ui-tone--warning nota-pipeline">
          <IconAlertTriangle className="nota-pipeline-icone" />
          <div>
            {totalDeNegocios > 0
              ? `Este pipeline tem ${totalDeNegocios === 1 ? "1 negócio" : `${totalDeNegocios} negócios`} e não muda de empresa. Para levar negócios à outra empresa, mova-os para um pipeline dela.`
              : "Todo negócio deste pipeline pertence a esta empresa. Trocar a empresa limpa a equipe, que vem das pessoas da empresa."}
          </div>
        </div>
      </fieldset>

      <div className="inteira">
        <TextareaField
          id="pipeline-descricao"
          label="Descrição"
          rows={2}
          maxLength={500}
          placeholder="O que se vende neste pipeline"
          value={rascunho.description ?? ""}
          error={erros.description}
          onChange={(e) => aoAlterar({ description: e.target.value === "" ? null : e.target.value })}
        />
      </div>

      <fieldset className="inteira secao-cor-pipeline">
        <label className="ui-field-label">Cor do pipeline</label>
        <div className="paleta" role="radiogroup" aria-label="Cor do pipeline">
          {CORES.map((cor) => (
            <button
              key={cor}
              type="button"
              role="radio"
              aria-checked={rascunho.color === cor}
              aria-label={NOME_DA_COR[cor]}
              title={NOME_DA_COR[cor]}
              className="amostra-cor amostra-cor--grande"
              style={{ background: cor }}
              onClick={() => aoAlterar({ color: cor })}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
