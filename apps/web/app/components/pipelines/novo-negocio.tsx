"use client";

import {
  cnpjValido,
  cpfValido,
  somenteDigitos,
  type ClientOwner,
  type CreateClientResponse,
  type Deal,
  type DealClientOptionsResponse,
  type Pipeline,
} from "@plugga/shared";
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
  IconUserPlus,
  TextField,
} from "../ui";
import { BuscaDeCliente, type ClienteEscolhido } from "./busca-de-cliente";

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
 * Modal de captação de lead / novo negócio no CRM.
 * Permite cadastrar os dados de contato do novo lead e direcioná-lo no funil.
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

  // Modo de lead (novo lead direto vs. cliente existente)
  const [modoCliente, setModoCliente] = useState<"novo" | "existente">("novo");

  // Dados de captação do novo lead
  const [nomeLead, setNomeLead] = useState("");
  const [telefoneLead, setTelefoneLead] = useState("");
  const [emailLead, setEmailLead] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState<"pf" | "pj">("pj");
  const [documentoLead, setDocumentoLead] = useState("");

  // Dados do cliente existente (quando modoCliente === "existente")
  const [clienteExistente, setClienteExistente] = useState<ClienteEscolhido | null>(null);
  const [opcoes, setOpcoes] = useState<DealClientOptionsResponse | null>(null);
  const [contatoId, setContatoId] = useState("");
  const [ucs, setUcs] = useState<string[]>([]);

  // Dados da oportunidade / negócio
  const [titulo, setTitulo] = useState("");
  const [tituloEditadoManualmente, setTituloEditadoManualmente] = useState(false);
  const [valor, setValor] = useState("");
  const [previsao, setPrevisao] = useState("");
  const [responsavelId, setResponsavelId] = useState(responsavelPadrao(pipelineInicial));
  const [etiquetas, setEtiquetas] = useState<string[]>([]);

  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Sincroniza título com nome do lead automaticamente até o usuário editar manualmente
  function handleNomeLeadChange(novoNome: string) {
    setNomeLead(novoNome);
    if (!tituloEditadoManualmente) {
      setTitulo(novoNome);
    }
  }

  useEffect(() => {
    setOpcoes(null);
    setContatoId("");
    setUcs([]);
    if (!clienteExistente) return;
    let vivo = true;
    void enviar<DealClientOptionsResponse>(`/api/negocios/clientes/${clienteExistente.id}/opcoes`, "GET").then((resposta) => {
      if (!vivo || !resposta.ok) return;
      setOpcoes(resposta.dados);
      setContatoId(resposta.dados.contacts.find((c) => c.isPrimary)?.id ?? "");
    });
    return () => {
      vivo = false;
    };
  }, [clienteExistente]);

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

    if (modoCliente === "novo") {
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
    } else {
      if (!clienteExistente) porCampo.clientId = "Escolha o cliente.";
    }

    if (!titulo.trim()) porCampo.title = "Informe o título da oportunidade.";
    if (!responsavelId) porCampo.ownerId = "Escolha o responsável.";
    if (decimal === undefined) porCampo.value = "Use só números, como 480.000,00.";

    if (Object.keys(porCampo).length > 0) {
      return setErro({ mensagem: "Confira os campos destacados.", porCampo });
    }

    setEnviando(true);
    setErro(null);

    let clienteFinalId = clienteExistente?.id;

    // Se for novo lead, cria primeiro o cliente na API
    if (modoCliente === "novo") {
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

      clienteFinalId = respostaCliente.dados.client.id;
    }

    // Cria o negócio vinculado ao cliente
    const respostaNegocio = await enviar<Deal>("/api/negocios", "POST", {
      pipelineId,
      stageId: etapaId,
      clientId: clienteFinalId!,
      contactId: modoCliente === "existente" ? contatoId || null : null,
      title: titulo.trim(),
      value: decimal,
      expectedCloseDate: previsao,
      ownerId: responsavelId,
      tagIds: etiquetas,
      consumerUnitIds: modoCliente === "existente" ? ucs : [],
    });

    setEnviando(false);
    if (respostaNegocio.ok) {
      aoCriar(respostaNegocio.dados);
    } else {
      setErro(respostaNegocio.erro);
    }
  }

  const e = erro?.porCampo ?? {};

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
          {modoCliente === "novo" ? "Cadastrar lead" : "Criar negócio"}
        </Button>
      }
    >
      <div className="ui-dialog-form">
        {erro?.mensagem ? (
          <Alert tone="danger" title={erro.mensagem} />
        ) : null}

        {/* Seção 1: Dados do Lead (Captação) */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <Heading as="h3" icon={<IconUser />}>
                {modoCliente === "novo" ? "Dados do Lead (Captação)" : "Cliente Selecionado"}
              </Heading>
              <button
                type="button"
                className="link-botao"
                style={{ fontSize: "12px" }}
                onClick={() => {
                  setModoCliente(modoCliente === "novo" ? "existente" : "novo");
                  setErro(null);
                }}
              >
                {modoCliente === "novo" ? "Vincular a cliente já cadastrado" : "← Cadastrar novo lead"}
              </button>
            </div>
            <p className="ui-dialog-section-desc">
              {modoCliente === "novo"
                ? "Informações de identificação e contato direto obtidas no primeiro atendimento."
                : "Busque e selecione um cliente já existente na base."}
            </p>
          </div>

          {modoCliente === "novo" ? (
            <>
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
                  label={tipoPessoa === "pf" ? "CPF (opcional)" : "CNPJ (opcional)"}
                  value={documentoLead}
                  placeholder={tipoPessoa === "pf" ? "000.000.000-00" : "00.000.000/0000-00"}
                  error={e.documentoLead}
                  onChange={(ev) => setDocumentoLead(mascaraDocumento(ev.target.value, tipoPessoa))}
                />
              </div>
            </>
          ) : (
            <>
              <div className="ui-field inteira">
                <label htmlFor="negocio-cliente">Cliente *</label>
                <BuscaDeCliente
                  cliente={clienteExistente}
                  aoEscolher={(c) => {
                    setClienteExistente(c);
                    if (c && !tituloEditadoManualmente) setTitulo(c.name);
                  }}
                  responsaveis={responsaveisDeCliente}
                  erro={e.clientId}
                />
              </div>

              {opcoes && opcoes.contacts.length > 0 ? (
                <div className="ui-field inteira">
                  <label htmlFor="negocio-contato">Contato principal</label>
                  <div className="ui-input-wrap">
                    <select
                      id="negocio-contato"
                      className="ui-input"
                      value={contatoId}
                      onChange={(ev) => setContatoId(ev.target.value)}
                    >
                      <option value="">Sem contato específico</option>
                      {opcoes.contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.isPrimary ? " (principal)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

              {opcoes && opcoes.consumerUnits.length > 0 ? (
                <div className="ui-field inteira">
                  <label>Unidades consumidoras</label>
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
            </>
          )}
        </section>

        {/* Seção 2: Pipeline e Etapa */}
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
            <span>A empresa vem do pipeline: este negócio pertence à <strong>{EMPRESAS_POR_ID[pipeline.companyId].nome}</strong>.</span>
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
