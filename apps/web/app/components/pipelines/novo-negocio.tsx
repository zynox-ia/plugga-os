"use client";

import type { ClientOwner, Deal, DealClientOptionsResponse, Pipeline } from "@plugga/shared";
import { useEffect, useState, type CSSProperties } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { valorDigitadoParaDecimal } from "../../lib/negocios";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { Modal } from "../modal";
import { BuscaDeCliente, type ClienteEscolhido } from "./busca-de-cliente";
import { Icone } from "./icones";

/**
 * Novo negócio (PLU-271, wireframe 5). Pipeline e etapa já vêm de onde foi
 * aberto; a empresa vem do pipeline. Obrigatórios: cliente, título e
 * responsável da equipe. Sem <form>: o cadastro de cliente, aberto por cima,
 * tem o próprio formulário.
 */
export function NovoNegocio({
  pipelines,
  pipelineInicial,
  etapaInicialId,
  usuarioId,
  responsaveisDeCliente,
  aoCriar,
  aoFechar,
}: {
  pipelines: Pipeline[];
  pipelineInicial: Pipeline;
  etapaInicialId: string | null;
  usuarioId: string | null;
  responsaveisDeCliente: ClientOwner[];
  aoCriar: (negocio: Deal) => void;
  aoFechar: () => void;
}) {
  const [pipelineId, setPipelineId] = useState(pipelineInicial.id);
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelineInicial;
  const responsavelPadrao = (p: Pipeline) => (usuarioId && p.members.some((m) => m.userId === usuarioId) ? usuarioId : (p.members[0]?.userId ?? ""));
  const [etapaId, setEtapaId] = useState(etapaInicialId ?? pipelineInicial.stages[0]?.id ?? "");
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(null);
  const [opcoes, setOpcoes] = useState<DealClientOptionsResponse | null>(null);
  const [contatoId, setContatoId] = useState("");
  const [ucs, setUcs] = useState<string[]>([]);
  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState("");
  const [previsao, setPrevisao] = useState("");
  const [responsavelId, setResponsavelId] = useState(responsavelPadrao(pipelineInicial));
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setOpcoes(null);
    setContatoId("");
    setUcs([]);
    if (!cliente) return;
    let vivo = true;
    void enviar<DealClientOptionsResponse>(`/api/negocios/clientes/${cliente.id}/opcoes`, "GET").then((resposta) => {
      if (!vivo || !resposta.ok) return;
      setOpcoes(resposta.dados);
      setContatoId(resposta.dados.contacts.find((c) => c.isPrimary)?.id ?? "");
    });
    return () => {
      vivo = false;
    };
  }, [cliente]);

  function trocarPipeline(id: string) {
    const proximo = pipelines.find((p) => p.id === id);
    if (!proximo) return;
    setPipelineId(id);
    setEtapaId(proximo.stages[0]?.id ?? "");
    setResponsavelId(responsavelPadrao(proximo));
    setEtiquetas([]);
  }

  const alternar = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  async function criar() {
    const decimal = valorDigitadoParaDecimal(valor);
    const porCampo: Record<string, string> = {};
    if (!cliente) porCampo.clientId = "Escolha o cliente.";
    if (!titulo.trim()) porCampo.title = "Informe o título.";
    if (!responsavelId) porCampo.ownerId = "Escolha o responsável.";
    if (decimal === undefined) porCampo.value = "Use só números, como 480.000,00.";
    if (Object.keys(porCampo).length > 0) return setErro({ mensagem: "Confira os campos destacados.", porCampo });

    setEnviando(true);
    setErro(null);
    const resposta = await enviar<Deal>("/api/negocios", "POST", {
      pipelineId,
      stageId: etapaId,
      clientId: cliente!.id,
      contactId: contatoId || null,
      title: titulo,
      value: decimal,
      expectedCloseDate: previsao,
      ownerId: responsavelId,
      tagIds: etiquetas,
      consumerUnitIds: ucs,
    });
    setEnviando(false);
    if (resposta.ok) aoCriar(resposta.dados);
    else setErro(resposta.erro);
  }

  const e = erro?.porCampo ?? {};

  return (
    <Modal rotulo="Novo negócio" aoFechar={aoFechar}>
      <div className="modal-topo">
        <div>
          <span className="eyebrow eyebrow--azul">Comercial</span>
          <h2>Novo negócio</h2>
        </div>
        <button className="botao-fechar config-botao-fechar" type="button" aria-label="Fechar" onClick={aoFechar}>
          <Icone nome="x" />
        </button>
      </div>

      <div className="modal-corpo">
        <div className="form-grade">
          <div className="field">
            <label htmlFor="negocio-pipeline">Pipeline *</label>
            <select id="negocio-pipeline" value={pipelineId} onChange={(ev) => trocarPipeline(ev.target.value)}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {EMPRESAS_POR_ID[p.companyId].nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="negocio-etapa">Etapa inicial *</label>
            <select id="negocio-etapa" value={etapaId} onChange={(ev) => setEtapaId(ev.target.value)}>
              {pipeline.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <p className="nota-pipeline inteira">
            <Icone nome="info" tamanho={14} />A empresa vem do pipeline: este negócio é da {EMPRESAS_POR_ID[pipeline.companyId].nome}.
          </p>

          <div className="field inteira">
            <label htmlFor="negocio-cliente">Cliente *</label>
            <BuscaDeCliente cliente={cliente} aoEscolher={setCliente} responsaveis={responsaveisDeCliente} erro={e.clientId} />
          </div>

          <div className="field inteira">
            <label htmlFor="negocio-titulo">Título *</label>
            <input
              id="negocio-titulo"
              value={titulo}
              maxLength={120}
              placeholder="Ex.: Hotel — usina 120 kWp"
              aria-invalid={Boolean(e.title)}
              onChange={(ev) => setTitulo(ev.target.value)}
            />
            {e.title ? <span className="erro-campo">{e.title}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="negocio-valor">{pipeline.valueLabel}</label>
            <div className="campo-moeda">
              <span aria-hidden="true">R$</span>
              <input id="negocio-valor" inputMode="decimal" placeholder="0,00" value={valor} aria-invalid={Boolean(e.value)} onChange={(ev) => setValor(ev.target.value)} />
            </div>
            {e.value ? <span className="erro-campo">{e.value}</span> : <span className="dica">O nome deste campo vem do pipeline.</span>}
          </div>
          <div className="field">
            <label htmlFor="negocio-previsao">Previsão de fechamento</label>
            <input id="negocio-previsao" type="date" value={previsao} onChange={(ev) => setPrevisao(ev.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="negocio-contato">Contato</label>
            <select id="negocio-contato" value={contatoId} disabled={!opcoes || opcoes.contacts.length === 0} onChange={(ev) => setContatoId(ev.target.value)}>
              <option value="">{!cliente ? "Escolha o cliente primeiro" : opcoes?.contacts.length === 0 ? "Cliente sem contatos" : "Sem contato"}</option>
              {opcoes?.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isPrimary ? " (principal)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="negocio-responsavel">Responsável *</label>
            <select id="negocio-responsavel" value={responsavelId} aria-invalid={Boolean(e.ownerId)} onChange={(ev) => setResponsavelId(ev.target.value)}>
              {pipeline.members.length === 0 ? <option value="">Pipeline sem equipe</option> : null}
              {pipeline.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            {e.ownerId ? <span className="erro-campo">{e.ownerId}</span> : null}
          </div>

          {opcoes && opcoes.consumerUnits.length > 0 ? (
            <fieldset className="inteira escolha-ucs">
              <legend>Unidades consumidoras deste negócio</legend>
              {opcoes.consumerUnits.map((u) => (
                <label key={u.id} className={`opcao-uc${ucs.includes(u.id) ? " opcao-uc--marcada" : ""}`}>
                  <input type="checkbox" checked={ucs.includes(u.id)} onChange={() => setUcs((atual) => alternar(atual, u.id))} />
                  <b>{u.code}</b>
                  <small>{u.distributor}</small>
                </label>
              ))}
            </fieldset>
          ) : null}

          {pipeline.tags.length > 0 ? (
            <fieldset className="inteira">
              <legend>Etiquetas</legend>
              <div className="escolha-etiquetas">
                {pipeline.tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="etiqueta etiqueta--escolha"
                    aria-pressed={etiquetas.includes(t.id)}
                    style={{ "--cor": t.color } as CSSProperties}
                    onClick={() => setEtiquetas((atual) => alternar(atual, t.id))}
                  >
                    {etiquetas.includes(t.id) ? <Icone nome="check" tamanho={12} /> : null}
                    {t.name}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>

        {erro ? (
          <p className="aviso aviso--erro" role="alert">
            {erro.mensagem}
          </p>
        ) : null}
      </div>

      <div className="modal-rodape">
        <button className="button button--secondary" type="button" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="button button--accent" type="button" disabled={enviando} onClick={criar}>
          {enviando ? "Criando…" : "Criar negócio"}
        </button>
      </div>
    </Modal>
  );
}
