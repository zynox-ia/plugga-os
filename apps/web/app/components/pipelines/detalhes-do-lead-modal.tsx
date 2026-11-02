"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { ArrowRight, BriefcaseBusiness, CloudUpload, FileText, FolderOpen, History, LayoutDashboard, UserRound, X } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { documentoFormatado, telefoneFormatado } from "../../lib/clientes";
import { formatarBRL, formatarData } from "../../lib/format";
import { diasNaEtapa, estaParado } from "../../lib/negocios";
import { Modal } from "../modal";
import { Button } from "../ui/button";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";
import { SeletorBadgePrioridade } from "./seletor-badge-prioridade";
import styles from "./detalhes-do-lead-modal.module.css";

const SECOES = [
  { id: "resumo", titulo: "Resumo", icone: LayoutDashboard },
  { id: "lead", titulo: "Lead", icone: UserRound },
  { id: "historico", titulo: "Histórico", icone: History },
  { id: "oportunidade", titulo: "Oportunidade", icone: BriefcaseBusiness },
  { id: "proposta", titulo: "Proposta", icone: FileText },
  { id: "documentos", titulo: "Documentos", icone: FolderOpen },
] as const;
type Secao = typeof SECOES[number]["id"];

type Props = { negocio: Deal; pipeline: Pipeline; acoes: AcoesDoNegocio; aoFechar: () => void };
type Documento = { id: string; nome: string; categoria: string; estado: "enviando" | "enviado" | "erro" | "duplicado"; progresso?: number };
type DadosLead = { nome: string; documento: string; telefone: string; email: string };
type EventoHistorico = { id: string; titulo: string; data: string };

function DadosDoLead({ dados, aoSalvar }: { dados: DadosLead; aoSalvar?: (dados: DadosLead) => void }) {
  const [rascunho, setRascunho] = useState(dados);
  const campos: { chave: keyof DadosLead; rotulo: string }[] = [
    { chave: "nome", rotulo: "Nome" }, { chave: "documento", rotulo: "Documento" },
    { chave: "telefone", rotulo: "Telefone" }, { chave: "email", rotulo: "E-mail" },
  ];
  return <>
    <div className={styles.tituloSecao}><h3>Lead</h3><p>Dados de identificação e contato disponíveis.</p></div>
    <div className={styles.grade}>{campos.map((campo) => <label className={styles.campo} key={campo.chave}>
      <span>{campo.rotulo}</span><input className="ui-input" value={aoSalvar ? rascunho[campo.chave] : rascunho[campo.chave] || "—"} disabled={!aoSalvar} onChange={(evento) => setRascunho((atual) => ({ ...atual, [campo.chave]: evento.target.value }))} />
    </label>)}</div>
    {aoSalvar ? <Button variant="primary" size="sm" onClick={() => aoSalvar(rascunho)}>Salvar dados</Button> : <p className={styles.observacao}>A edição dos dados do lead estará disponível em breve.</p>}
  </>;
}

function Historico({ eventos }: { eventos: EventoHistorico[] | null }) {
  return <div className={styles.estado}><History size={28} aria-hidden="true" /><h3>Histórico</h3>{eventos === null ? <p>O histórico deste lead estará disponível em breve.</p> : eventos.length ? <ul>{eventos.map((evento) => <li key={evento.id}>{evento.titulo} · {evento.data}</li>)}</ul> : <p>Nenhuma atividade registrada.</p>}</div>;
}

function Documentos({ documentos, disponivel }: { documentos: Documento[]; disponivel: boolean }) {
  return <>
    <div className={styles.tituloSecao}><h3>Documentos</h3><p>Organize os arquivos deste lead por categoria.</p></div>
    <div className={styles.dropzone} aria-disabled={!disponivel}>
      <CloudUpload size={24} aria-hidden="true" />
      <strong>{disponivel ? "Arraste arquivos ou escolha no computador" : "Envio de documentos em preparação"}</strong>
      <span>PDF, JPG, PNG, DOCX ou XLSX · até 25 MiB por arquivo</span>
    </div>
    {documentos.length ? <ul className={styles.documentos}>{documentos.map((documento) => <li key={documento.id}>
      <FileText size={16} aria-hidden="true" /><span>{documento.nome}<small>{documento.categoria}</small></span>
      <span role="status">{documento.estado === "enviando" ? `Enviando ${documento.progresso ?? 0}%` : documento.estado === "duplicado" ? "Arquivo duplicado" : documento.estado === "erro" ? "Erro no envio" : "Enviado"}</span>
    </li>)}</ul> : <p className={styles.vazioTexto}>Nenhum documento disponível.</p>}
  </>;
}

function Campo({ nome, children, destaque = false }: { nome: string; children: ReactNode; destaque?: boolean }) {
  return <div className={`${styles.campo}${destaque ? ` ${styles.destaque}` : ""}`}><span>{nome}</span><strong>{children || "Não informado"}</strong></div>;
}

function Etiquetas({ negocio }: { negocio: Deal }) {
  return <div className={styles.etiquetas}>{negocio.tags.length ? negocio.tags.map((tag) => <span key={tag.id} className="ui-dialog-tag"><span className="ui-dialog-tag-dot" style={{ backgroundColor: tag.color }} />{tag.name}</span>) : <span className={styles.vazioTexto}>Nenhuma etiqueta.</span>}</div>;
}

function Conteudo({ secao, negocio, pipeline }: { secao: Secao; negocio: Deal; pipeline: Pipeline }) {
  const etapa = pipeline.stages.find((item) => item.id === negocio.stageId);
  const valor = negocio.value ? formatarBRL(negocio.value) : "Não informado";
  const previsao = negocio.expectedCloseDate ? formatarData(negocio.expectedCloseDate) : "Não informada";
  if (secao === "resumo") {
    const dias = diasNaEtapa(negocio);
    return <>
      <div className={styles.tituloSecao}><h3>Resumo</h3><p>Panorama do atendimento e da oportunidade.</p></div>
      <div className={styles.grade}>
        <Campo nome={pipeline.valueLabel || "Valor estimado"} destaque>{valor}</Campo>
        <Campo nome="Previsão de fechamento" destaque>{previsao}</Campo>
        <Campo nome="Tempo na etapa">{`${dias} ${dias === 1 ? "dia" : "dias"}${estaParado(negocio, pipeline) ? " · Parado" : ""}`}</Campo>
        <Campo nome="Proposta">Em preparação</Campo>
        <Campo nome="Número de documentos">Em preparação</Campo>
      </div>
    </>;
  }
  if (secao === "oportunidade") return <>
    <div className={styles.tituloSecao}><h3>Oportunidade</h3><p>Informações comerciais deste lead.</p></div>
    <div className={styles.grade}>
      <Campo nome="Pipeline">{pipeline.name}</Campo>
      <Campo nome="Etapa">{etapa?.name ?? "Não informada"}</Campo>
      <Campo nome={pipeline.valueLabel || "Valor estimado"}>{valor}</Campo>
      <Campo nome="Previsão de fechamento">{previsao}</Campo>
      <Campo nome="Responsável">{negocio.owner.name}</Campo>
    </div>
    <div className={styles.bloco}><h4>Etiquetas</h4><Etiquetas negocio={negocio} /></div>
  </>;
  if (secao === "lead") return <DadosDoLead dados={{ nome: negocio.client.name, documento: documentoFormatado(negocio.client.personType, negocio.client.document) ?? "", telefone: telefoneFormatado(negocio.client.phone) ?? "", email: negocio.client.email ?? "" }} />;
  if (secao === "historico") return <Historico eventos={null} />;
  if (secao === "documentos") return <Documentos documentos={[]} disponivel={false} />;
  const texto = "Os documentos da categoria Proposta aparecerão aqui.";
  return <div className={styles.estado}><FolderOpen size={28} aria-hidden="true" /><h3>{SECOES.find((item) => item.id === secao)?.titulo}</h3><p>{texto}</p></div>;
}

export function DetalhesDoLeadModal({ negocio, pipeline, acoes, aoFechar }: Props) {
  const [secao, setSecao] = useState<Secao>("resumo");
  const id = useId();
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const etapa = pipeline.stages.find((item) => item.id === negocio.stageId);
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const indice = SECOES.findIndex((item) => item.id === secao);
    const proximo = evento.key === "ArrowDown" || evento.key === "ArrowRight" ? (indice + 1) % SECOES.length : evento.key === "ArrowUp" || evento.key === "ArrowLeft" ? (indice + SECOES.length - 1) % SECOES.length : evento.key === "Home" ? 0 : evento.key === "End" ? SECOES.length - 1 : -1;
    if (proximo < 0) return;
    evento.preventDefault();
    setSecao(SECOES[proximo]!.id);
    botoes.current[proximo]?.focus();
  }
  const executar = (acao: (negocio: Deal) => void) => { aoFechar(); acao(negocio); };
  return <Modal rotulo="Detalhes do lead" aoFechar={aoFechar} largura="larga" className={styles.modal}>
    <header className={styles.cabecalho}>
      <div className={styles.identidade}>
        <span className={styles.codigo} title={`ID completo: ${negocio.id}`}>PLU-{String(negocio.number).padStart(4, "0")}</span>
        <h2>{negocio.title}</h2>
        <div className={styles.meta}><span>{pipeline.name} · {etapa?.name ?? "Etapa"}</span><span>Responsável: {negocio.owner.name}</span><SeletorBadgePrioridade nome={negocio.title} value={negocio.priority ?? ""} onChange={(prioridade) => void acoes.definirPrioridade(negocio, prioridade || null)} /></div>
      </div>
      <Button variant="secondary" size="sm" icon={<X size={16} />} iconOnly aria-label="Fechar" onClick={aoFechar} />
    </header>
    {negocio.status === "open" ? <div className={styles.acoes}>
      <Button variant="primary" size="sm" onClick={() => executar(acoes.ganhar)}>{pipeline.wonLabel}</Button>
      <Button variant="secondary" size="sm" onClick={() => executar(acoes.perder)}>{pipeline.lostLabel}</Button>
      <Button variant="secondary" size="sm" icon={<ArrowRight size={14} />} onClick={() => executar(acoes.transferir)}>Mover para outro pipeline</Button>
    </div> : null}
    <div className={styles.corpo}>
      <div className={styles.navegacao} role="tablist" aria-label="Seções do lead" aria-orientation="vertical" onKeyDown={navegar}>
        {SECOES.map((item, indice) => <div key={item.id}>
          {indice === 0 || indice === 3 ? <div className={styles.grupo}>{indice === 0 ? "Informações" : "Serviço"}</div> : null}
          <button ref={(el) => { botoes.current[indice] = el; }} id={`${id}-${item.id}`} type="button" role="tab" aria-selected={secao === item.id} aria-controls={`${id}-painel`} tabIndex={secao === item.id ? 0 : -1} onClick={() => setSecao(item.id)}><item.icone size={16} aria-hidden="true" />{item.titulo}</button>
        </div>)}
      </div>
      <section className={styles.conteudo} id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${secao}`} tabIndex={0}><Conteudo secao={secao} negocio={negocio} pipeline={pipeline} /></section>
    </div>
  </Modal>;
}
