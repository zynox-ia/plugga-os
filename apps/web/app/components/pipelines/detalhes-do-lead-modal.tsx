"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Check,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { enviar, telefoneFormatado } from "../../lib/clientes";
import { formatarBRL, formatarData } from "../../lib/format";
import { diasNaEtapa, estaParado } from "../../lib/negocios";
import { Modal } from "../modal";
import { Button } from "../ui/button";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";
import styles from "./detalhes-do-lead-modal.module.css";

const SECOES = [
  { id: "resumo", titulo: "Resumo", icone: LayoutDashboard },
  { id: "lead", titulo: "Lead", icone: UserRound },
  { id: "historico", titulo: "Histórico", icone: History },
  { id: "oportunidade", titulo: "Oportunidade", icone: BriefcaseBusiness },
  { id: "proposta", titulo: "Proposta", icone: FileText },
  { id: "documentos", titulo: "Documentos", icone: FolderOpen },
] as const;

type Secao = (typeof SECOES)[number]["id"];

type Props = {
  negocio: Deal;
  pipeline: Pipeline;
  acoes: AcoesDoNegocio;
  aoAtualizar?: (negocio: Deal) => void;
  aoFechar: () => void;
};

/* ==========================================================================
   ABA 1: RESUMO (COCKPIT DO ATENDIMENTO)
   ========================================================================== */
function AbaResumo({ negocio, pipeline }: { negocio: Deal; pipeline: Pipeline }) {
  const indiceAtual = pipeline.stages.findIndex((item) => item.id === negocio.stageId);
  const dias = diasNaEtapa(negocio);
  const parado = estaParado(negocio, pipeline);

  const valorFormatado = negocio.value ? formatarBRL(negocio.value) : "—";
  const previsaoFormatada = negocio.expectedCloseDate
    ? formatarData(negocio.expectedCloseDate)
    : "—";

  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Cockpit do Atendimento</h3>
        <p>Visão executiva do pipeline, indicadores comerciais e próximas ações.</p>
      </div>

      {/* Stepper Horizontal de Etapas */}
      <div className={styles.stepperWrapper}>
        <div className={styles.stepperCabecalho}>
          <span>Funil: {pipeline.name}</span>
          <span>
            Etapa {Math.max(1, indiceAtual + 1)} de {pipeline.stages.length}
          </span>
        </div>
        <div className={styles.stepperTrilha}>
          {pipeline.stages.map((etapa, idx) => {
            const eAtual = etapa.id === negocio.stageId;
            const ePassado = idx < indiceAtual;
            return (
              <div
                key={etapa.id}
                className={`${styles.stepNode} ${eAtual ? styles.stepAtual : ePassado ? styles.stepPassado : ""}`}
              >
                <div className={styles.stepBarra} />
                <div className={styles.stepInfo} title={etapa.name}>
                  {ePassado ? <Check size={11} /> : null}
                  <span>{etapa.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid de Métricas (4 Cards) */}
      <div className={styles.cockpitGrid}>
        <div className={styles.cockpitCard}>
          <div className={styles.cockpitCardLabel}>
            <span>{pipeline.valueLabel || "Investimento estimado"}</span>
            <Sparkles size={13} />
          </div>
          <div className={styles.cockpitCardValor}>{valorFormatado}</div>
          <div className={styles.cockpitCardSub}>{negocio.value ? "Valor informado" : "Valor não informado"}</div>
        </div>

        <div className={styles.cockpitCard}>
          <div className={styles.cockpitCardLabel}>
            <span>Previsão de fechamento</span>
            <Calendar size={13} />
          </div>
          <div className={styles.cockpitCardValor}>{previsaoFormatada}</div>
          <div className={styles.cockpitCardSub}>{negocio.expectedCloseDate ? "Data informada" : "Sem previsão definida"}</div>
        </div>

        <div className={styles.cockpitCard}>
          <div className={styles.cockpitCardLabel}>
            <span>Tempo na etapa</span>
            <Clock size={13} />
          </div>
          <div className={styles.cockpitCardValor}>
            {dias} {dias === 1 ? "dia" : "dias"}
          </div>
          <div className={parado ? styles.tempoParado : styles.cockpitCardSub}>
            {parado ? "Alerta: parado na etapa" : "Dentro do prazo padrão"}
          </div>
        </div>

        <div className={styles.cockpitCard}>
          <div className={styles.cockpitCardLabel}>
            <span>Proposta</span>
            <span className="ui-status-dot" style={{ background: "#126744" }} />
          </div>
          <div className={styles.cockpitCardValor}>Em preparação</div>
          <div className={styles.cockpitCardSub}>A proposta poderá ser anexada nesta aba</div>
        </div>
      </div>

      {/* Próximo Passo Recomendado */}
      <div className={styles.cardAcaoRecomendada}>
        <div className={styles.iconeAcao}>
          <Sparkles size={16} />
        </div>
        <div className={styles.corpoAcao}>
          <div className={styles.tituloAcao}>Próxima ação recomendada</div>
          <div className={styles.textoAcao}>
            Registre o próximo passo do atendimento nas notas do lead.
          </div>
        </div>
      </div>

      {/* Contato Rápido */}
      <div className={styles.resumoContatoGrid}>
        {negocio.lead.phone ? <div className={styles.contatoPill}>
          <Phone size={16} />
          <div className={styles.contatoPillTextos}>
            <span className={styles.contatoPillLabel}>Telefone</span>
            <span className={styles.contatoPillValor}>{telefoneFormatado(negocio.lead.phone)}</span>
          </div>
        </div> : null}

        <div className={styles.contatoPill}>
          <Mail size={16} />
          <div className={styles.contatoPillTextos}>
            <span className={styles.contatoPillLabel}>E-mail</span>
            <span className={styles.contatoPillValor}>
              {negocio.lead.email || "Não informado"}
            </span>
          </div>
        </div>

        <div className={styles.contatoPill}>
          <Building2 size={16} />
          <div className={styles.contatoPillTextos}>
            <span className={styles.contatoPillLabel}>Localidade</span>
            <span className={styles.contatoPillValor}>
              {[negocio.lead.city, negocio.lead.state].filter(Boolean).join(" - ") || "Não informada"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   ABA 2: LEAD (FICHA CADASTRAL 360° ENRIQUECIDA E EDITÁVEL)
   ========================================================================== */
function AbaLead({ negocio, aoAtualizar }: { negocio: Deal; aoAtualizar?: (negocio: Deal) => void }) {
  const [copiado, setCopiado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const [nome, setNome] = useState(negocio.lead.name);
  const [razaoSocial, setRazaoSocial] = useState(negocio.lead.legalName ?? "");
  const [doc, setDoc] = useState(negocio.lead.document ?? "");
  const [tel, setTel] = useState(negocio.lead.phone ?? "");
  const [email, setEmail] = useState(negocio.lead.email ?? "");
  const [rua, setRua] = useState(negocio.lead.street ?? "");
  const [bairro, setBairro] = useState(negocio.lead.district ?? "");
  const [cidade, setCidade] = useState(negocio.lead.city ?? "");
  const [uf, setUf] = useState(negocio.lead.state ?? "");
  const [cep, setCep] = useState(negocio.lead.postalCode ?? "");
  const [nota, setNota] = useState(
    negocio.lead.notes ?? ""
  );


  function copiarEmail() {
    if (email && email !== "—") {
      navigator.clipboard?.writeText(email);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  async function salvar() {
    setSalvando(true);
    setMensagemErro(null);
    setMensagemSucesso(false);

    const docLimpo = doc === "—" || !doc.trim() ? null : doc.trim();
    const telLimpo = tel === "—" || !tel.trim() ? null : tel.trim();
    const emailLimpo = email === "—" || !email.trim() ? null : email.trim();

    const resposta = await enviar<Deal>(`/api/leads/${negocio.id}`, "PATCH", {
      lead: {
        name: nome.trim(),
        legalName: razaoSocial.trim() || null,
        document: docLimpo,
        phone: telLimpo,
        email: emailLimpo,
        street: rua.trim() || null,
        district: bairro.trim() || null,
        city: cidade.trim() || null,
        state: uf.trim() || null,
        postalCode: cep.trim() || null,
        notes: nota.trim() || null,
      },
    });

    setSalvando(false);
    if (resposta.ok) {
      setMensagemSucesso(true);
      setTimeout(() => setMensagemSucesso(false), 3000);
      aoAtualizar?.(resposta.dados);
    } else {
      setMensagemErro(resposta.erro.mensagem);
    }
  }

  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Ficha Cadastral 360°</h3>
        <p>Dados de identificação, canais de contato, dados técnicos e anotações do lead.</p>
      </div>

      {mensagemSucesso ? (
        <p className="aviso aviso--sucesso" role="status" style={{ marginBottom: "12px" }}>
          Alterações do lead salvas com sucesso.
        </p>
      ) : null}

      {mensagemErro ? (
        <p className="aviso aviso--erro" role="alert" style={{ marginBottom: "12px" }}>
          {mensagemErro}
        </p>
      ) : null}

      <div className={styles.leadCardsGrid}>
        {/* Card 1: Identificação Principal */}
        <div className={styles.painelCard}>
          <div className={styles.painelCardHeader}>
            <h4>
              <Building2 size={15} /> Identificação Principal
            </h4>
            <span className="ui-badge ui-tone--info">
              {negocio.lead.personType === "pj" ? "Pessoa Jurídica (PJ)" : "Pessoa Física (PF)"}
            </span>
          </div>
          <label className={styles.campoEditavel}>
            <span>Nome</span>
            <input
              className="ui-input"
              aria-label="Nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
          <label className={styles.campoEditavel}>
            <span>Razão Social</span>
            <input
              className="ui-input"
              aria-label="Razão Social"
              value={razaoSocial}
              placeholder={negocio.lead.personType === "pj" ? `${nome} Ltda` : nome}
              onChange={(e) => setRazaoSocial(e.target.value)}
            />
          </label>
          <label className={styles.campoEditavel}>
            <span>Documento</span>
            <input
              className="ui-input"
              aria-label="Documento"
              value={doc}
              onFocus={(e) => {
                if (e.target.value === "—") setDoc("");
              }}
              onBlur={(e) => {
                if (!e.target.value.trim()) setDoc("—");
              }}
              onChange={(e) => setDoc(e.target.value)}
            />
          </label>
          <div className={styles.campoLinha}>
            <span>Origem do Lead</span>
            <strong>{negocio.lead.origin || "Não informada"}</strong>
          </div>
        </div>

        {/* Card 2: Canais de Comunicação & Decisores */}
        <div className={styles.painelCard}>
          <div className={styles.painelCardHeader}>
            <h4>
              <Phone size={15} /> Canais de Comunicação
            </h4>

          </div>
          <label className={styles.campoEditavel}>
            <span>Telefone</span>
            <div className={styles.campoComAcao}>
              <input
                className="ui-input"
                aria-label="Telefone"
                value={tel}
                placeholder="(92) 98124-5500"
                onChange={(e) => setTel(e.target.value)}
              />
              {tel && tel !== "—" ? (
                <a
                  href={`https://wa.me/55${tel.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.btnAcaoRapida}
                >
                  <MessageSquare size={12} /> WhatsApp
                </a>
              ) : null}
            </div>
          </label>
          <label className={styles.campoEditavel}>
            <span>E-mail</span>
            <div className={styles.campoComAcao}>
              <input
                className="ui-input"
                aria-label="E-mail"
                value={email}
                placeholder="contato@empresa.com.br"
                onChange={(e) => setEmail(e.target.value)}
              />
              {email && email !== "—" ? (
                <button type="button" className={styles.btnAcaoRapida} onClick={copiarEmail}>
                  {copiado ? <Check size={12} /> : <Copy size={12} />}
                  {copiado ? "Copiado!" : "Copiar"}
                </button>
              ) : null}
            </div>
          </label>
          <div className={styles.campoLinha}>
            <span>Contato Principal / Decisor</span>
            <strong>{negocio.contact?.name || "Não informado"}</strong>
          </div>
        </div>

        {/* Card 3: Endereço & Localização Técnica */}
        <div className={styles.painelCard}>
          <div className={styles.painelCardHeader}>
            <h4>
              <MapPin size={15} /> Endereço
            </h4>

          </div>
          <label className={styles.campoEditavel}>
            <span>Logradouro</span>
            <input
              className="ui-input"
              aria-label="Logradouro"
              value={rua}
              placeholder="Av. Djalma Batista, 1661"
              onChange={(e) => setRua(e.target.value)}
            />
          </label>
          <label className={styles.campoEditavel}>
            <span>Bairro</span>
            <input
              className="ui-input"
              aria-label="Bairro"
              value={bairro}
              placeholder="Chapada"
              onChange={(e) => setBairro(e.target.value)}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px" }}>
            <label className={styles.campoEditavel}>
              <span>Cidade</span>
              <input
                className="ui-input"
                aria-label="Cidade"
                value={cidade}
                placeholder="Manaus"
                onChange={(e) => setCidade(e.target.value)}
              />
            </label>
            <label className={styles.campoEditavel}>
              <span>UF</span>
              <input
                className="ui-input"
                aria-label="UF"
                maxLength={2}
                value={uf}
                placeholder="AM"
                onChange={(e) => setUf(e.target.value.toUpperCase())}
              />
            </label>
          </div>
          <label className={styles.campoEditavel}>
            <span>CEP</span>
            <input
              className="ui-input"
              aria-label="CEP"
              value={cep}
              placeholder="69050-010"
              onChange={(e) => setCep(e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* Anotações do Lead */}
      <div className={styles.painelCard} style={{ marginTop: "12px" }}>
        <div className={styles.painelCardHeader}>
          <h4>
            <FileText size={15} /> Anotações do Atendimento
          </h4>
          <span style={{ fontSize: "11px", color: "var(--ui-muted)" }}>Atualizado recentemente</span>
        </div>
        <div className={styles.campoEditavel}>
          <textarea
            rows={3}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Registre notas ou observações deste lead..."
          />
        </div>
      </div>

      {/* Barra de Ação de Salvar Edições */}
      <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primary" loading={salvando} onClick={salvar}>
          Salvar alterações do lead
        </Button>
      </div>
    </>
  );
}

/* ==========================================================================
   ABA 3: HISTÓRICO (TIMELINE DE ATIVIDADES)
   ========================================================================== */
function AbaHistorico({ negocio }: { negocio: Deal }) {
  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Linha do Tempo de Atividades</h3>
        <p>Registro cronológico de interações e mudanças no lead.</p>
      </div>
      <div className={styles.timeline}>
        <div className={styles.timelineItem}>
          <div className={styles.timelineDot} />
          <div className={styles.timelineConteudo}>
            <div className={styles.timelineTitulo}>Lead cadastrado</div>
            <div className={styles.timelineMeta}>{formatarData(negocio.createdAt)}</div>
          </div>
        </div>
        <p className="aviso aviso--neutro">O histórico completo estará disponível quando a integração de atividades for liberada.</p>
      </div>
    </>
  );
}
/* ==========================================================================
   ABA 4: OPORTUNIDADE (DADOS COMERCIAIS)
   ========================================================================== */
function AbaOportunidade({ negocio, pipeline }: { negocio: Deal; pipeline: Pipeline }) {
  const etapa = pipeline.stages.find((item) => item.id === negocio.stageId);
  const valor = negocio.value ? formatarBRL(negocio.value) : "Não informado";
  const previsao = negocio.expectedCloseDate ? formatarData(negocio.expectedCloseDate) : "Não definida";

  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Oportunidade Comercial</h3>
        <p>Configurações de funil, valores contratuais e equipe responsável.</p>
      </div>

      <div className={styles.leadCardsGrid}>
        <div className={styles.painelCard}>
          <div className={styles.painelCardHeader}>
            <h4>
              <BriefcaseBusiness size={15} /> Estrutura do Negócio
            </h4>
          </div>
          <div className={styles.campoLinha}>
            <span>Pipeline Ativo</span>
            <strong>{pipeline.name}</strong>
          </div>
          <div className={styles.campoLinha}>
            <span>Etapa Atual</span>
            <strong>{etapa?.name ?? "Não informada"}</strong>
          </div>
          <div className={styles.campoLinha}>
            <span>Oportunidade</span>
            <strong>{negocio.title}</strong>
          </div>
        </div>

        <div className={styles.painelCard}>
          <div className={styles.painelCardHeader}>
            <h4>
              <Sparkles size={15} /> Parâmetros Financeiros
            </h4>
          </div>
          <div className={styles.campoLinha}>
            <span>{pipeline.valueLabel || "Investimento estimado"}</span>
            <strong style={{ color: "var(--ui-primary)", fontSize: "16px" }}>{valor}</strong>
          </div>
          <div className={styles.campoLinha}>
            <span>Previsão de Fechamento</span>
            <strong>{previsao}</strong>
          </div>
          <div className={styles.campoLinha}>
            <span>Responsável Comercial</span>
            <strong>{negocio.owner.name}</strong>
          </div>
        </div>
      </div>

      {/* Etiquetas */}
      <div className={styles.painelCard} style={{ marginTop: "12px" }}>
        <div className={styles.painelCardHeader}>
          <h4>Etiquetas</h4>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {negocio.tags.length ? (
            negocio.tags.map((tag) => (
              <span key={tag.id} className="ui-dialog-tag">
                <span className="ui-dialog-tag-dot" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))
          ) : <span className="dica">Nenhuma etiqueta aplicada.</span>}
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   ABA 5: PROPOSTA
   ========================================================================== */
function AbaProposta() {
  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Proposta Comercial</h3>
        <p>As propostas deste lead ficarão organizadas nesta seção.</p>
      </div>
      <div className={styles.propostaCard}>
        <div className={styles.propostaHeader}>
          <div className={styles.propostaCodigo}><strong>Nenhuma proposta vinculada</strong></div>
        </div>
        <p className={styles.cockpitCardSub}>A integração de propostas será disponibilizada em uma próxima etapa.</p>
      </div>
    </>
  );
}
/* ==========================================================================
   ABA 6: DOCUMENTOS (CASCA VISUAL EXPANDIDA)
   ========================================================================== */
function AbaDocumentos() {
  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Documentos do Lead</h3>
        <p>Propostas, contas de energia, documentos do cliente, procurações e contratos.</p>
      </div>
      <div className={styles.dropzoneCard} aria-disabled="true">
        <FolderOpen size={28} className={styles.dropzoneIcone} />
        <div className={styles.dropzoneTitulo}>Envio de documentos em preparação</div>
        <div className={styles.dropzoneDesc}>PDF, JPG, PNG, DOCX e XLSX · até 25 MiB por arquivo</div>
        <div className={styles.dropzoneBadge}>A integração de arquivos será disponibilizada em uma próxima etapa.</div>
      </div>
    </>
  );
}
export function DetalhesDoLeadModal({ negocio, pipeline, acoes, aoAtualizar, aoFechar }: Props) {
  const [secao, setSecao] = useState<Secao>("resumo");
  const [menuAberto, setMenuAberto] = useState(false);
  const [leadAtual, setLeadAtual] = useState<Deal>(negocio);
  const id = useId();
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const botaoMenu = useRef<HTMLButtonElement>(null);

  const etapa = pipeline.stages.find((item) => item.id === leadAtual.stageId);
  const dias = diasNaEtapa(leadAtual);
  const parado = estaParado(leadAtual, pipeline);

  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const indice = SECOES.findIndex((item) => item.id === secao);
    const proximo =
      evento.key === "ArrowDown" || evento.key === "ArrowRight"
        ? (indice + 1) % SECOES.length
        : evento.key === "ArrowUp" || evento.key === "ArrowLeft"
        ? (indice + SECOES.length - 1) % SECOES.length
        : evento.key === "Home"
        ? 0
        : evento.key === "End"
        ? SECOES.length - 1
        : -1;

    if (proximo < 0) return;
    evento.preventDefault();
    setSecao(SECOES[proximo]!.id);
    botoes.current[proximo]?.focus();
  }

  const executar = (acao: (negocio: Deal) => void) => {
    aoFechar();
    acao(leadAtual);
  };

  const handleAtualizar = (atualizado: Deal) => {
    setLeadAtual(atualizado);
    aoAtualizar?.(atualizado);
  };

  return (
    <Modal rotulo="Detalhes do lead" aoFechar={aoFechar} largura="larga" className={styles.modal}>
      <div className={styles.layout}>
        {/* ==================================================================
            CAMPO 1 (ESQUERDA): DETALHES DO LEAD NO TOPO + NAVEGAÇÃO DE ABAS
            ================================================================== */}
        <aside className={styles.sidebar}>
          {/* BLOCO DE DETALHES DO LEAD (NO TOPO DA ESQUERDA) */}
          <div className={styles.leadCardLateral}>
            <div className={styles.leadCardLinhaSuperior}>
              <div className={styles.iconeLead} aria-hidden="true">
                {leadAtual.lead.personType === "pj" ? <Building2 size={20} /> : <UserRound size={20} />}
              </div>
              <div className={styles.leadCardBadges}>
                <div className={styles.leadCardTagsTopo}>
                  <span className={styles.tagContexto}>DETALHES DO LEAD</span>
                  <span className={styles.tagCodigo} title={`ID completo: ${leadAtual.id}`}>
                    PLU-{String(leadAtual.number).padStart(4, "0")}
                  </span>
                </div>
                {etapa ? (
                  <span
                    className={styles.tagEtapa}
                    style={{
                      backgroundColor: etapa.color ? `${etapa.color}15` : "var(--ui-focus-bg)",
                      borderColor: etapa.color ? `${etapa.color}35` : "var(--ui-divider)",
                      color: etapa.color || "var(--ui-primary)",
                    }}
                  >
                    <span
                      className={styles.etapaDot}
                      style={{ backgroundColor: etapa.color || "var(--ui-primary)" }}
                    />
                    {etapa.name}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Nome / Título do Lead */}
            <div className={styles.leadCardTitulo} title={leadAtual.lead.name}>
              {leadAtual.lead.name}
            </div>

            {/* Metadados: Pipeline, Responsável, Dias na etapa */}
            <div className={styles.leadCardMeta}>
              <div className={styles.metaLinha}>
                <span className={styles.metaRotulo}>Funil</span>
                <span className={styles.metaValor}>{pipeline.name}</span>
              </div>
              <div className={styles.metaLinha}>
                <span className={styles.metaRotulo}>Responsável</span>
                <span className={styles.metaResponsavel}>
                  <span className={styles.avatarMini} aria-hidden="true">
                    {leadAtual.owner.name.charAt(0).toUpperCase()}
                  </span>
                  {leadAtual.owner.name}
                </span>
              </div>
              <div className={styles.metaLinha}>
                <span className={styles.metaRotulo}>Permanência</span>
                <span className={parado ? styles.tempoParado : styles.tempoNormal}>
                  {dias} {dias === 1 ? "dia" : "dias"} na etapa
                  {parado ? " (parado)" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* MENU / NAVEGAÇÃO DE ABAS */}
          <div
            className={styles.navegacao}
            role="tablist"
            aria-label="Seções do lead"
            aria-orientation="vertical"
            onKeyDown={navegar}
          >
            {SECOES.map((item, indice) => (
              <div key={item.id}>
                {indice === 0 || indice === 3 ? (
                  <div className={styles.grupo}>
                    {indice === 0 ? "Informações" : "Serviço & Operação"}
                  </div>
                ) : null}
                <button
                  ref={(elemento) => {
                    botoes.current[indice] = elemento;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-${item.id}`}
                  aria-selected={secao === item.id}
                  aria-controls={`${id}-painel`}
                  tabIndex={secao === item.id ? 0 : -1}
                  className={styles.abaBotao}
                  onClick={() => setSecao(item.id)}
                >
                  <item.icone size={15} aria-hidden="true" />
                  <span>{item.titulo}</span>
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* ==================================================================
            CAMPO 2 (DIREITA): TOPO DE AÇÕES + EXIBIÇÃO DAS INFORMAÇÕES
            ================================================================== */}
        <div className={styles.painelPrincipal}>
          {/* HEADER DE AÇÕES NO TOPO DA COLUNA DIREITA */}
          <header className={styles.cabecalhoDireita}>
            <div className={styles.cabecalhoContexto}>
              <h2 className={styles.tituloModalAcessivel}>Detalhes do lead</h2>
              <span className={styles.secaoAtivaTitulo}>
                {SECOES.find((s) => s.id === secao)?.titulo}
              </span>
              <span className={styles.secaoAtivaDesc}>
                {secao === "resumo" && "Cockpit e indicadores comerciais"}
                {secao === "lead" && "Ficha cadastral 360° e dados técnicos"}
                {secao === "historico" && "Linha do tempo e auditoria"}
                {secao === "oportunidade" && "Estrutura do negócio e valores"}
                {secao === "proposta" && "Minuta comercial e condições"}
                {secao === "documentos" && "Documentos categorizados"}
              </span>
            </div>

            {/* Controles de Ação à direita */}
            <div className={styles.controlesCabecalho}>
              {leadAtual.status === "open" ? (
                <Button variant="primary" size="sm" onClick={() => executar(acoes.ganhar)}>
                  {pipeline.wonLabel}
                </Button>
              ) : (
                <span className={styles.statusPill}>
                  {leadAtual.status === "won" ? "Lead Ganho" : "Lead Perdido"}
                </span>
              )}

              <div
                className={styles.menu}
                onBlur={(evento) => {
                  if (!evento.currentTarget.contains(evento.relatedTarget)) setMenuAberto(false);
                }}
                onKeyDown={(evento) => {
                  if (evento.key === "Escape" && menuAberto) {
                    evento.preventDefault();
                    evento.stopPropagation();
                    setMenuAberto(false);
                    botaoMenu.current?.focus();
                  }
                }}
              >
                <button
                  ref={botaoMenu}
                  type="button"
                  className={styles.botaoMenu}
                  aria-label="Mais ações do lead"
                  aria-haspopup="menu"
                  aria-expanded={menuAberto}
                  onClick={() => setMenuAberto((aberto) => !aberto)}
                >
                  <MoreHorizontal size={18} aria-hidden="true" />
                </button>
                {menuAberto ? (
                  <div className={styles.menuOpcoes} role="menu" aria-label="Ações do lead">
                    {leadAtual.status === "open" ? (
                      <>
                        <button type="button" role="menuitem" onClick={() => executar(acoes.perder)}>
                          <X size={14} aria-hidden="true" />
                          {pipeline.lostLabel}
                        </button>
                        <button type="button" role="menuitem" onClick={() => executar(acoes.transferir)}>
                          <ArrowRight size={14} aria-hidden="true" />
                          Mover para outro pipeline
                        </button>
                        {!leadAtual.client && acoes.converter ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuAberto(false);
                              aoFechar();
                              acoes.converter?.(leadAtual);
                            }}
                          >
                            <UserRound size={14} aria-hidden="true" />
                            Converter em cliente
                          </button>
                        ) : null}
                        <span className={styles.menuSeparador} role="separator" />
                      </>
                    ) : null}
                    <span className={styles.menuTitulo}>Prioridade</span>
                    {(
                      [
                        { valor: null, rotulo: "Sem prioridade" },
                        { valor: "urgente", rotulo: "Urgente" },
                        { valor: "medio", rotulo: "Médio" },
                        { valor: "normal", rotulo: "Normal" },
                      ] as const
                    ).map((opcao) => (
                      <button
                        key={opcao.rotulo}
                        type="button"
                        role="menuitemradio"
                        aria-checked={leadAtual.priority === opcao.valor}
                        onClick={() => {
                          setMenuAberto(false);
                          acoes.definirPrioridade(leadAtual, opcao.valor);
                        }}
                      >
                        <span
                          className={`${styles.prioridadeMenuDot} ${
                            opcao.valor ? styles[`prioridade_${opcao.valor}`] : ""
                          }`}
                        />
                        {opcao.rotulo}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Botão Fechar X */}
              <button
                type="button"
                className={styles.botaoFechar}
                onClick={aoFechar}
                aria-label="Fechar"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* ÁREA DE EXIBIÇÃO DAS INFORMAÇÕES (ROLANDO SEPARADAMENTE) */}
          <section
            id={`${id}-painel`}
            role="tabpanel"
            aria-labelledby={`${id}-${secao}`}
            className={styles.conteudo}
          >
            {secao === "resumo" && <AbaResumo negocio={leadAtual} pipeline={pipeline} />}
            {secao === "lead" && <AbaLead negocio={leadAtual} aoAtualizar={handleAtualizar} />}
            {secao === "historico" && <AbaHistorico negocio={leadAtual} />}
            {secao === "oportunidade" && <AbaOportunidade negocio={leadAtual} pipeline={pipeline} />}
            {secao === "proposta" && <AbaProposta />}
            {secao === "documentos" && <AbaDocumentos />}
          </section>
        </div>
      </div>
    </Modal>
  );
}
