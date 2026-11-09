"use client";

import type { CompanyKey, ListPipelinesResponse, Pipeline, PipelineField } from "@plugga/shared";
import { Archive, Cog } from "lucide-react";
import { useState } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { conferirCamposAntesDeSalvar, mesclarPipelineAtual, mesmoConteudo, paraCriacao, paraEdicao, rascunhoDe, rascunhoNovo, type Rascunho } from "../../lib/pipelines";
import { Modal } from "../modal";
import { Button } from "../ui/button";
import { IconAlertTriangle, IconCheck, IconPlus, IconSettings, IconX } from "../ui/icons";
import { EditorDePipeline } from "./editor-de-pipeline";
import estilosCampos from "./campos-do-pipeline.module.css";

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
  const [confirmandoRemocoes, setConfirmandoRemocoes] = useState<PipelineField[] | null>(null);

  const atual = rascunho?.id ? (lista.find((p) => p.id === rascunho.id) ?? null) : null;
  const sujo = rascunho !== null && (original === null || !mesmoConteudo(rascunho, original));
  const ativos = lista.filter((p) => p.archivedAt === null);
  const arquivados = lista.filter((p) => p.archivedAt !== null);

  const podeSair = () => !sujo || window.confirm(DESCARTAR);

  async function abrir(proximo: Rascunho) {
    if (enviando || !podeSair()) return;
    if (proximo.id) {
      setEnviando(true);
      setErro(null);
      const resposta = await enviar<ListPipelinesResponse>(`/api/pipelines?pipelineId=${encodeURIComponent(proximo.id)}`, "GET");
      setEnviando(false);
      if (!resposta.ok) return setErro(resposta.erro);
      const atual = resposta.dados.pipelines.find((pipeline) => pipeline.id === proximo.id && pipeline.canConfigure);
      if (!atual) return setErro({ mensagem: "Você não pode mais configurar este pipeline. Suas alterações foram preservadas.", porCampo: {} });
      setLista((lista) => mesclarPipelineAtual(lista, atual));
      proximo = rascunhoDe(atual);
    }
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

  async function salvar(remocoesConfirmadas: string[] = []) {
    if (!rascunho || enviando) return;
    setEnviando(true);
    setErro(null);
    setSalvo(false);
    setConfirmandoRemocoes(null);
    let paraSalvar = { ...rascunho, confirmedFieldRemovals: [...new Set([...(rascunho.confirmedFieldRemovals ?? []), ...remocoesConfirmadas])] };
    if (rascunho.id && original) {
      const leitura = await enviar<ListPipelinesResponse>(`/api/pipelines?pipelineId=${encodeURIComponent(rascunho.id)}`, "GET");
      if (!leitura.ok) {
        setEnviando(false);
        return setErro(leitura.erro);
      }
      const atual = leitura.dados.pipelines.find((p) => p.id === rascunho.id && p.canConfigure);
      if (!atual) {
        setEnviando(false);
        return setErro({ mensagem: "Você não pode mais configurar este pipeline. Suas alterações foram preservadas.", porCampo: {} });
      }
      const conferido = conferirCamposAntesDeSalvar(original, paraSalvar, atual);
      if (conferido.conflito) {
        setEnviando(false);
        return setErro({ mensagem: "Outra pessoa alterou este pipeline. Suas alterações foram preservadas; reabra a configuração para ver a versão atual.", porCampo: {} });
      }
      paraSalvar = conferido.rascunho;
      setLista((lista) => mesclarPipelineAtual(lista, atual));
      setOriginal(conferido.original);
      setRascunho(paraSalvar);
      if (conferido.removidos.length) {
        setConfirmandoRemocoes(conferido.removidos);
        setEnviando(false);
        return;
      }
    }
    const resposta =
      paraSalvar.id && paraSalvar.updatedAt
        ? await enviar<Pipeline>(`/api/pipelines/${paraSalvar.id}`, "PUT", paraEdicao(paraSalvar, paraSalvar.updatedAt))
        : await enviar<Pipeline>("/api/pipelines", "POST", paraCriacao(paraSalvar));
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
      <button
        type="button"
        className="config-item"
        disabled={enviando}
        aria-current={rascunho?.id === p.id ? "true" : undefined}
        onClick={() => abrir(rascunhoDe(p))}
      >
        <span className="config-item-nome">
          <span className="ponto-cor" style={{ background: p.color }} aria-hidden="true" />
          {p.name}
        </span>
        <span className="config-item-meta">
          <span className={`ui-badge ui-tone--${p.companyId === "plugga" ? "info" : "success"} selo-empresa`}>
            {EMPRESAS_POR_ID[p.companyId].nome}
          </span>
          <span className="config-item-contagens">
            {plural(p.stages.length, "etapa", "etapas")}
          </span>
        </span>
      </button>
    </li>
  );

  return (<>
    <Modal
      rotulo="Configurar pipelines"
      largura="larga"
      className="ui-dialog ui-dialog--config-pipelines"
      aoFechar={() => !enviando && podeSair() && aoFechar()}
    >
      <header className="ui-dialog-header">
        <div className="ui-dialog-header-content">
          <div className="ui-dialog-header-icon" aria-hidden="true">
            <IconSettings />
          </div>
          <div className="ui-dialog-header-text">
            <h2 className="ui-dialog-title">Configurar pipelines</h2>
            <p className="ui-dialog-subtitle">Gerencie funis, etapas e etiquetas.</p>
          </div>
        </div>
        <div className="config-topo-acoes">
          {!rascunho && canCreateIn.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              icon={<IconPlus />}
              onClick={() => abrir(rascunhoNovo(canCreateIn[0]!))}
            >
              Novo pipeline
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            icon={<IconX />}
            iconOnly
            aria-label="Fechar diálogo"
            disabled={enviando}
            onClick={() => !enviando && podeSair() && aoFechar()}
          />
        </div>
      </header>

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
                <Archive size={14} aria-hidden="true" />
                Arquivados ({arquivados.length})
              </summary>
              <ul>{arquivados.map(item)}</ul>
            </details>
          ) : null}
        </nav>

        <div className="config-editor" inert={enviando}>
          {rascunho ? (
            <EditorDePipeline
              key={rascunho.id ?? "novo"}
              rascunho={rascunho}
              aoCriarPipeline={canCreateIn.length > 0 ? () => abrir(rascunhoNovo(canCreateIn[0]!)) : undefined}
              aoAlterar={(parcial) => {
                setRascunho((anterior) => (anterior ? { ...anterior, ...parcial } : anterior));
                setSalvo(false);
              }}
              empresasPermitidas={rascunho.id === null ? canCreateIn : canCreateIn.includes(rascunho.companyId) ? canCreateIn : [rascunho.companyId]}
              negociosPorEtapa={Object.fromEntries((atual?.stages ?? []).map((e) => [e.id, e.dealCount]))}
              totalDeNegocios={atual?.dealCount ?? 0}
              erros={erro?.porCampo ?? {}}
            />
          ) : (
            <div className="config-editor-vazio">
              <Cog size={28} className="config-editor-vazio-icone" aria-hidden="true" />
              <p>{canCreateIn.length > 0 ? "Escolha um pipeline à esquerda ou crie um novo." : "Escolha um pipeline à esquerda."}</p>
            </div>
          )}
        </div>
      </div>

      {rascunho ? (
        <footer className="ui-dialog-footer config-rodape">
          <div className="config-rodape-esquerda">
            <Button
              variant="secondary"
              size="sm"
              disabled={!sujo || enviando}
              onClick={() => setRascunho(original)}
            >
              Descartar
            </Button>
            {atual?.archivedAt ? <span className="ui-badge ui-tone--warning">Arquivado</span> : null}
            {erro ? (
              <p className="aviso aviso--erro" role="alert">
                <IconAlertTriangle /> {erro.mensagem}
              </p>
            ) : salvo ? (
              <p className="aviso aviso--sucesso" role="status">
                <IconCheck /> Alterações salvas.
              </p>
            ) : null}
          </div>

          <div className="ui-dialog-actions config-rodape-acoes">
            {atual ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={enviando}
                icon={<Archive size={14} />}
                onClick={() => mudarSituacao(atual.archivedAt ? "reativar" : "arquivar")}
              >
                {atual.archivedAt ? "Reativar" : "Arquivar"}
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              loading={enviando}
              disabled={!sujo || enviando}
              onClick={() => { void salvar(); }}
            >
              {rascunho.id ? "Salvar alterações" : "Criar pipeline"}
            </Button>
          </div>
        </footer>
      ) : null}
    </Modal>
    {confirmandoRemocoes ? (
      <Modal rotulo="Excluir campos preenchidos?" aoFechar={() => setConfirmandoRemocoes(null)}>
        <div className={estilosCampos.confirmacao}>
          <h2>Excluir campos preenchidos?</h2>
          <p>Confira as contagens atuais. Ao salvar, os valores destes campos serão removidos. O histórico anterior será preservado.</p>
          <ul>{confirmandoRemocoes.map((campo) => <li key={campo.id}>“{campo.name}”: {plural(campo.valueCount, "negócio", "negócios")}</li>)}</ul>
          <div className={estilosCampos.acoes}>
            <Button variant="secondary" autoFocus onClick={() => setConfirmandoRemocoes(null)}>Continuar editando</Button>
            <Button variant="danger" onClick={() => { void salvar(confirmandoRemocoes.map((campo) => campo.id)); }}>Excluir campos e salvar</Button>
          </div>
        </div>
      </Modal>
    ) : null}
  </>);
}
