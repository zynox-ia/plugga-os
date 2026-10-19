"use client";

import type { CompanyKey } from "@plugga/shared";
import { useState } from "react";

import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { CORES, NOME_DA_COR, type Rascunho } from "../../lib/pipelines";
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
  const comErro = (a: (typeof ABAS)[number]) => a.campos.some((campo) => erros[campo]);

  return (
    <div className="editor-pipeline">
      <div className="abas" role="tablist" aria-label="Seções do pipeline">
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
            {comErro(a) ? <span className="marca-erro" aria-label="(com erro)">•</span> : null}
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

function Erro({ id, texto }: { id: string; texto?: string }) {
  return texto ? (
    <span className="erro-campo" id={id}>
      {texto}
    </span>
  ) : null;
}

function SecaoGeral({ rascunho, aoAlterar, erros, empresasPermitidas }: PropsDaSecao & { empresasPermitidas: CompanyKey[] }) {
  const empresas = Object.values(EMPRESAS_POR_ID);
  return (
    <div className="form-grade">
      <div className="field">
        <label htmlFor="pipeline-nome">Nome do pipeline *</label>
        <input
          id="pipeline-nome"
          value={rascunho.name}
          maxLength={60}
          aria-invalid={Boolean(erros.name)}
          aria-describedby={erros.name ? "pipeline-nome-erro" : undefined}
          onChange={(e) => aoAlterar({ name: e.target.value })}
        />
        <Erro id="pipeline-nome-erro" texto={erros.name} />
      </div>
      <div className="field">
        <label htmlFor="pipeline-valor">Nome do campo de valor *</label>
        <input id="pipeline-valor" value={rascunho.valueLabel} maxLength={40} onChange={(e) => aoAlterar({ valueLabel: e.target.value })} />
        <span className="dica">Ex.: Investimento estimado, Economia anual.</span>
      </div>

      <fieldset className="inteira escolha-empresa">
        <legend>Empresa *</legend>
        <div className="opcoes-empresa">
          {empresas.map((empresa) => {
            const permitida = empresasPermitidas.includes(empresa.id);
            return (
              <label key={empresa.id} className={`opcao-empresa${permitida ? "" : " opcao-empresa--bloqueada"}`}>
                <input
                  type="radio"
                  name="pipeline-empresa"
                  value={empresa.id}
                  checked={rascunho.companyId === empresa.id}
                  disabled={!permitida}
                  onChange={() => aoAlterar({ companyId: empresa.id, members: [] })}
                />
                <span>{empresa.nome}</span>
              </label>
            );
          })}
        </div>
        <span className="dica">
          Todo negócio deste pipeline pertence a esta empresa. Trocar a empresa limpa a equipe, porque ela vem das pessoas da empresa.
        </span>
      </fieldset>

      <div className="field inteira">
        <label htmlFor="pipeline-descricao">Descrição</label>
        <textarea
          id="pipeline-descricao"
          rows={2}
          maxLength={500}
          value={rascunho.description ?? ""}
          onChange={(e) => aoAlterar({ description: e.target.value === "" ? null : e.target.value })}
        />
      </div>

      <fieldset className="inteira">
        <legend>Cor</legend>
        <div className="paleta" role="radiogroup" aria-label="Cor do pipeline">
          {CORES.map((cor) => (
            <button
              key={cor}
              type="button"
              role="radio"
              aria-checked={rascunho.color === cor}
              aria-label={NOME_DA_COR[cor]}
              title={NOME_DA_COR[cor]}
              className="amostra-cor"
              style={{ background: cor }}
              onClick={() => aoAlterar({ color: cor })}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
