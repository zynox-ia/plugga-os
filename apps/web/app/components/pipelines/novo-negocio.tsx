"use client";

import {
  cnpjValido,
  cpfValido,
  somenteDigitos,
  type PipelinePerson,
  type CreateClientResponse,
  type Deal,
  type Pipeline,
} from "@plugga/shared";
import { useRef, useState } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import {
  Alert,
  Button,
  Dialog,
  Heading,
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

function AvatarResponsavel({ nome, avatarUrl }: { nome: string; avatarUrl?: string | null }) {
  const [erroImg, setErroImg] = useState(false);

  if (avatarUrl && !erroImg) {
    return (
      <span className="ui-member-avatar" aria-hidden="true">
        <img
          src={avatarUrl}
          alt={nome}
          onError={() => setErroImg(true)}
        />
      </span>
    );
  }

  return (
    <span className="ui-member-avatar ui-member-avatar--fallback" aria-hidden="true" title={nome}>
      <IconUser width={15} height={15} />
    </span>
  );
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
  responsaveis,
  aoCriar,
  aoFechar,
}: {
  pipelines: Pipeline[];
  pipelineInicial: Pipeline;
  etapaInicialId: string | null;
  usuarioId: string | null;
  responsaveis: PipelinePerson[];
  aoCriar: (negocio: Deal) => void;
  aoFechar: () => void;
}) {
  const [pipelineId, setPipelineId] = useState(pipelineInicial.id);
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelineInicial;
  const equipe = responsaveis.map((pessoa) => ({ ...pessoa, userId: pessoa.id }));
  const responsavelPadrao = () => usuarioId && equipe.some((m) => m.userId === usuarioId) ? usuarioId : (equipe[0]?.userId ?? "");
  const [etapaId, setEtapaId] = useState(etapaInicialId ?? pipelineInicial.stages[0]?.id ?? "");

  // Dados do lead
  const [nomeLead, setNomeLead] = useState("");
  const [telefoneLead, setTelefoneLead] = useState("");
  const [emailLead, setEmailLead] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState<"pf" | "pj">("pj");
  const [documentoLead, setDocumentoLead] = useState("");
  const [responsavelId, setResponsavelId] = useState(responsavelPadrao());

  const responsavelTriggerRef = useRef<HTMLButtonElement>(null);
  const [containerResponsavel, setContainerResponsavel] = useState<HTMLElement | null>(null);

  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);

  function trocarPipeline(id: string) {
    const proximo = pipelines.find((p) => p.id === id);
    if (!proximo) return;
    setPipelineId(id);
    setEtapaId(proximo.stages[0]?.id ?? "");
  }

  async function criar() {
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

    if (!responsavelId) porCampo.ownerId = "Escolha o responsável.";

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

    // 2. Cria o negócio no pipeline e etapa selecionados, usando o nome do lead como título
    const respostaNegocio = await enviar<Deal>("/api/negocios", "POST", {
      pipelineId,
      stageId: etapaId,
      clientId: respostaCliente.dados.client.id,
      contactId: null,
      title: nomeLead.trim(),
      value: null,
      expectedCloseDate: null,
      ownerId: responsavelId,
      tagIds: [],
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
  const responsavelAtual = equipe.find((m) => m.userId === responsavelId);
  const emailDoResponsavel = (m: (typeof equipe)[number]) =>
    m.email || "Equipe comercial";

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
              Informações de identificação, contato e responsável da equipe.
            </p>
          </div>

          <TextField
            id="lead-nome"
            label="Nome do lead / Razão Social *"
            value={nomeLead}
            maxLength={150}
            placeholder="Ex.: Mariana Costa ou Solar Distribuidora"
            error={e.nomeLead}
            onChange={(ev) => setNomeLead(ev.target.value)}
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

          {/* Responsável da equipe */}
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
                    <AvatarResponsavel nome={responsavelAtual.name} avatarUrl={(responsavelAtual as { avatarUrl?: string })?.avatarUrl ?? null} />
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
                {equipe.length === 0 ? (
                  <div style={{ padding: "12px", textAlign: "center", color: "var(--ui-muted)", fontSize: "12px" }}>
                    Nenhuma pessoa ativa com acesso ao CRM
                  </div>
                ) : (
                  equipe.map((m) => (
                    <SelectItem
                      key={m.userId}
                      value={m.userId}
                      textValue={m.name}
                      style={{ minHeight: "46px", padding: "6px 12px" }}
                    >
                      <div className="ui-member-profile">
                        <AvatarResponsavel nome={m.name} avatarUrl={(m as { avatarUrl?: string })?.avatarUrl ?? null} />
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
        </section>
      </div>
    </Dialog>
  );
}
