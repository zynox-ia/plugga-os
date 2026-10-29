"use client";

import type { ClientOwner, Deal, DealClientOptionsResponse, Pipeline } from "@plugga/shared";
import { useEffect, useState, type CSSProperties } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { valorDigitadoParaDecimal } from "../../lib/negocios";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import {
  Alert,
  Button,
  Dialog,
  Heading,
  IconBriefcase,
  IconCheck,
  IconLayers,
  IconPlus,
  IconUser,
  TextField,
} from "../ui";
import { BuscaDeCliente, type ClienteEscolhido } from "./busca-de-cliente";

/**
 * Novo negócio: funil e etapa herdam o contexto atual.
 * Estrutura padronizada no padrão de Dialog do Plugga OS.
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
  const responsavelPadrao = (p: Pipeline) =>
    usuarioId && p.members.some((m) => m.userId === usuarioId) ? usuarioId : (p.members[0]?.userId ?? "");
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
    <Dialog
      title="Novo Negócio"
      description="Abra uma oportunidade no funil de vendas associando cliente, valores e equipe."
      icon={<IconBriefcase />}
      onClose={aoFechar}
      size="media"
      footer={
        <Button
          variant="primary"
          icon={<IconPlus />}
          loading={enviando}
          onClick={criar}
        >
          Criar negócio
        </Button>
      }
    >
      <div className="ui-dialog-form">
        {erro?.mensagem ? (
          <Alert tone="danger" title={erro.mensagem} />
        ) : null}

        {/* Seção 1: Pipeline e Etapa */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconLayers />}>Pipeline e Etapa</Heading>
            <p className="ui-dialog-section-desc">
              Defina o funil de vendas e a etapa inicial onde o negócio entrará.
            </p>
          </div>
          <div className="ui-dialog-grid">
            <div className="ui-field">
              <label htmlFor="negocio-pipeline">Pipeline *</label>
              <div className="ui-input-wrap">
                <select
                  id="negocio-pipeline"
                  className="ui-input"
                  value={pipelineId}
                  onChange={(ev) => trocarPipeline(ev.target.value)}
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {EMPRESAS_POR_ID[p.companyId].nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="ui-field">
              <label htmlFor="negocio-etapa">Etapa inicial *</label>
              <div className="ui-input-wrap">
                <select
                  id="negocio-etapa"
                  className="ui-input"
                  value={etapaId}
                  onChange={(ev) => setEtapaId(ev.target.value)}
                >
                  {pipeline.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="ui-dialog-notice">
            <span>A empresa vem do pipeline: este negócio pertence à <strong>{EMPRESAS_POR_ID[pipeline.companyId].nome}</strong>.</span>
          </div>
        </section>

        {/* Seção 2: Cliente e Contato */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconUser />}>Cliente e Contato</Heading>
            <p className="ui-dialog-section-desc">
              Selecione o cliente cadastrado e o contato direto para este negócio.
            </p>
          </div>
          <div className="ui-field inteira">
            <label htmlFor="negocio-cliente">Cliente *</label>
            <BuscaDeCliente
              cliente={cliente}
              aoEscolher={setCliente}
              responsaveis={responsaveisDeCliente}
              erro={e.clientId}
            />
          </div>
          <div className="ui-field inteira">
            <label htmlFor="negocio-contato">Contato</label>
            <div className="ui-input-wrap">
              <select
                id="negocio-contato"
                className="ui-input"
                value={contatoId}
                disabled={!opcoes || opcoes.contacts.length === 0}
                onChange={(ev) => setContatoId(ev.target.value)}
              >
                <option value="">
                  {!cliente ? "Escolha o cliente primeiro" : opcoes?.contacts.length === 0 ? "Cliente sem contatos" : "Sem contato"}
                </option>
                {opcoes?.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.isPrimary ? " (principal)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {opcoes && opcoes.consumerUnits.length > 0 ? (
            <div className="ui-field inteira">
              <label>Unidades consumidoras deste negócio</label>
              <div className="ui-dialog-ucs">
                {opcoes.consumerUnits.map((u) => (
                  <label key={u.id} className={`ui-dialog-uc-card ${ucs.includes(u.id) ? "ui-dialog-uc-card--selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={ucs.includes(u.id)}
                      onChange={() => setUcs((atual) => alternar(atual, u.id))}
                    />
                    <div className="ui-dialog-uc-info">
                      <strong>{u.code}</strong>
                      <small>{u.distributor}</small>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* Seção 3: Dados da Oportunidade */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconBriefcase />}>Dados da Oportunidade</Heading>
            <p className="ui-dialog-section-desc">
              Identificação, valores estimados, prazo e vendedor responsável.
            </p>
          </div>
          <TextField
            id="negocio-titulo"
            label="Título *"
            value={titulo}
            maxLength={120}
            placeholder="Ex.: Hotel — usina 120 kWp"
            error={e.title}
            onChange={(ev) => setTitulo(ev.target.value)}
          />
          <div className="ui-dialog-grid">
            <TextField
              id="negocio-valor"
              label={pipeline.valueLabel}
              prefix="R$"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              error={e.value}
              hint={!e.value ? "O nome deste campo vem do pipeline." : undefined}
              onChange={(ev) => setValor(ev.target.value)}
            />
            <div className="ui-field">
              <label htmlFor="negocio-previsao">Previsão de fechamento</label>
              <div className="ui-input-wrap">
                <input
                  id="negocio-previsao"
                  type="date"
                  className="ui-input"
                  value={previsao}
                  onChange={(ev) => setPrevisao(ev.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="ui-field inteira">
            <label htmlFor="negocio-responsavel">Responsável *</label>
            <div className="ui-input-wrap">
              <select
                id="negocio-responsavel"
                className="ui-input"
                value={responsavelId}
                aria-invalid={Boolean(e.ownerId)}
                onChange={(ev) => setResponsavelId(ev.target.value)}
              >
                {pipeline.members.length === 0 ? <option value="">Pipeline sem equipe</option> : null}
                {pipeline.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            {e.ownerId ? <p className="ui-field-error">Erro: {e.ownerId}</p> : null}
          </div>
          {pipeline.tags.length > 0 ? (
            <div className="ui-field inteira">
              <label>Etiquetas</label>
              <div className="ui-dialog-tags">
                {pipeline.tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`ui-dialog-tag ${etiquetas.includes(t.id) ? "ui-dialog-tag--active" : ""}`}
                    aria-pressed={etiquetas.includes(t.id)}
                    style={{ "--cor": t.color } as CSSProperties}
                    onClick={() => setEtiquetas((atual) => alternar(atual, t.id))}
                  >
                    <span className="ui-dialog-tag-dot" style={{ backgroundColor: t.color }} />
                    <span>{t.name}</span>
                    {etiquetas.includes(t.id) ? <IconCheck width={12} height={12} /> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}
