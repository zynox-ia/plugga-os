"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Check,
  Clock,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { documentoFormatado, telefoneFormatado } from "../../lib/clientes";
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
  aoFechar: () => void;
};

/* ==========================================================================
   ABA 1: RESUMO (COCKPIT DO ATENDIMENTO)
   ========================================================================== */
function AbaResumo({ negocio, pipeline }: { negocio: Deal; pipeline: Pipeline }) {
  const indiceAtual = pipeline.stages.findIndex((item) => item.id === negocio.stageId);
  const dias = diasNaEtapa(negocio);
  const parado = estaParado(negocio, pipeline);

  const valorFormatado = negocio.value ? formatarBRL(negocio.value) : "R$ 45.000,00";
  const previsaoFormatada = negocio.expectedCloseDate
    ? formatarData(negocio.expectedCloseDate)
    : "15/11/2026";

  const telefoneLimpo = negocio.client?.phone?.replace(/\D/g, "") ?? "92981234567";

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
          <div className={styles.cockpitCardSub}>Previsão de contrato</div>
        </div>

        <div className={styles.cockpitCard}>
          <div className={styles.cockpitCardLabel}>
            <span>Previsão de fechamento</span>
            <Calendar size={13} />
          </div>
          <div className={styles.cockpitCardValor}>{previsaoFormatada}</div>
          <div className={styles.cockpitCardSub}>Em 13 dias corridos</div>
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
          <div className={styles.cockpitCardValor}>Versão 1.2</div>
          <div className={styles.cockpitCardSub}>Em análise pelo lead</div>
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
            Apresentar minuta da proposta técnica ao decisor comercial e validar titularidade da conta de energia.
          </div>
        </div>
      </div>

      {/* Contato Rápido */}
      <div className={styles.resumoContatoGrid}>
        <div className={styles.contatoPill}>
          <Phone size={16} />
          <div className={styles.contatoPillTextos}>
            <span className={styles.contatoPillLabel}>Telefone</span>
            <span className={styles.contatoPillValor}>
              {telefoneFormatado(negocio.client?.phone) || "(92) 98124-5500"}
            </span>
          </div>
          <a
            href={`https://wa.me/55${telefoneLimpo}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnAcaoRapida}
            style={{ marginLeft: "auto" }}
          >
            WhatsApp
          </a>
        </div>

        <div className={styles.contatoPill}>
          <Mail size={16} />
          <div className={styles.contatoPillTextos}>
            <span className={styles.contatoPillLabel}>E-mail</span>
            <span className={styles.contatoPillValor}>
              {negocio.client?.email || "contato@empresa.com.br"}
            </span>
          </div>
        </div>

        <div className={styles.contatoPill}>
          <Building2 size={16} />
          <div className={styles.contatoPillTextos}>
            <span className={styles.contatoPillLabel}>Localidade</span>
            <span className={styles.contatoPillValor}>
              {negocio.client?.city
                ? `${negocio.client.city} - ${negocio.client.state || "AM"}`
                : "Manaus - AM"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   ABA 2: LEAD (FICHA CADASTRAL 360°)
   ========================================================================== */
function AbaLead({ negocio }: { negocio: Deal }) {
  const [copiado, setCopiado] = useState(false);
  const [nota, setNota] = useState(
    "Cliente demonstrou interesse em plano de geração distribuída para redução de até 25% na tarifa de energia. Decisor principal: Roberto (Diretoria)."
  );

  const doc = documentoFormatado(negocio.client?.personType, negocio.client?.document) || "—";
  const tel = telefoneFormatado(negocio.client?.phone) || "—";
  const email = negocio.client?.email || "—";
  const nome = negocio.client?.name || negocio.title || "—";

  function copiarEmail() {
    if (email && email !== "—") {
      navigator.clipboard?.writeText(email);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Ficha Cadastral 360°</h3>
        <p>Dados de identificação, canais de contato e anotações do lead.</p>
      </div>

      <div className={styles.leadCardsGrid}>
        {/* Identificação */}
        <div className={styles.painelCard}>
          <div className={styles.painelCardHeader}>
            <h4>
              <Building2 size={15} /> Identificação Principal
            </h4>
            <span className="ui-badge ui-tone--info">
              {negocio.client?.personType === "pj" ? "Pessoa Jurídica (PJ)" : "Pessoa Física (PF)"}
            </span>
          </div>
          <label className={styles.campoEditavel}>
            <span>Nome</span>
            <input className="ui-input" aria-label="Nome" readOnly value={nome} />
          </label>
          <label className={styles.campoEditavel}>
            <span>Documento</span>
            <input className="ui-input" aria-label="Documento" readOnly value={doc} />
          </label>
          <div className={styles.campoLinha}>
            <span>Origem do Lead</span>
            <strong>Indicação Comercial · Rede de Parceiros</strong>
          </div>
        </div>

        {/* Canais de Contato */}
        <div className={styles.painelCard}>
          <div className={styles.painelCardHeader}>
            <h4>
              <Phone size={15} /> Canais de Comunicação
            </h4>
            <span className="ui-badge ui-tone--success">Canal verificado</span>
          </div>
          <label className={styles.campoEditavel}>
            <span>Telefone</span>
            <div className={styles.campoComAcao}>
              <input className="ui-input" aria-label="Telefone" readOnly value={tel} />
              {tel !== "—" ? (
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
              <input className="ui-input" aria-label="E-mail" readOnly value={email} />
              {email !== "—" ? (
                <button type="button" className={styles.btnAcaoRapida} onClick={copiarEmail}>
                  {copiado ? <Check size={12} /> : <Copy size={12} />}
                  {copiado ? "Copiado!" : "Copiar"}
                </button>
              ) : null}
            </div>
          </label>
          <div className={styles.campoLinha}>
            <span>Endereço / Polo de Atendimento</span>
            <strong>Av. Djalma Batista, 1661 - Manaus, AM</strong>
          </div>
        </div>
      </div>

      {/* Anotações do Lead */}
      <div className={styles.painelCard}>
        <div className={styles.painelCardHeader}>
          <h4>
            <FileText size={15} /> Anotações do Atendimento
          </h4>
          <span style={{ fontSize: "11px", color: "var(--ui-muted)" }}>Atualizado há 2h por Admin</span>
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
    </>
  );
}

/* ==========================================================================
   ABA 3: HISTÓRICO (TIMELINE DE ATIVIDADES)
   ========================================================================== */
function AbaHistorico({ negocio }: { negocio: Deal }) {
  const eventos = [
    {
      id: "ev-1",
      titulo: "Proposta comercial enviada via WhatsApp",
      data: "Hoje às 11:20",
      autor: "Admin",
      icone: FileText,
    },
    {
      id: "ev-2",
      titulo: "Lead avançou para a etapa Qualificação",
      data: "Ontem às 16:45",
      autor: "Admin",
      icone: ArrowRight,
    },
    {
      id: "ev-3",
      titulo: "Alinhamento técnico e análise de conta de energia",
      data: "28/10/2026 às 14:10",
      autor: "Admin",
      icone: Phone,
    },
    {
      id: "ev-4",
      titulo: "Lead cadastrado no pipeline",
      data: formatarData(negocio.createdAt),
      autor: "Entrada direta",
      icone: UserRound,
    },
  ];

  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Linha do Tempo de Atividades</h3>
        <p>Registro cronológico de interações, mudanças de etapas e auditoria.</p>
      </div>

      <div className={styles.timeline}>
        {eventos.map((ev) => (
          <div key={ev.id} className={styles.timelineItem}>
            <div className={styles.timelineDot} />
            <div className={styles.timelineConteudo}>
              <div className={styles.timelineTitulo}>{ev.titulo}</div>
              <div className={styles.timelineMeta}>
                {ev.data} · Por {ev.autor}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ==========================================================================
   ABA 4: OPORTUNIDADE (DADOS COMERCIAIS)
   ========================================================================== */
function AbaOportunidade({ negocio, pipeline }: { negocio: Deal; pipeline: Pipeline }) {
  const etapa = pipeline.stages.find((item) => item.id === negocio.stageId);
  const valor = negocio.value ? formatarBRL(negocio.value) : "R$ 45.000,00";
  const previsao = negocio.expectedCloseDate ? formatarData(negocio.expectedCloseDate) : "15/11/2026";

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
            <span>Modelo de Atendimento</span>
            <strong>Geração Distribuída · Locação Fotovoltaica</strong>
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
      <div className={styles.painelCard}>
        <div className={styles.painelCardHeader}>
          <h4>Etiquetas e Segmentação</h4>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {negocio.tags.length ? (
            negocio.tags.map((tag) => (
              <span key={tag.id} className="ui-dialog-tag">
                <span className="ui-dialog-tag-dot" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))
          ) : (
            <>
              <span className="ui-dialog-tag">
                <span className="ui-dialog-tag-dot" style={{ backgroundColor: "#0066cc" }} />
                Solar Comercial
              </span>
              <span className="ui-dialog-tag">
                <span className="ui-dialog-tag-dot" style={{ backgroundColor: "#126744" }} />
                Alta Tensão (Grupo A)
              </span>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   ABA 5: PROPOSTA
   ========================================================================== */
function AbaProposta({ negocio }: { negocio: Deal }) {
  const [downloading, setDownloading] = useState(false);

  function simularDownload() {
    setDownloading(true);
    setTimeout(() => setDownloading(false), 1200);
  }

  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Proposta Comercial</h3>
        <p>Versão ativa dimensionada para o lead e histórico de orçamentos.</p>
      </div>

      <div className={styles.propostaCard}>
        <div className={styles.propostaHeader}>
          <div className={styles.propostaCodigo}>
            <strong>PROP-2026-0042</strong>
            <span>Versão 1.2</span>
          </div>
          <span className={styles.propostaStatus}>
            <span className="ui-status-dot" style={{ background: "#1759a0" }} />
            Em análise pelo cliente
          </span>
        </div>

        <div className={styles.propostaGrid}>
          <div className={styles.campoLinha}>
            <span>Investimento Total</span>
            <strong style={{ fontSize: "16px", color: "var(--ui-text)" }}>
              {negocio.value ? formatarBRL(negocio.value) : "R$ 45.000,00"}
            </strong>
          </div>
          <div className={styles.campoLinha}>
            <span>Economia Projetada</span>
            <strong style={{ color: "#126744" }}>R$ 18.240,00 / ano</strong>
          </div>
          <div className={styles.campoLinha}>
            <span>Potência Dimensionada</span>
            <strong>15,4 kWp (42 módulos)</strong>
          </div>
        </div>

        <div className={styles.propostaAcoes}>
          <Button variant="primary" size="sm" icon={<Download size={14} />} onClick={simularDownload}>
            {downloading ? "Gerando PDF..." : "Visualizar Proposta (PDF)"}
          </Button>
          <Button variant="secondary" size="sm" icon={<ExternalLink size={14} />}>
            Gerar nova versão
          </Button>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   ABA 6: DOCUMENTOS
   ========================================================================== */
function AbaDocumentos() {
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>("todas");

  const docs = [
    {
      id: "doc-1",
      nome: "Fatura_de_Energia_CPFL_Setembro.pdf",
      categoria: "energia",
      categoriaNome: "Conta de Energia",
      tamanho: "1.4 MiB",
      status: "Aprovado",
    },
    {
      id: "doc-2",
      nome: "Contrato_Social_Consolidado_2026.pdf",
      categoria: "documento",
      categoriaNome: "Documento do Cliente",
      tamanho: "3.8 MiB",
      status: "Aprovado",
    },
    {
      id: "doc-3",
      nome: "Minuta_Contrato_Adesao_Solar_v1.docx",
      categoria: "proposta",
      categoriaNome: "Procuração / Contrato",
      tamanho: "820 KiB",
      status: "Em análise",
    },
  ];

  const docsFiltrados =
    categoriaAtiva === "todas" ? docs : docs.filter((d) => d.categoria === categoriaAtiva);

  return (
    <>
      <div className={styles.tituloSecao}>
        <h3>Documentos</h3>
        <p>Arquivos organizados por categoria, anexos contratuais e contas de consumo.</p>
      </div>

      <div className={styles.dropzone} role="region" aria-label="Área de envio de documentos">
        <CloudUpload size={26} aria-hidden="true" />
        <strong>Envio de documentos em preparação</strong>
        <span>PDF, JPG, PNG, DOCX ou XLSX · até 25 MiB por arquivo</span>
      </div>

      {/* Chips de Categorias */}
      <div className={styles.chipsCategorias} role="group" aria-label="Filtro por categoria de documento">
        {[
          { id: "todas", label: `Todos (${docs.length})` },
          { id: "energia", label: "Conta de Energia (1)" },
          { id: "documento", label: "Documento do Cliente (1)" },
          { id: "proposta", label: "Contrato / Minuta (1)" },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`${styles.chipFiltro} ${categoriaAtiva === cat.id ? styles.chipAtivo : ""}`}
            onClick={() => setCategoriaAtiva(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Lista de Documentos */}
      <div className={styles.documentosLista}>
        {docsFiltrados.map((doc) => (
          <div key={doc.id} className={styles.documentoItem}>
            <div className={styles.docIcone}>
              <FileText size={16} />
            </div>
            <div className={styles.docDetalhes}>
              <div className={styles.docNome} title={doc.nome}>
                {doc.nome}
              </div>
              <div className={styles.docMeta}>
                {doc.categoriaNome} · {doc.tamanho}
              </div>
            </div>
            <span className={styles.docStatusBadge}>{doc.status}</span>
            <Button variant="secondary" size="sm" icon={<Download size={13} />} iconOnly aria-label={`Baixar ${doc.nome}`} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ==========================================================================
   ROTEADOR DE CONTEÚDO DAS ABAS
   ========================================================================== */
function ConteudoSecao({ secao, negocio, pipeline }: { secao: Secao; negocio: Deal; pipeline: Pipeline }) {
  switch (secao) {
    case "resumo":
      return <AbaResumo negocio={negocio} pipeline={pipeline} />;
    case "lead":
      return <AbaLead negocio={negocio} />;
    case "historico":
      return <AbaHistorico negocio={negocio} />;
    case "oportunidade":
      return <AbaOportunidade negocio={negocio} pipeline={pipeline} />;
    case "proposta":
      return <AbaProposta negocio={negocio} />;
    case "documentos":
      return <AbaDocumentos />;
    default:
      return null;
  }
}

/* ==========================================================================
   COMPONENTE PRINCIPAL DO MODAL DE DETALHES DO LEAD
   ========================================================================== */
export function DetalhesDoLeadModal({ negocio, pipeline, acoes, aoFechar }: Props) {
  const [secao, setSecao] = useState<Secao>("resumo");
  const [menuAberto, setMenuAberto] = useState(false);
  const id = useId();
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const botaoMenu = useRef<HTMLButtonElement>(null);

  const etapa = pipeline.stages.find((item) => item.id === negocio.stageId);
  const dias = diasNaEtapa(negocio);
  const parado = estaParado(negocio, pipeline);

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
    acao(negocio);
  };

  return (
    <Modal rotulo="Detalhes do lead" aoFechar={aoFechar} largura="larga" className={styles.modal}>
      <div className={styles.layout}>
        {/* COLUNA ESQUERDA: NAVEGAÇÃO / SIDEBAR DE ABAS */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarIcone} aria-hidden="true">
              {negocio.client?.personType === "pj" ? <Building2 size={16} /> : <UserRound size={16} />}
            </div>
            <div className={styles.sidebarHeaderInfo}>
              <span className={styles.sidebarTitulo}>Menu</span>
              <span className={styles.sidebarSubtitulo}>Navegação</span>
            </div>
          </div>

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
                  ref={(el) => {
                    botoes.current[indice] = el;
                  }}
                  id={`${id}-${item.id}`}
                  type="button"
                  role="tab"
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

        {/* COLUNA DIREITA: CABEÇALHO + CAMPO DE INFORMAÇÕES */}
        <div className={styles.painelPrincipal}>
          {/* CABEÇALHO ALINHADO À DIREITA, ANTES DO CAMPO DE INFORMAÇÕES */}
          <header className={styles.cabecalho}>
            <div className={styles.iconeHeader} aria-hidden="true">
              {negocio.client?.personType === "pj" ? <Building2 size={20} /> : <UserRound size={20} />}
            </div>

            <div className={styles.identidade}>
              {/* Linha 1: Badges de Contexto */}
              <div className={styles.linhaTopo}>
                <h2 className={styles.tituloModalAcessivel}>Detalhes do lead</h2>
                <span className={styles.tagCodigo} title={`ID completo: ${negocio.id}`}>
                  PLU-{String(negocio.number).padStart(4, "0")}
                </span>
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
                {negocio.priority ? (
                  <span className={`${styles.tagPrioridade} ${styles[`prioridade_${negocio.priority}`]}`}>
                    <span className={styles.prioridadeDot} />
                    {negocio.priority === "urgente"
                      ? "Urgente"
                      : negocio.priority === "medio"
                      ? "Médio"
                      : "Normal"}
                  </span>
                ) : null}
              </div>

              {/* Linha 2: Nome do Lead */}
              <div className={styles.nomeLead} title={negocio.title}>
                {negocio.title}
              </div>

              {/* Linha 3: Metadados */}
              <div
                className={styles.meta}
                title={`ID completo: ${negocio.id} · ${pipeline.name} · ${etapa?.name ?? "Etapa"} · Responsável: ${negocio.owner.name}`}
              >
                <span>{pipeline.name}</span>
                <span className={styles.separador}>·</span>
                <span className={styles.metaResponsavel}>
                  <span className={styles.avatarMini} aria-hidden="true">
                    {negocio.owner.name.charAt(0).toUpperCase()}
                  </span>
                  {negocio.owner.name}
                </span>
                <span className={styles.separador}>·</span>
                <span className={parado ? styles.tempoParado : styles.tempoNormal}>
                  {dias} {dias === 1 ? "dia" : "dias"} na etapa
                  {parado ? " (parado)" : ""}
                </span>
              </div>
            </div>

            {/* Controles à direita: 1 botão principal e os 3 pontinhos */}
            <div className={styles.controlesCabecalho}>
              {negocio.status === "open" ? (
                <Button variant="primary" size="sm" onClick={() => executar(acoes.ganhar)}>
                  {pipeline.wonLabel}
                </Button>
              ) : (
                <span className={styles.statusPill}>
                  {negocio.status === "won" ? "Lead Ganho" : "Lead Perdido"}
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
                    {negocio.status === "open" ? (
                      <>
                        <button type="button" role="menuitem" onClick={() => executar(acoes.perder)}>
                          <X size={14} aria-hidden="true" />
                          {pipeline.lostLabel}
                        </button>
                        <button type="button" role="menuitem" onClick={() => executar(acoes.transferir)}>
                          <ArrowRight size={14} aria-hidden="true" />
                          Mover para outro pipeline
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuAberto(false);
                          }}
                        >
                          <UserRound size={14} aria-hidden="true" />
                          Converter em cliente
                        </button>
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
                        aria-checked={negocio.priority === opcao.valor}
                        onClick={() => {
                          setMenuAberto(false);
                          void acoes.definirPrioridade(negocio, opcao.valor);
                          botaoMenu.current?.focus();
                        }}
                      >
                        {negocio.priority === opcao.valor ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          <span className={styles.menuEspaco} />
                        )}
                        {opcao.rotulo}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <Button
                variant="secondary"
                size="sm"
                icon={<X size={16} />}
                iconOnly
                aria-label="Fechar"
                onClick={aoFechar}
              />
            </div>
          </header>

          {/* CAMPO DE INFORMAÇÕES (CONTEÚDO DA ABA SELECIONADA) */}
          <section
            className={styles.conteudo}
            id={`${id}-painel`}
            role="tabpanel"
            aria-labelledby={`${id}-${secao}`}
            tabIndex={0}
          >
            <ConteudoSecao secao={secao} negocio={negocio} pipeline={pipeline} />
          </section>
        </div>
      </div>
    </Modal>
  );
}
