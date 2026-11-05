"use client";

import {
  cnpjValido,
  cpfValido,
  somenteDigitos,
  type PipelinePerson,
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

function AvatarResponsavel({ nome }: { nome: string }) {
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

    // O cadastro envia os dados próprios do lead, sem criar um cliente antes.
    const respostaNegocio = await enviar<Deal>("/api/leads", "POST", {
      pipelineId,
      stageId: etapaId,
      title: nomeLead.trim(),
      value: null,
      expectedCloseDate: null,
      ownerId: responsavelId,
      tagIds: [],
      lead: {
        personType: tipoPessoa,
        name: nomeLead.trim(),
        phone: telLimpo || null,
        email: emailLimpo || null,
        document: docLimpo || null,
        postalCode: null,
        street: null,
        addressComplement: null,
        district: null,
        city: null,
        state: null,
        origin: null,
        notes: null,
        legalName: null,
      },
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
      accessibleLabel="Novo lead"
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
        {erro ? (
          <Alert tone="danger" title={erro.mensagem || "Não foi possível cadastrar o lead."} />
        ) : null}

        {/* Seção 1: Pipeline e Etapa */}
        <section className="ui-dialog-section" aria-labelledby="secao-funil">
          <div className="ui-dialog-section-header">
            <Heading as="h3" id="secao-funil" icon={<IconLayers />}>Pipeline e Etapa</Heading>
            <p className="ui-dialog-section-desc">
              Defina o funil comercial e a etapa inicial onde o lead entrará.
            </p>
          </div>
          <div className="ui-dialog-grid">
            <SelectField
              id="lead-pipeline"
              label="Pipeline"
              required
              value={pipelineId}
              error={e.pipelineId}
              onChange={trocarPipeline}
              options={pipelines.map((p) => ({
                value: p.id,
                label: `${p.name} · ${EMPRESAS_POR_ID[p.companyId].nome}`,
              }))}
            />
            <SelectField
              id="lead-etapa"
              label="Etapa inicial"
              required
              value={etapaId}
              error={e.stageId}
              onChange={setEtapaId}
              options={pipeline.stages.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
          </div>
          <div className="ui-dialog-notice">
            <span>
              A empresa vem do pipeline: este lead pertence à{" "}
              <span className="ui-dialog-notice-empresa">{EMPRESAS_POR_ID[pipeline.companyId].nome}</span>.
            </span>
          </div>
        </section>

        {/* Seção 2: Dados do Lead */}
        <section className="ui-dialog-section" aria-labelledby="secao-dados-lead">
          <div className="ui-dialog-section-header">
            <Heading as="h3" id="secao-dados-lead" icon={<IconUser />}>Dados do Lead</Heading>
            <p className="ui-dialog-section-desc">
              Informações de identificação, contato e responsável da equipe.
            </p>
          </div>

          <TextField
            id="lead-nome"
            label="Nome do lead / Razão Social"
            required
            value={nomeLead}
            placeholder="Ex.: Mariana Costa ou Solar Distribuidora"
            error={e.nomeLead ?? e["lead.name"] ?? e.title}
            onChange={(ev) => setNomeLead(ev.target.value)}
          />

          <div className="ui-dialog-grid">
            <TextField
              id="lead-telefone"
              label="Telefone / WhatsApp"
              value={telefoneLead}
              inputMode="tel"
              placeholder="(92) 99999-9999"
              error={e.telefoneLead ?? e["lead.phone"]}
              onChange={(ev) => setTelefoneLead(mascaraTelefone(ev.target.value))}
            />
            <TextField
              id="lead-email"
              label="E-mail"
              type="email"
              value={emailLead}
              placeholder="contato@exemplo.com"
              error={e.emailLead ?? e["lead.email"]}
              onChange={(ev) => setEmailLead(ev.target.value)}
            />
          </div>

          <div className="ui-dialog-grid">
            <SelectField
              id="lead-tipo-pessoa"
              label="Tipo de pessoa"
              value={tipoPessoa}
              error={e["lead.personType"]}
              onChange={(val) => {
                const novoTipo = val as "pf" | "pj";
                setTipoPessoa(novoTipo);
                setDocumentoLead("");
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
              error={e.documentoLead ?? e["lead.document"]}
              onChange={(ev) => setDocumentoLead(mascaraDocumento(ev.target.value, tipoPessoa))}
            />
          </div>

          {/* Responsável da equipe */}
          <div
            className="ui-field inteira"
            ref={(node) => {
              if (node && containerResponsavel !== node) setContainerResponsavel(node);
            }}
          >
            <label id="negocio-responsavel-label" htmlFor="lead-responsavel">
              Responsável da equipe *
            </label>
            <Select
              value={responsavelId}
              onValueChange={(val) => {
                setResponsavelId(val);
                setErro((atual) => atual ? { ...atual, porCampo: { ...atual.porCampo, ownerId: "" } } : null);
              }}
            >
              <SelectTrigger
                ref={responsavelTriggerRef}
                id="lead-responsavel"
                aria-labelledby="negocio-responsavel-label"
                aria-invalid={Boolean(e.ownerId)}
                style={{ minHeight: "48px", padding: "6px 12px" }}
              >
                {responsavelAtual ? (
                  <div className="ui-member-profile">
                    <AvatarResponsavel nome={responsavelAtual.name} />
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
                        <AvatarResponsavel nome={m.name} />
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
            {e.ownerId ? <p className="ui-field-error" role="alert">{e.ownerId}</p> : null}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
