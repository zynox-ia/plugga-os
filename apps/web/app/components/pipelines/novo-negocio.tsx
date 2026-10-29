"use client";

import {
  cnpjValido,
  cpfValido,
  somenteDigitos,
  type ClientOwner,
  type CreateClientResponse,
  type Deal,
  type Pipeline,
} from "@plugga/shared";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { valorDigitadoParaDecimal } from "../../lib/negocios";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import {
  Alert,
  Button,
  DatePicker,
  Dialog,
  Heading,
  IconBriefcase,
  IconCheck,
  IconChevronDown,
  IconLayers,
  IconPlus,
  IconUser,
  IconUserPlus,
  TextField,
} from "../ui";

const CORES_DE_AVATAR = ["#0066CC", "#0B7A57", "#7C5CFF", "#D97706", "#DC2626", "#0284C7", "#4F46E5"];

function corDoAvatar(id: string): string {
  const soma = [...id].reduce((total, letra) => total + letra.charCodeAt(0), 0);
  return CORES_DE_AVATAR[soma % CORES_DE_AVATAR.length] ?? "#0066CC";
}

function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? "?";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function mascaraDocumento(valor: string, tipo: "pf" | "pj"): string {
  const d = valor.replace(/\D/g, "");
  if (tipo === "pf") {
    const s = d.slice(0, 11);
    if (s.length <= 3) return s;
    if (s.length <= 6) return `${s.slice(0, 3)}.${s.slice(3)}`;
    if (s.length <= 9) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6)}`;
    return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  }
  const s = d.slice(0, 14);
  if (s.length <= 2) return s;
  if (s.length <= 5) return `${s.slice(0, 2)}.${s.slice(2)}`;
  if (s.length <= 8) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5)}`;
  if (s.length <= 12) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8)}`;
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

/**
 * Modal de Novo Lead no CRM: direciona o funil e etapa e cadastra os dados do lead.
 */
export function NovoNegocio({
  pipelines,
  pipelineInicial,
  etapaInicialId,
  usuarioId,
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

  // Dados do lead
  const [nomeLead, setNomeLead] = useState("");
  const [telefoneLead, setTelefoneLead] = useState("");
  const [emailLead, setEmailLead] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState<"pf" | "pj">("pj");
  const [documentoLead, setDocumentoLead] = useState("");

  // Dados da oportunidade / negócio
  const [titulo, setTitulo] = useState("");
  const [tituloEditadoManualmente, setTituloEditadoManualmente] = useState(false);
  const [valor, setValor] = useState("");
  const [previsao, setPrevisao] = useState("");
  const [responsavelId, setResponsavelId] = useState(responsavelPadrao(pipelineInicial));
  const [etiquetas, setEtiquetas] = useState<string[]>([]);

  // Menu suspenso de seleção visual de responsável
  const [seletorAberto, setSeletorAberto] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [emailsPorId, setEmailsPorId] = useState<Record<string, string>>({});

  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Busca e-mails reais da equipe para complementar caso necessário
  useEffect(() => {
    let vivo = true;
    fetch("/api/equipe")
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => {
        if (!vivo || !dados?.membros) return;
        const mapa: Record<string, string> = {};
        for (const m of dados.membros as { id: string; email: string }[]) {
          mapa[m.id] = m.email;
        }
        setEmailsPorId(mapa);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  // Fecha o dropdown de responsável ao clicar fora
  useEffect(() => {
    if (!seletorAberto) return;
    function handleClickFora(ev: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(ev.target as Node)) {
        setSeletorAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, [seletorAberto]);

  // Sincroniza o título da oportunidade com o nome do lead até edição manual
  function handleNomeLeadChange(novoNome: string) {
    setNomeLead(novoNome);
    if (!tituloEditadoManualmente) {
      setTitulo(novoNome);
    }
  }

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

    if (!nomeLead.trim()) porCampo.nomeLead = "Informe o nome do lead.";
    const telLimpo = somenteDigitos(telefoneLead);
    const emailLimpo = emailLead.trim();
    if (!telLimpo && !emailLimpo) {
      porCampo.telefoneLead = "Informe pelo menos um telefone ou e-mail de contato.";
    }
    const docLimpo = somenteDigitos(documentoLead);
    if (docLimpo) {
      if (tipoPessoa === "pf" && !cpfValido(docLimpo)) {
        porCampo.documentoLead = "CPF inválido.";
      } else if (tipoPessoa === "pj" && !cnpjValido(docLimpo)) {
        porCampo.documentoLead = "CNPJ inválido.";
      }
    }

    if (!titulo.trim()) porCampo.title = "Informe o título da oportunidade.";
    if (!responsavelId) porCampo.ownerId = "Escolha o responsável.";
    if (decimal === undefined) porCampo.value = "Use só números, como 480.000,00.";

    if (Object.keys(porCampo).length > 0) {
      return setErro({ mensagem: "Confira os campos destacados.", porCampo });
    }

    setEnviando(true);
    setErro(null);

    // 1. Cria o cliente no CRM com os dados do lead
    const respostaCliente = await enviar<CreateClientResponse>("/api/clientes", "POST", {
      personType: tipoPessoa,
      name: nomeLead.trim(),
      phone: somenteDigitos(telefoneLead) || null,
      email: emailLead.trim() || null,
      document: somenteDigitos(documentoLead) || null,
      ownerId: responsavelId,
    });

    if (!respostaCliente.ok) {
      setEnviando(false);
      const erroCli = respostaCliente.erro;
      const msg = erroCli.mensagem || "Não foi possível cadastrar o lead.";
      const camposComErro: Record<string, string> = {};
      if (erroCli.porCampo?.document) camposComErro.documentoLead = erroCli.porCampo.document;
      if (erroCli.porCampo?.phone) camposComErro.telefoneLead = erroCli.porCampo.phone;
      if (erroCli.porCampo?.email) camposComErro.emailLead = erroCli.porCampo.email;
      if (erroCli.porCampo?.name) camposComErro.nomeLead = erroCli.porCampo.name;
      return setErro({ mensagem: msg, porCampo: { ...erroCli.porCampo, ...camposComErro } });
    }

    // 2. Cria o negócio no pipeline e etapa selecionados
    const respostaNegocio = await enviar<Deal>("/api/negocios", "POST", {
      pipelineId,
      stageId: etapaId,
      clientId: respostaCliente.dados.client.id,
      contactId: null,
      title: titulo.trim(),
      value: decimal,
      expectedCloseDate: previsao || null,
      ownerId: responsavelId,
      tagIds: etiquetas,
      consumerUnitIds: [],
    });

    setEnviando(false);
    if (respostaNegocio.ok) {
      aoCriar(respostaNegocio.dados);
    } else {
      setErro(respostaNegocio.erro);
    }
  }

  const e = erro?.porCampo ?? {};
  const responsavelAtual = pipeline.members.find((m) => m.userId === responsavelId);
  const emailDoResponsavel = (m: (typeof pipeline.members)[number]) =>
    m.email || emailsPorId[m.userId] || "Equipe comercial";

  return (
    <Dialog
      title="Novo Lead"
      accessibleLabel="Novo negócio"
      description="Cadastre um novo lead no CRM e direcione-o para a etapa do pipeline."
      icon={<IconUserPlus />}
      onClose={aoFechar}
      size="media"
      footer={
        <Button
          variant="primary"
          icon={<IconPlus />}
          loading={enviando}
          onClick={criar}
        >
          Cadastrar lead
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
              Defina o funil comercial e a etapa inicial onde o lead entrará.
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
            <span>
              A empresa vem do pipeline: este negócio pertence à{" "}
              <span className="ui-dialog-notice-empresa">{EMPRESAS_POR_ID[pipeline.companyId].nome}</span>.
            </span>
          </div>
        </section>

        {/* Seção 2: Dados do Lead */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconUser />}>Dados do Lead</Heading>
            <p className="ui-dialog-section-desc">
              Informações de identificação e contato direto do lead.
            </p>
          </div>

          <TextField
            id="lead-nome"
            label="Nome do lead / Razão Social *"
            value={nomeLead}
            maxLength={150}
            placeholder="Ex.: Mariana Costa ou Solar Distribuidora"
            error={e.nomeLead}
            onChange={(ev) => handleNomeLeadChange(ev.target.value)}
          />

          <div className="ui-dialog-grid">
            <TextField
              id="lead-telefone"
              label="Telefone / WhatsApp *"
              value={telefoneLead}
              inputMode="tel"
              placeholder="(92) 99999-9999"
              error={e.telefoneLead}
              onChange={(ev) => setTelefoneLead(mascaraTelefone(ev.target.value))}
            />
            <TextField
              id="lead-email"
              label="E-mail"
              type="email"
              value={emailLead}
              placeholder="contato@exemplo.com"
              error={e.emailLead}
              onChange={(ev) => setEmailLead(ev.target.value)}
            />
          </div>

          <div className="ui-dialog-grid">
            <div className="ui-field">
              <label htmlFor="lead-tipo-pessoa">Tipo de pessoa</label>
              <div className="ui-input-wrap">
                <select
                  id="lead-tipo-pessoa"
                  className="ui-input"
                  value={tipoPessoa}
                  onChange={(ev) => {
                    const novoTipo = ev.target.value as "pf" | "pj";
                    setTipoPessoa(novoTipo);
                    setDocumentoLead(mascaraDocumento(documentoLead, novoTipo));
                  }}
                >
                  <option value="pj">Pessoa Jurídica (PJ)</option>
                  <option value="pf">Pessoa Física (PF)</option>
                </select>
              </div>
            </div>

            <TextField
              id="lead-documento"
              label={tipoPessoa === "pf" ? "CPF" : "CNPJ"}
              value={documentoLead}
              placeholder={tipoPessoa === "pf" ? "000.000.000-00" : "00.000.000/0000-00"}
              error={e.documentoLead}
              onChange={(ev) => setDocumentoLead(mascaraDocumento(ev.target.value, tipoPessoa))}
            />
          </div>
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
            placeholder="Ex.: Mariana Costa — usina 120 kWp"
            error={e.title}
            onChange={(ev) => {
              setTitulo(ev.target.value);
              setTituloEditadoManualmente(true);
            }}
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
            <DatePicker
              label="Previsão de fechamento"
              value={previsao}
              onChange={setPrevisao}
            />
          </div>

          {/* Seletor visual de Responsável com Avatar, Nome e E-mail */}
          <div className="ui-field inteira" ref={pickerRef}>
            <label id="negocio-responsavel-label" htmlFor="negocio-responsavel-btn">
              Responsável da equipe *
            </label>
            <div className="ui-member-picker">
              <button
                type="button"
                id="negocio-responsavel-btn"
                className="ui-member-trigger"
                aria-haspopup="listbox"
                aria-expanded={seletorAberto}
                aria-invalid={Boolean(e.ownerId)}
                onClick={() => setSeletorAberto(!seletorAberto)}
              >
                {responsavelAtual ? (
                  <div className="ui-member-profile">
                    <span
                      className="ui-member-avatar"
                      style={{ background: corDoAvatar(responsavelAtual.userId) }}
                      aria-hidden="true"
                    >
                      {iniciaisDoNome(responsavelAtual.name)}
                    </span>
                    <div className="ui-member-text">
                      <span className="ui-member-name">{responsavelAtual.name}</span>
                      <span className="ui-member-email">{emailDoResponsavel(responsavelAtual)}</span>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: "var(--ui-muted)", fontSize: "13px" }}>Selecione um responsável</span>
                )}
                <IconChevronDown className="ui-member-arrow" width={16} height={16} />
              </button>

              {seletorAberto ? (
                <div className="ui-member-menu" role="listbox" aria-labelledby="negocio-responsavel-label">
                  {pipeline.members.length === 0 ? (
                    <div style={{ padding: "12px", textAlign: "center", color: "var(--ui-muted)", fontSize: "12px" }}>
                      Pipeline sem equipe definida
                    </div>
                  ) : (
                    pipeline.members.map((m) => {
                      const selecionado = m.userId === responsavelId;
                      return (
                        <button
                          key={m.userId}
                          type="button"
                          role="option"
                          aria-selected={selecionado}
                          className={`ui-member-item ${selecionado ? "ui-member-item--selected" : ""}`}
                          onClick={() => {
                            setResponsavelId(m.userId);
                            setSeletorAberto(false);
                          }}
                        >
                          <div className="ui-member-profile">
                            <span
                              className="ui-member-avatar"
                              style={{ background: corDoAvatar(m.userId) }}
                              aria-hidden="true"
                            >
                              {iniciaisDoNome(m.name)}
                            </span>
                            <div className="ui-member-text">
                              <span className="ui-member-name">{m.name}</span>
                              <span className="ui-member-email">{emailDoResponsavel(m)}</span>
                            </div>
                          </div>
                          {selecionado ? <IconCheck className="ui-member-check" width={16} height={16} /> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
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
