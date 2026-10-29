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
  IconLayers,
  IconPlus,
  IconUser,
  IconUserPlus,
  SelectField,
  TextField,
} from "../ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../ui/shadcn/select";

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

/** Formata em tempo real no padrão de moeda brasileira enquanto a pessoa digita. */
function mascaraMoedaBRL(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (!digitos) return "";
  const centavos = Number(digitos) / 100;
  return centavos.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

  const responsavelTriggerRef = useRef<HTMLButtonElement>(null);
  const [containerResponsavel, setContainerResponsavel] = useState<HTMLElement | null>(null);
  const [emailsPorId, setEmailsPorId] = useState<Record<string, string>>({});

  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Busca e-mails da equipe para enriquecer o seletor visual caso necessário
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
      expectedCloseDate: previsao,
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
            <SelectField
              id="negocio-pipeline"
              label="Pipeline"
              required
              value={pipelineId}
              onChange={trocarPipeline}
              options={pipelines.map((p) => ({
                value: p.id,
                label: `${p.name} · ${EMPRESAS_POR_ID[p.companyId].nome}`,
              }))}
            />
            <SelectField
              id="negocio-etapa"
              label="Etapa inicial"
              required
              value={etapaId}
              onChange={setEtapaId}
              options={pipeline.stages.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
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
            <SelectField
              id="lead-tipo-pessoa"
              label="Tipo de pessoa"
              value={tipoPessoa}
              onChange={(val) => {
                const novoTipo = val as "pf" | "pj";
                setTipoPessoa(novoTipo);
                setDocumentoLead(mascaraDocumento(documentoLead, novoTipo));
              }}
              options={[
                { value: "pj", label: "Pessoa Jurídica (PJ)" },
                { value: "pf", label: "Pessoa Física (PF)" },
              ]}
            />

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
              inputMode="numeric"
              placeholder="0,00"
              value={valor}
              error={e.value}
              hint={!e.value ? "O nome deste campo vem do pipeline." : undefined}
              onChange={(ev) => setValor(mascaraMoedaBRL(ev.target.value))}
            />
            <DatePicker
              label="Previsão de fechamento"
              value={previsao}
              onChange={setPrevisao}
            />
          </div>

          {/* Seletor visual de Responsável oficial do Design System com Avatar, Nome e E-mail */}
          <div className="ui-field inteira">
            <label id="negocio-responsavel-label" htmlFor="negocio-responsavel">
              Responsável da equipe *
            </label>
            <Select
              value={responsavelId}
              onValueChange={setResponsavelId}
              onOpenChange={(open) => {
                if (open) setContainerResponsavel(responsavelTriggerRef.current?.closest("dialog") ?? null);
              }}
            >
              <SelectTrigger
                ref={responsavelTriggerRef}
                id="negocio-responsavel"
                aria-labelledby="negocio-responsavel-label"
                aria-invalid={Boolean(e.ownerId)}
                style={{ minHeight: "48px", padding: "6px 12px" }}
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
              </SelectTrigger>
              <SelectContent
                container={containerResponsavel}
                style={{ width: "var(--radix-select-trigger-width)", maxHeight: "260px" }}
              >
                {pipeline.members.length === 0 ? (
                  <div style={{ padding: "12px", textAlign: "center", color: "var(--ui-muted)", fontSize: "12px" }}>
                    Pipeline sem equipe definida
                  </div>
                ) : (
                  pipeline.members.map((m) => (
                    <SelectItem
                      key={m.userId}
                      value={m.userId}
                      textValue={m.name}
                      style={{ minHeight: "46px", padding: "6px 12px" }}
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
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
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
