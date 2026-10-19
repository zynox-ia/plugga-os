"use client";

import type { CompanyKey, Pipeline } from "@plugga/shared";
import { useState } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { formatarDataHoraCurta } from "../../lib/format";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { mesmoConteudo, paraCriacao, paraEdicao, rascunhoDe, rascunhoNovo, type Rascunho } from "../../lib/pipelines";
import { Modal } from "../modal";
import { EditorDePipeline } from "./editor-de-pipeline";

const DESCARTAR = "Há alterações não salvas neste pipeline. Descartar?";

/**
 * Modal "Configurar pipelines" (PLU-269): à esquerda, os pipelines que a pessoa
 * configura; à direita, o pipeline escolhido em edição. Tudo é salvo de uma vez
 * pelo rodapé, e a API recusa se outra pessoa salvou antes.
 */
export function ConfiguracaoDePipelines({
  pipelines,
  canCreateIn,
  inicialId,
  aoFechar,
}: {
  pipelines: Pipeline[];
  canCreateIn: CompanyKey[];
  inicialId: string | null;
  aoFechar: () => void;
}) {
  const [lista, setLista] = useState(() => pipelines.filter((p) => p.canConfigure));
  const inicial = lista.find((p) => p.id === inicialId && p.archivedAt === null) ?? lista.find((p) => p.archivedAt === null) ?? null;
  const [original, setOriginal] = useState<Rascunho | null>(() => (inicial ? rascunhoDe(inicial) : null));
  const [rascunho, setRascunho] = useState<Rascunho | null>(original);
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const atual = rascunho?.id ? (lista.find((p) => p.id === rascunho.id) ?? null) : null;
  const sujo = rascunho !== null && (original === null || !mesmoConteudo(rascunho, original));
  const ativos = lista.filter((p) => p.archivedAt === null);
  const arquivados = lista.filter((p) => p.archivedAt !== null);

  const podeSair = () => !sujo || window.confirm(DESCARTAR);

  function abrir(proximo: Rascunho) {
    if (!podeSair()) return;
    setOriginal(proximo.id ? proximo : null);
    setRascunho(proximo);
    setErro(null);
    setSalvo(false);
  }

  function gravado(pipeline: Pipeline) {
    setLista((anteriores) => [...anteriores.filter((p) => p.id !== pipeline.id), pipeline]);
    const novo = rascunhoDe(pipeline);
    setOriginal(novo);
    setRascunho(novo);
  }

  async function salvar() {
    if (!rascunho) return;
    setEnviando(true);
    setErro(null);
    setSalvo(false);
    const resposta =
      rascunho.id && rascunho.updatedAt
        ? await enviar<Pipeline>(`/api/pipelines/${rascunho.id}`, "PUT", paraEdicao(rascunho, rascunho.updatedAt))
        : await enviar<Pipeline>("/api/pipelines", "POST", paraCriacao(rascunho));
    setEnviando(false);
    if (!resposta.ok) return setErro(resposta.erro);
    gravado(resposta.dados);
    setSalvo(true);
  }

  async function mudarSituacao(acao: "arquivar" | "reativar") {
    if (!rascunho?.id || !podeSair()) return;
    setEnviando(true);
    setErro(null);
    setSalvo(false);
    const resposta = await enviar<Pipeline>(`/api/pipelines/${rascunho.id}/${acao}`, "POST");
    setEnviando(false);
    if (!resposta.ok) return setErro(resposta.erro);
    gravado(resposta.dados);
  }

  const item = (p: Pipeline) => (
    <li key={p.id}>
      <button type="button" className="config-item" aria-current={rascunho?.id === p.id ? "true" : undefined} onClick={() => abrir(rascunhoDe(p))}>
        <b>{p.name}</b>
        <span className={`selo-empresa selo-empresa--${p.companyId}`}>{EMPRESAS_POR_ID[p.companyId].nome}</span>
        <small>{p.stages.length === 1 ? "1 etapa" : `${p.stages.length} etapas`}</small>
      </button>
    </li>
  );

  return (
    <Modal rotulo="Configurar pipelines" largura="larga" aoFechar={() => podeSair() && aoFechar()}>
      <div className="modal-topo">
        <div>
          <span className="eyebrow">Comercial · Configuração</span>
          <h2>Configurar pipelines</h2>
        </div>
        <div className="row-actions">
          {canCreateIn.length > 0 ? (
            <button className="button button--accent" type="button" onClick={() => abrir(rascunhoNovo(canCreateIn[0]!))}>
              + Novo pipeline
            </button>
          ) : null}
          <button className="botao-fechar" type="button" aria-label="Fechar" onClick={() => podeSair() && aoFechar()}>
            ✕
          </button>
        </div>
      </div>

      <div className="config-pipelines">
        <nav className="config-lista" aria-label="Pipelines que você configura">
          {ativos.length > 0 ? <ul>{ativos.map(item)}</ul> : <p className="ficha-vazio">Nenhum pipeline ativo.</p>}
          {arquivados.length > 0 ? (
            <details>
              <summary>Arquivados ({arquivados.length})</summary>
              <ul>{arquivados.map(item)}</ul>
            </details>
          ) : null}
        </nav>

        <div className="config-editor">
          {rascunho ? (
            <EditorDePipeline
              key={rascunho.id ?? "novo"}
              rascunho={rascunho}
              aoAlterar={(parcial) => {
                setRascunho((anterior) => (anterior ? { ...anterior, ...parcial } : anterior));
                setSalvo(false);
              }}
              empresasPermitidas={rascunho.id === null ? canCreateIn : canCreateIn.includes(rascunho.companyId) ? canCreateIn : [rascunho.companyId]}
              nomesDaEquipe={Object.fromEntries((atual?.members ?? []).map((m) => [m.userId, m.name]))}
              erros={erro?.porCampo ?? {}}
            />
          ) : (
            <p className="ficha-vazio">
              {canCreateIn.length > 0 ? "Escolha um pipeline à esquerda ou crie um novo." : "Escolha um pipeline à esquerda."}
            </p>
          )}
        </div>
      </div>

      {rascunho ? (
        <div className="modal-rodape config-rodape">
          <span className="config-rastro">
            {atual?.archivedAt ? "Arquivado. " : ""}
            {atual?.updatedBy ? `Alterado por ${atual.updatedBy.name} em ${formatarDataHoraCurta(atual.updatedAt)}` : rascunho.id ? "" : "Pipeline novo, ainda não salvo"}
          </span>
          {erro ? (
            <p className="aviso aviso--erro" role="alert">
              {erro.mensagem}
            </p>
          ) : salvo ? (
            <p className="aviso aviso--sucesso" role="status">
              Alterações salvas.
            </p>
          ) : null}
          {atual ? (
            <button className="button button--secondary" type="button" disabled={enviando} onClick={() => mudarSituacao(atual.archivedAt ? "reativar" : "arquivar")}>
              {atual.archivedAt ? "Reativar" : "Arquivar"}
            </button>
          ) : null}
          <button className="button button--secondary" type="button" disabled={!sujo || enviando} onClick={() => setRascunho(original)}>
            Descartar
          </button>
          <button className="button button--accent" type="button" disabled={!sujo || enviando} onClick={salvar}>
            {enviando ? "Salvando…" : rascunho.id ? "Salvar alterações" : "Criar pipeline"}
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
