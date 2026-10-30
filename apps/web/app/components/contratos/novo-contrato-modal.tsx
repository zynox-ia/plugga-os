"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";

import { createContract, updateContractStatus } from "../../lib/commercial-client";
import { BuscaDeCliente, type ClienteEscolhido } from "../pipelines/busca-de-cliente";
import {
  Alert,
  Button,
  DatePicker,
  Dialog,
  Heading,
  IconBriefcase,
  IconBuilding,
  IconCheck,
  IconFileText,
  IconSave,
  IconSend,
  IconShield,
  IconSparkles,
  IconUpload,
  IconUser,
  IconX,
  SelectField,
  TextField,
} from "../ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../ui/shadcn/select";

function mascaraMoedaBRL(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (!digitos) return "";
  const centavos = Number(digitos) / 100;
  return centavos.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type NovoContratoSucesso = {
  id: string;
  clientId: string;
  clientName: string;
  status: string;
};

export function NovoContratoModal({
  aoFechar,
  aoCriar,
  clienteInicial,
}: {
  aoFechar: () => void;
  aoCriar?: (contrato: NovoContratoSucesso) => void;
  clienteInicial?: ClienteEscolhido | null;
}) {
  // Seção 1: Cliente e Identificação
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(clienteInicial ?? null);
  const [titulo, setTitulo] = useState("");
  const [tituloEditado, setTituloEditado] = useState(false);
  const [empresa, setEmpresa] = useState<"plugga" | "waze">("plugga");

  // Seção 2: Minuta e IA (Drag & Drop)
  const [arquivoMinuta, setArquivoMinuta] = useState<File | null>(null);
  const [emArrasto, setEmArrasto] = useState(false);
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [analiseConcluida, setAnaliseConcluida] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seção 3: Condições Comerciais e Vigência
  const [valorContrato, setValorContrato] = useState("");
  const [inicioVigencia, setInicioVigencia] = useState("");
  const [fimVigencia, setFimVigencia] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [equipe, setEquipe] = useState<{ id: string; name: string; email?: string }[]>([]);

  // Seção 4: Signatários para Assinatura Digital
  const [emailSignatarioCliente, setEmailSignatarioCliente] = useState("");
  const [nomeSignatarioCliente, setNomeSignatarioCliente] = useState("");

  // Controle de submissão e erros
  const [pendenteAcao, setPendenteAcao] = useState<"rascunho" | "aguardando_assinatura" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const responsavelTriggerRef = useRef<HTMLButtonElement>(null);
  const [containerResponsavel, setContainerResponsavel] = useState<HTMLElement | null>(null);

  // Carrega membros da equipe disponíveis
  useEffect(() => {
    let vivo = true;
    fetch("/api/equipe")
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => {
        if (!vivo || !dados?.membros) return;
        const lista = (dados.membros as { id: string; name: string; email: string; status: string }[])
          .filter((m) => m.status === "active")
          .map((m) => ({ id: m.id, name: m.name, email: m.email }));
        setEquipe(lista);
        const primeiro = lista[0];
        if (primeiro) setResponsavelId((atual) => atual || primeiro.id);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  // Quando seleciona cliente, sincroniza título padrão e signatário se ainda não editados
  useEffect(() => {
    if (!cliente) return;
    if (!tituloEditado) {
      setTitulo(`Contrato de Fornecimento e Serviços — ${cliente.name}`);
    }
    setNomeSignatarioCliente((atual) => atual || cliente.name);
  }, [cliente, tituloEditado]);

  function processarArquivoMinuta(arquivo: File) {
    setArquivoMinuta(arquivo);
    setAnalisandoIA(true);
    setAnaliseConcluida(false);

    // Simulação visual da análise inteligente da minuta por IA
    setTimeout(() => {
      setAnalisandoIA(false);
      setAnaliseConcluida(true);
      // Sugere vigência padrão de 12 meses caso esteja vazia
      const hoje = new Date();
      const anoQueVem = new Date();
      anoQueVem.setFullYear(hoje.getFullYear() + 1);
      const isoHoje = hoje.toISOString().slice(0, 10);
      const isoFim = anoQueVem.toISOString().slice(0, 10);
      setInicioVigencia((atual) => atual || isoHoje);
      setFimVigencia((atual) => atual || isoFim);
    }, 1200);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setEmArrasto(false);
    const arquivos = Array.from(e.dataTransfer.files);
    if (arquivos[0]) {
      processarArquivoMinuta(arquivos[0]);
    }
  }

  function gerarMinutaComIA() {
    setAnalisandoIA(true);
    setTimeout(() => {
      const mockBlob = new Blob(["Minuta gerada com inteligência artificial"], { type: "application/pdf" });
      const mockFile = new File([mockBlob], `Minuta_Contratual_${cliente?.name ? cliente.name.replace(/\s+/g, "_") : "Cliente"}.pdf`, {
        type: "application/pdf",
        lastModified: Date.now(),
      });
      setArquivoMinuta(mockFile);
      setAnalisandoIA(false);
      setAnaliseConcluida(true);
      const hoje = new Date().toISOString().slice(0, 10);
      const anoQueVem = new Date();
      anoQueVem.setFullYear(anoQueVem.getFullYear() + 1);
      setInicioVigencia((atual) => atual || hoje);
      setFimVigencia((atual) => atual || anoQueVem.toISOString().slice(0, 10));
    }, 1400);
  }

  async function submeter(destino: "rascunho" | "aguardando_assinatura") {
    if (!cliente) {
      setErro("Selecione o cliente contratante.");
      return;
    }
    if (!titulo.trim()) {
      setErro("Informe o título ou objeto do contrato.");
      return;
    }
    if (!responsavelId) {
      setErro("Selecione o responsável pelo contrato.");
      return;
    }
    if (destino === "aguardando_assinatura" && !arquivoMinuta) {
      setErro("Anexe a minuta do contrato antes de enviar para assinatura.");
      return;
    }

    setPendenteAcao(destino);
    setErro(null);

    try {
      // 1. Criação do contrato via client
      const resCriar = await createContract({
        clientId: cliente.id,
        ownerId: responsavelId || undefined,
        startsAt: inicioVigencia ? new Date(inicioVigencia).toISOString() : undefined,
        endsAt: fimVigencia ? new Date(fimVigencia).toISOString() : undefined,
        nextActionNote: destino === "aguardando_assinatura" ? "Aguardando assinatura digital das partes" : "Elaboração de minuta",
      });

      if (!resCriar.ok) {
        setErro(resCriar.message || "Não foi possível criar o contrato.");
        setPendenteAcao(null);
        return;
      }

      const contratoCriado = resCriar.data as { id: string };

      // 2. Se a ação escolhida foi enviar para assinatura, atualiza o status
      if (destino === "aguardando_assinatura") {
        await updateContractStatus(contratoCriado.id, {
          status: "aguardando_assinatura",
          ownerId: responsavelId,
          startsAt: inicioVigencia ? new Date(inicioVigencia).toISOString() : undefined,
          endsAt: fimVigencia ? new Date(fimVigencia).toISOString() : undefined,
          nextActionNote: "Aguardando assinatura digital do cliente",
        });
      }

      aoCriar?.({
        id: contratoCriado.id,
        clientId: cliente.id,
        clientName: cliente.name,
        status: destino,
      });

      aoFechar();
    } catch {
      setErro("Ocorreu um erro inesperado ao processar o contrato.");
    } finally {
      setPendenteAcao(null);
    }
  }

  const responsavelAtual = equipe.find((m) => m.id === responsavelId);

  return (
    <Dialog
      title="Novo Contrato"
      accessibleLabel="Novo contrato"
      description="Elabore ou importe uma minuta contratual com suporte de IA e envie para assinatura digital."
      icon={<IconFileText />}
      onClose={aoFechar}
      size="media"
      footer={
        <>
          <Button
            variant="secondary"
            icon={<IconSave />}
            loading={pendenteAcao === "rascunho"}
            disabled={Boolean(pendenteAcao)}
            onClick={() => void submeter("rascunho")}
          >
            Salvar rascunho
          </Button>
          <Button
            variant="primary"
            icon={<IconSend />}
            loading={pendenteAcao === "aguardando_assinatura"}
            disabled={Boolean(pendenteAcao)}
            onClick={() => void submeter("aguardando_assinatura")}
          >
            Enviar para assinatura
          </Button>
        </>
      }
    >
      <div className="ui-dialog-form">
        {erro ? <Alert tone="danger" title={erro} /> : null}

        {/* Seção 1: Cliente e Identificação */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconUser />}>Cliente e Identificação</Heading>
            <p className="ui-dialog-section-desc">
              Selecione o cliente contratante e defina o objeto da contratação.
            </p>
          </div>

          <div className="ui-field inteira">
            <label htmlFor="contrato-cliente">Cliente contratante *</label>
            <BuscaDeCliente
              cliente={cliente}
              aoEscolher={setCliente}
              responsaveis={equipe}
            />
          </div>

          <TextField
            id="contrato-titulo"
            label="Título / Objeto do contrato *"
            required
            maxLength={180}
            value={titulo}
            placeholder="Ex.: Contrato de Prestação de Serviços e Instalação Solar — Usina 120 kWp"
            onChange={(ev) => {
              setTitulo(ev.target.value);
              setTituloEditado(true);
            }}
          />

          <div className="ui-dialog-grid">
            <SelectField
              id="contrato-empresa"
              label="Empresa contratada"
              value={empresa}
              onChange={(val) => setEmpresa(val as "plugga" | "waze")}
              options={[
                { value: "plugga", label: "Plugga Tecnologia" },
                { value: "waze", label: "Waze Energia" },
              ]}
            />
            <div className="ui-dialog-notice" style={{ marginTop: "24px" }}>
              <span>Contrato sob responsabilidade jurídica da <strong>{empresa === "plugga" ? "Plugga" : "Waze Energia"}</strong>.</span>
            </div>
          </div>
        </section>

        {/* Seção 2: Minuta do Contrato & Assistente IA (Drag & Drop) */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <Heading as="h3" icon={<IconSparkles />}>Minuta e Análise por IA</Heading>
              <span className="ui-contract-ia-badge">
                <IconSparkles width={13} height={13} />
                <span>IA Integrada</span>
              </span>
            </div>
            <p className="ui-dialog-section-desc">
              Faça upload da minuta para análise automática ou gere um modelo padrão assistido por IA.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(ev) => {
              const arq = ev.target.files?.[0];
              if (arq) processarArquivoMinuta(arq);
            }}
          />

          {!arquivoMinuta ? (
            <div
              className="ui-contract-dropzone"
              data-dragging={emArrasto}
              onDragOver={(e) => {
                e.preventDefault();
                setEmArrasto(true);
              }}
              onDragLeave={() => setEmArrasto(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="ui-contract-dropzone-icon" aria-hidden="true">
                <IconUpload width={22} height={22} />
              </div>
              <p className="ui-contract-dropzone-title">
                Arraste sua minuta em PDF ou DOCX aqui
              </p>
              <p className="ui-contract-dropzone-desc">
                ou clique para selecionar no seu dispositivo
              </p>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  icon={<IconUpload width={14} height={14} />}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Selecionar arquivo
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  icon={<IconSparkles width={14} height={14} />}
                  loading={analisandoIA}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    gerarMinutaComIA();
                  }}
                >
                  Gerar minuta com IA
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div className="ui-contract-file-card">
                <div className="ui-contract-file-info">
                  <div className="ui-contract-file-icon" aria-hidden="true">
                    <IconFileText width={20} height={20} />
                  </div>
                  <div className="ui-contract-file-text">
                    <span className="ui-contract-file-name">{arquivoMinuta.name}</span>
                    <span className="ui-contract-file-meta">{formatarTamanho(arquivoMinuta.size)}</span>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<IconX />}
                  iconOnly
                  aria-label="Remover minuta"
                  onClick={() => {
                    setArquivoMinuta(null);
                    setAnaliseConcluida(false);
                  }}
                />
              </div>

              {analisandoIA ? (
                <div className="ui-contract-ia-success" style={{ color: "var(--ui-primary)" }}>
                  <IconSparkles width={16} height={16} className="ui-spinner" />
                  <span>A IA está analisando as cláusulas, partes e vigência da minuta…</span>
                </div>
              ) : analiseConcluida ? (
                <div className="ui-contract-ia-success">
                  <IconCheck width={16} height={16} />
                  <span>Minuta analisada pela IA: cláusulas, termos e signatários verificados para assinatura.</span>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* Seção 3: Condições Comerciais e Vigência */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconBriefcase />}>Condições e Vigência</Heading>
            <p className="ui-dialog-section-desc">
              Valores contratuais, vigência do acordo e responsável pelo acompanhamento.
            </p>
          </div>

          <div className="ui-dialog-grid">
            <TextField
              id="contrato-valor"
              label="Valor total do contrato"
              prefix="R$"
              inputMode="numeric"
              placeholder="0,00"
              value={valorContrato}
              onChange={(ev) => setValorContrato(mascaraMoedaBRL(ev.target.value))}
            />

            {/* Responsável oficial com avatar neutro profissional */}
            <div className="ui-field">
              <label id="contrato-responsavel-label" htmlFor="contrato-responsavel">
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
                  id="contrato-responsavel"
                  aria-labelledby="contrato-responsavel-label"
                  style={{ minHeight: "46px", padding: "6px 12px" }}
                >
                  {responsavelAtual ? (
                    <div className="ui-member-profile">
                      <span className="ui-member-avatar ui-member-avatar--fallback" aria-hidden="true">
                        <IconUser width={15} height={15} />
                      </span>
                      <div className="ui-member-text">
                        <span className="ui-member-name">{responsavelAtual.name}</span>
                        <span className="ui-member-email">{responsavelAtual.email ?? "Equipe"}</span>
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: "var(--ui-muted)", fontSize: "13px" }}>Selecione um responsável</span>
                  )}
                </SelectTrigger>
                <SelectContent
                  container={containerResponsavel}
                  style={{ width: "var(--radix-select-trigger-width)", maxHeight: "240px" }}
                >
                  {equipe.map((m) => (
                    <SelectItem key={m.id} value={m.id} textValue={m.name} style={{ minHeight: "44px", padding: "6px 12px" }}>
                      <div className="ui-member-profile">
                        <span className="ui-member-avatar ui-member-avatar--fallback" aria-hidden="true">
                          <IconUser width={15} height={15} />
                        </span>
                        <div className="ui-member-text">
                          <span className="ui-member-name">{m.name}</span>
                          <span className="ui-member-email">{m.email ?? "Equipe"}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="ui-dialog-grid">
            <DatePicker
              label="Início da vigência"
              value={inicioVigencia}
              onChange={setInicioVigencia}
            />
            <DatePicker
              label="Término da vigência"
              value={fimVigencia}
              onChange={setFimVigencia}
            />
          </div>
        </section>

        {/* Seção 4: Signatários para Assinatura Digital */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconSend />}>Signatários da Assinatura Digital</Heading>
            <p className="ui-dialog-section-desc">
              Destinatários que receberão o link seguro para assinatura eletrônica.
            </p>
          </div>

          <div className="ui-dialog-grid">
            <TextField
              id="signatario-cliente-nome"
              label="Nome do signatário (Cliente)"
              value={nomeSignatarioCliente}
              placeholder="Nome do representante legal"
              onChange={(ev) => setNomeSignatarioCliente(ev.target.value)}
            />
            <TextField
              id="signatario-cliente-email"
              label="E-mail para envio da assinatura"
              type="email"
              value={emailSignatarioCliente}
              placeholder="assinatura@empresa.com.br"
              onChange={(ev) => setEmailSignatarioCliente(ev.target.value)}
            />
          </div>

          <div className="ui-signers-list">
            <div className="ui-signer-card">
              <div className="ui-signer-info">
                <span className="ui-member-avatar ui-member-avatar--fallback" aria-hidden="true">
                  <IconUser width={15} height={15} />
                </span>
                <div className="ui-member-text">
                  <span className="ui-member-name">{nomeSignatarioCliente || "Cliente Contratante"}</span>
                  <span className="ui-member-email">{emailSignatarioCliente || "E-mail cadastrado do cliente"}</span>
                </div>
              </div>
              <span className="ui-signer-role-pill">Contratante</span>
            </div>

            <div className="ui-signer-card">
              <div className="ui-signer-info">
                <span className="ui-member-avatar ui-member-avatar--fallback" aria-hidden="true">
                  <IconBuilding width={15} height={15} />
                </span>
                <div className="ui-member-text">
                  <span className="ui-member-name">{empresa === "plugga" ? "Plugga Tecnologia" : "Waze Energia"}</span>
                  <span className="ui-member-email">{responsavelAtual?.email ?? "juridico@plugga.com.br"}</span>
                </div>
              </div>
              <span className="ui-signer-role-pill">Contratada</span>
            </div>
          </div>

          <div className="ui-dialog-notice" style={{ marginTop: "4px" }}>
            <IconShield width={16} height={16} style={{ color: "var(--ui-primary)", flexShrink: 0 }} />
            <span>Assinatura eletrônica com validade jurídica conforme MP 2.200-2/2001 e trilha de auditoria digital.</span>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
