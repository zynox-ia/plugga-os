"use client";

import type { CompanyKey, Pipeline } from "@plugga/shared";
import { useState } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { formatarDataHoraCurta } from "../../lib/format";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { mesmoConteudo, paraCriacao, paraEdicao, rascunhoDe, rascunhoNovo, type Rascunho } from "../../lib/pipelines";
import { Modal } from "../modal";
import { EditorDePipeline } from "./editor-de-pipeline";
import { Icone } from "./icones";

const DESCARTAR = "Há alterações não salvas neste pipeline. Descartar?";
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Modal "Configurar pipelines" (PLU-269): à esquerda, os pipelines que a pessoa
 * configura; à direita, o pipeline escolhido em edição. Tudo é salvo de uma vez
 * pelo rodapé, e a API recusa se outra pessoa salvou antes.
 */
export function ConfiguracaoDePipelines({
  pipelines,
  canCreateIn,
  inicialId,
  comecarNovo = false,
  aoFechar,
}: {
  pipelines: Pipeline[];
  canCreateIn: CompanyKey[];
  inicialId: string | null;
  comecarNovo?: boolean;
  aoFechar: () => void;
}) {
  const [lista, setLista] = useState(() => pipelines.filter((p) => p.canConfigure));
  const [original, setOriginal] = useState<Rascunho | null>(() => {
    if (comecarNovo) return null;
    const inicial = lista.find((p) => p.id === inicialId && p.archivedAt === null) ?? lista.find((p) => p.archivedAt === null);
    return inicial ? rascunhoDe(inicial) : null;
  });
  const [rascunho, setRascunho] = useState<Rascunho | null>(() => (comecarNovo && canCreateIn[0] ? rascunhoNovo(canCreateIn[0]) : original));
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
    setLista((anteriores) => (anteriores.some((p) => p.id === pipeline.id) ? anteriores.map((p) => (p.id === pipeline.id ? pipeline : p)) : [...anteriores, pipeline]));
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
        <span className="config-item-nome">
          <span className="ponto-cor" style={{ background: p.color }} aria-hidden="true" />
          {p.name}
        </span>
        <span className="config-item-meta">
          <span className={`selo-empresa selo-empresa--${p.companyId}`}>{EMPRESAS_POR_ID[p.companyId].nome}</span>
          {plural(p.stages.length, "etapa", "etapas")} · {plural(p.members.length, "pessoa", "pessoas")}
        </span>
      </button>
    </li>
  );

  return (
    <Modal rotulo="Configurar pipelines" largura="larga" aoFechar={() => podeSair() && aoFechar()}>
      <div className="modal-topo config-topo">
        <div>
          <span className="eyebrow eyebrow--azul">Comercial · Configuração</span>
          <h2>Configurar pipelines</h2>
        </div>
        <div className="config-topo-acoes">
          {canCreateIn.length > 0 ? (
            <button className="button button--accent" type="button" onClick={() => abrir(rascunhoNovo(canCreateIn[0]!))}>
              <Icone nome="mais" />
              Novo pipeline
            </button>
          ) : null}
          <button className="botao-fechar" type="button" aria-label="Fechar" onClick={() => podeSair() && aoFechar()}>
            <Icone nome="x" />
          </button>
        </div>
      </div>

      <div className="config-pipelines">
        <nav className="config-lista" aria-label="Pipelines que você configura">
          <span className="config-lista-titulo">Pipelines</span>
          {rascunho && !rascunho.id ? (
            <div className="config-item config-item--novo" aria-current="true">
              <span className="config-item-nome">
                <span className="ponto-cor" style={{ background: rascunho.color }} aria-hidden="true" />
                {rascunho.name || "Pipeline novo"}
              </span>
              <span className="config-item-meta">Ainda não salvo</span>
            </div>
          ) : null}
          {ativos.length > 0 ? <ul>{ativos.map(item)}</ul> : <p className="config-lista-vazia">Nenhum pipeline ativo.</p>}
          {arquivados.length > 0 ? (
            <details className="config-arquivados">
              <summary>
                <Icone nome="arquivo" tamanho={14} />
                Arquivados ({arquivados.length})
              </summary>
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
              negociosPorEtapa={Object.fromEntries((atual?.stages ?? []).map((e) => [e.id, e.dealCount]))}
              totalDeNegocios={atual?.dealCount ?? 0}
              erros={erro?.porCampo ?? {}}
            />
          ) : (
            <div className="config-editor-vazio">
              <Icone nome="engrenagem" tamanho={26} />
              <p>{canCreateIn.length > 0 ? "Escolha um pipeline à esquerda ou crie um novo." : "Escolha um pipeline à esquerda."}</p>
            </div>
          )}
        </div>
      </div>

      {rascunho ? (
        <div className="modal-rodape config-rodape">
          <span className="config-rastro">
            {atual?.archivedAt ? <span className="selo-arquivado">Arquivado</span> : null}
            {atual?.updatedBy ? `Alterado por ${atual.updatedBy.name} em ${formatarDataHoraCurta(atual.updatedAt)}` : rascunho.id ? "" : "Pipeline novo, ainda não salvo"}
          </span>
          {erro ? (
            <p className="aviso aviso--erro" role="alert">
              {erro.mensagem}
            </p>
          ) : salvo ? (
            <p className="aviso aviso--sucesso" role="status">
              <Icone nome="check" tamanho={14} /> Alterações salvas.
            </p>
          ) : null}
          {atual ? (
            <button className="button button--secondary" type="button" disabled={enviando} onClick={() => mudarSituacao(atual.archivedAt ? "reativar" : "arquivar")}>
              <Icone nome="arquivo" />
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
