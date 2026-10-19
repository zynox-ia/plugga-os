"use client";

import type { CompanyKey } from "@plugga/shared";
import { useState } from "react";

import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { CORES, NOME_DA_COR, type Rascunho } from "../../lib/pipelines";
import { Icone } from "./icones";
import { SecaoEquipe, SecaoEtapas, SecaoEtiquetas, SecaoMotivos } from "./secoes-do-pipeline";

type Aba = "geral" | "etapas" | "etiquetas" | "motivos" | "equipe";
const ABAS: { id: Aba; rotulo: string; campos: string[] }[] = [
  { id: "geral", rotulo: "Geral", campos: ["companyId", "name", "description", "valueLabel", "color"] },
  { id: "etapas", rotulo: "Etapas", campos: ["stages", "wonLabel", "lostLabel"] },
  { id: "etiquetas", rotulo: "Etiquetas", campos: ["tags"] },
  { id: "motivos", rotulo: "Motivos de perda", campos: ["lossReasons"] },
  { id: "equipe", rotulo: "Equipe", campos: ["members"] },
];

export type PropsDaSecao = { rascunho: Rascunho; aoAlterar: (parcial: Partial<Rascunho>) => void; erros: Record<string, string> };

export function EditorDePipeline({
  rascunho,
  aoAlterar,
  empresasPermitidas,
  nomesDaEquipe,
  erros,
}: PropsDaSecao & { empresasPermitidas: CompanyKey[]; nomesDaEquipe: Record<string, string> }) {
  const [aba, setAba] = useState<Aba>("geral");
  const contagem: Partial<Record<Aba, number>> = {
    etapas: rascunho.stages.length,
    etiquetas: rascunho.tags.length,
    motivos: rascunho.lossReasons.length,
    equipe: rascunho.members.length,
  };

  return (
    <div className="editor-pipeline">
      <div className="abas abas-editor" role="tablist" aria-label="Seções do pipeline">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`aba-${a.id}`}
            aria-controls={`painel-${a.id}`}
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
            {contagem[a.id] !== undefined ? <span className="aba-contagem">{contagem[a.id]}</span> : null}
            {a.campos.some((campo) => erros[campo]) ? <span className="marca-erro" aria-label="(com erro)" /> : null}
          </button>
        ))}
      </div>
      <section id={`painel-${aba}`} role="tabpanel" aria-labelledby={`aba-${aba}`} className="painel-pipeline">
        {aba === "geral" ? <SecaoGeral rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} empresasPermitidas={empresasPermitidas} /> : null}
        {aba === "etapas" ? <SecaoEtapas rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} /> : null}
        {aba === "etiquetas" ? <SecaoEtiquetas rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} /> : null}
        {aba === "motivos" ? <SecaoMotivos rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} /> : null}
        {aba === "equipe" ? <SecaoEquipe rascunho={rascunho} aoAlterar={aoAlterar} erros={erros} nomesDaEquipe={nomesDaEquipe} /> : null}
      </section>
    </div>
  );
}

function SecaoGeral({ rascunho, aoAlterar, erros, empresasPermitidas }: PropsDaSecao & { empresasPermitidas: CompanyKey[] }) {
  return (
    <div className="form-grade">
      <div className="field">
        <label htmlFor="pipeline-nome">Nome do pipeline *</label>
        <input
          id="pipeline-nome"
          value={rascunho.name}
          maxLength={60}
          placeholder="Ex.: Solar"
          aria-invalid={Boolean(erros.name)}
          aria-describedby={erros.name ? "pipeline-nome-erro" : undefined}
          onChange={(e) => aoAlterar({ name: e.target.value })}
        />
        {erros.name ? (
          <span className="erro-campo" id="pipeline-nome-erro">
            {erros.name}
          </span>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="pipeline-valor">Nome do campo de valor *</label>
        <input
          id="pipeline-valor"
          value={rascunho.valueLabel}
          maxLength={40}
          placeholder="Ex.: Investimento estimado"
          onChange={(e) => aoAlterar({ valueLabel: e.target.value })}
        />
      </div>

      <fieldset className="inteira">
        <legend>Empresa *</legend>
        <div className="opcoes-empresa">
          {Object.values(EMPRESAS_POR_ID).map((empresa) => {
            const permitida = empresasPermitidas.includes(empresa.id);
            return (
              <label key={empresa.id} className={`opcao-empresa opcao-empresa--${empresa.id}${permitida ? "" : " opcao-empresa--bloqueada"}`}>
                <input
                  type="radio"
                  name="pipeline-empresa"
                  value={empresa.id}
                  checked={rascunho.companyId === empresa.id}
                  disabled={!permitida}
                  onChange={() => aoAlterar({ companyId: empresa.id, members: [] })}
                />
                <span className="opcao-empresa-texto">
                  <b>{empresa.nome}</b>
                  <small>{empresa.descricao}</small>
                </span>
              </label>
            );
          })}
        </div>
        <p className="nota-pipeline">
          <Icone nome="info" tamanho={14} />
          Todo negócio deste pipeline pertence a esta empresa. Trocar a empresa limpa a equipe, que vem das pessoas da empresa.
        </p>
      </fieldset>

      <div className="field inteira">
        <label htmlFor="pipeline-descricao">Descrição</label>
        <textarea
          id="pipeline-descricao"
          rows={2}
          maxLength={500}
          placeholder="O que se vende neste pipeline"
          value={rascunho.description ?? ""}
          onChange={(e) => aoAlterar({ description: e.target.value === "" ? null : e.target.value })}
        />
      </div>

      <fieldset className="inteira">
        <legend>Cor do pipeline</legend>
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
