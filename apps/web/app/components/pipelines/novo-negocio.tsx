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
import { BuscaDeCliente, type ClienteEscolhido } from "./busca-de-cliente";
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
  const [clienteVinculado, setClienteVinculado] = useState<ClienteEscolhido | null>(null);

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

    // Cria o negócio enviando o leadProfile diretamente, sem criar Client antes
    const respostaNegocio = await enviar<Deal>("/api/leads", "POST", {
      pipelineId,
      stageId: etapaId,
      title: nomeLead.trim(),
      value: null,
      expectedCloseDate: null,
      ownerId: responsavelId,
      tagIds: [],
      clientId: clienteVinculado?.id ?? null,
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
        {erro ? (
          <Alert
            title={erro.mensagem || "Não foi possível cadastrar o lead."}
            tone="danger"
          />
        ) : null}

        {/* 1. Direcionamento do Pipeline */}
        <section aria-labelledby="secao-funil">
          <Heading as="h3" id="secao-funil" className="ui-dialog-section-title" icon={<IconLayers width={16} height={16} />}>
            Direcionamento no Funil
          </Heading>

          <div className="ui-form-grid ui-form-grid--2col">
            <SelectField
              id="lead-pipeline"
              label="Pipeline"
              required
              value={pipelineId}
              error={e.pipelineId}
              options={pipelines.map((p) => ({
                value: p.id,
                label: `${p.name} · ${EMPRESAS_POR_ID[p.companyId].nome}`,
              }))}
              onChange={(val) => trocarPipeline(val)}
            />

            <SelectField
              id="lead-etapa"
              label="Etapa Inicial"
              required
              value={etapaId}
              error={e.stageId}
              options={pipeline.stages.map((etapa) => ({
                value: etapa.id,
                label: etapa.name,
              }))}
              onChange={(val) => setEtapaId(val)}
            />
          </div>
        </section>

        {/* 2. Identificação do Lead */}
        <section aria-labelledby="secao-dados-lead">
          <Heading as="h3" id="secao-dados-lead" className="ui-dialog-section-title" icon={<IconUser width={16} height={16} />}>
            Identificação do Lead
          </Heading>

          <div className="ui-form-grid ui-form-grid--2col">
            <SelectField
              id="lead-tipo-pessoa"
              label="Tipo de pessoa"
              value={tipoPessoa}
              options={[
                { value: "pj", label: "Pessoa Jurídica (PJ)" },
                { value: "pf", label: "Pessoa Física (PF)" },
              ]}
              onChange={(val) => {
                const tipo = val as "pf" | "pj";
                setTipoPessoa(tipo);
                setDocumentoLead("");
              }}
            />

            <TextField
              id="lead-documento"
              label={tipoPessoa === "pj" ? "CNPJ" : "CPF"}
              placeholder={tipoPessoa === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
              value={documentoLead}
              error={e.documentoLead}
              onChange={(evento) => setDocumentoLead(mascaraDocumento(evento.target.value, tipoPessoa))}
            />
          </div>

          <div style={{ marginTop: "12px" }}>
            <TextField
              id="lead-nome"
              label={tipoPessoa === "pj" ? "Nome da Empresa ou Lead" : "Nome Completo"}
              required
              placeholder={tipoPessoa === "pj" ? "Ex.: Posto Ipiranga ou Mercado Silva" : "Ex.: Roberto Andrade"}
              value={nomeLead}
              error={e.nomeLead}
              onChange={(evento) => setNomeLead(evento.target.value)}
            />
          </div>

          <div className="ui-form-grid ui-form-grid--2col" style={{ marginTop: "12px" }}>
            <TextField
              id="lead-telefone"
              label="Telefone / WhatsApp"
              placeholder="(92) 90000-0000"
              value={telefoneLead}
              error={e.telefoneLead}
              onChange={(evento) => setTelefoneLead(mascaraTelefone(evento.target.value))}
            />

            <TextField
              id="lead-email"
              label="E-mail de Contato"
              type="email"
              placeholder="contato@empresa.com.br"
              value={emailLead}
              error={e.emailLead}
              onChange={(evento) => setEmailLead(evento.target.value)}
            />
          </div>
        </section>

        <section aria-labelledby="secao-vinculo-cliente">
          <Heading as="h3" id="secao-vinculo-cliente" className="ui-dialog-section-title" icon={<IconUser width={16} height={16} />}>
            Cliente existente (opcional)
          </Heading>
          <p className="ui-field-hint">O lead mantém seus próprios dados. Você pode vinculá-lo a um cadastro existente.</p>
          <BuscaDeCliente
            cliente={clienteVinculado}
            aoEscolher={setClienteVinculado}
            responsaveis={responsaveis.map(({ id, name }) => ({ id, name }))}
            podeCriarNovo={false}
          />
        </section>

        {/* 3. Atribuição do Responsável */}
        <section aria-labelledby="secao-atribuicao">
          <Heading as="h3" id="secao-atribuicao" className="ui-dialog-section-title" icon={<IconUser width={16} height={16} />}>
            Atribuição Comercial
          </Heading>

          <div
            className="ui-member-picker"
            ref={(node) => {
              if (node && containerResponsavel !== node) setContainerResponsavel(node);
            }}
          >
            <label className="ui-field-label" htmlFor="lead-responsavel">
              Responsável pelo Atendimento <span className="ui-required">(obrigatório)</span>
            </label>

            <Select
              value={responsavelId}
              onValueChange={(val) => {
                setResponsavelId(val);
                setErro((atual) => atual ? { ...atual, porCampo: { ...atual.porCampo, ownerId: "" } } : null);
              }}
            >
              <SelectTrigger
                id="lead-responsavel"
                ref={responsavelTriggerRef}
                className="ui-member-trigger"
                aria-label="Responsável pelo lead"
              >
                {responsavelAtual ? (
                  <span className="ui-member-option">
                    <AvatarResponsavel nome={responsavelAtual.name} />
                    <span className="ui-member-details">
                      <span className="ui-member-name">{responsavelAtual.name}</span>
                      <span className="ui-member-email">{emailDoResponsavel(responsavelAtual)}</span>
                    </span>
                  </span>
                ) : (
                  <span className="ui-member-placeholder">Selecione o responsável...</span>
                )}
              </SelectTrigger>
              <SelectContent
                container={containerResponsavel}
                className="ui-member-popover"
                style={{ width: "var(--radix-select-trigger-width)" }}
              >
                {equipe.map((m) => (
                  <SelectItem key={m.userId} value={m.userId} className="ui-member-item">
                    <span className="ui-member-option">
                      <AvatarResponsavel nome={m.name} />
                      <span className="ui-member-details">
                        <span className="ui-member-name">{m.name}</span>
                        <span className="ui-member-email">{emailDoResponsavel(m)}</span>
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {e.ownerId ? <span className="ui-field-error" role="alert">{e.ownerId}</span> : null}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
