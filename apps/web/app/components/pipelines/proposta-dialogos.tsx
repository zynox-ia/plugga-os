"use client";

import type { LeadProposal, LeadProposalContent, LeadProposalTemplate } from "@plugga/shared";
import { telefoneNacional } from "@plugga/shared";
import { ArrowRight, CheckCircle2, ChevronLeft, Download, FileText, Layers, Pencil, Save, UserRound } from "lucide-react";
import { useRef, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { caminhoPropostas, codigoProposta } from "../../lib/propostas-lead";
import { mascaraTelefone } from "../../lib/perfil-lead";
import { formatarBRL } from "../../lib/format";
import { Button } from "../ui/button";
import { CurrencyField } from "../ui/currency-field";
import { DatePicker } from "../ui/date-picker";
import { Dialog } from "../ui/dialog";
import { TextField, TextareaField } from "../ui/fields";
import { PdfPreview } from "../ui/pdf-preview";
import styles from "./propostas-do-lead.module.css";

export function ModelosDePropostaModal({ modelos, selecionado, aoSelecionar, aoContinuar, aoFechar }: {
  modelos: LeadProposalTemplate[]; selecionado: string; aoSelecionar: (id: string) => void; aoContinuar: () => void; aoFechar: () => void;
}) {
  return createPortal(<div className={styles.modelosModal}><Dialog title="Nova proposta comercial" description="Escolha um modelo para começar com os dados deste lead." icon={<FileText />} onClose={aoFechar}
    footer={<Button icon={<ArrowRight />} disabled={!selecionado} onClick={aoContinuar}>Continuar</Button>}>
    <div className={styles.etapas}><span className={styles.etapaAtiva}>1. Modelo</span><ArrowRight size={12} /><span>2. Conteúdo</span><ArrowRight size={12} /><span>3. PDF</span></div>
    <div className={styles.modelos}>{modelos.map((modelo) => <button type="button" key={modelo.id} aria-pressed={selecionado === modelo.id} className={`${styles.modelo} ${selecionado === modelo.id ? styles.modeloAtivo : ""}`} onClick={() => aoSelecionar(modelo.id)}>
      <div className={`${styles.miniatura} ${modelo.style === "consultiva" ? styles.miniaturaConsultiva : ""}`} aria-hidden="true"><div className={styles.papel}><b>plugga.</b><span className={styles.miniTitle} /><span /><span /><div /><span /><span /><span /></div><span className={styles.miniPaginas}>{modelo.style === "consultiva" ? "Capa + conteúdo" : "Formato direto"}</span></div>
      <div className={styles.modeloConteudo}><div className={styles.modeloNome}>{modelo.name}{selecionado === modelo.id ? <CheckCircle2 size={17} aria-hidden="true" /> : null}</div><p>{modelo.description}</p></div>
    </button>)}</div>
    <p className={styles.ajuda}>Você poderá revisar todos os campos antes de gerar o PDF.</p>
  </Dialog></div>, document.body);
}

export function EditorPropostaModal({ conteudo, modelo, atual, ocupado, erro, bloqueado, aoAlterar, aoAcao, aoModelo, aoFechar, aoRecarregar }: {
  conteudo: LeadProposalContent; modelo: string; atual: LeadProposal | null; ocupado: boolean; erro: string | null; bloqueado: boolean;
  aoAlterar: (campo: keyof LeadProposalContent, valor: string) => void; aoAcao: (acao: "salvar" | "preview" | "gerar") => void;
  aoModelo: () => void; aoFechar: () => void; aoRecarregar: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const acao = (valor: "salvar" | "preview" | "gerar") => { if (form.current?.reportValidity()) aoAcao(valor); };
  const campo = (label: string, nome: keyof LeadProposalContent, props: ComponentProps<typeof TextField> = {}) => <TextField label={label} value={conteudo[nome]} maxLength={300} onChange={(evento) => aoAlterar(nome, evento.target.value)} {...props} />;
  return createPortal(<div className={styles.editor}><Dialog title={atual ? "Editar proposta comercial" : "Nova proposta comercial"} description={atual ? `${codigoProposta(atual)} · Seus ajustes não alteram o perfil do lead.` : "Revise o conteúdo e personalize a proposta comercial."} icon={<FileText />} size="larga" onClose={aoFechar}
    footer={<><Button variant="secondary" icon={<Save />} disabled={ocupado || bloqueado} onClick={() => acao("salvar")}>Salvar rascunho</Button><Button variant="secondary" icon={<FileText />} disabled={ocupado || bloqueado} onClick={() => acao("preview")}>Visualizar prévia</Button><Button icon={<FileText />} loading={ocupado} disabled={bloqueado} onClick={() => acao("gerar")}>Gerar PDF</Button></>}>
    <div className={styles.etapas}>{!atual ? <button type="button" disabled={ocupado} onClick={aoModelo}><ChevronLeft size={12} />Modelo</button> : <span>1. Modelo</span>}<ArrowRight size={12} /><span className={styles.etapaAtiva}>2. Conteúdo</span><ArrowRight size={12} /><span>3. PDF</span></div>
    <div className={styles.preenchido}><UserRound size={17} aria-hidden="true" /><div><strong>Dados do lead preenchidos automaticamente</strong><p>Os ajustes abaixo valem apenas para esta proposta.</p></div></div>
    {erro ? <div role="alert" className="aviso aviso--erro"><p>{erro}</p>{bloqueado ? <Button variant="secondary" size="sm" disabled={ocupado} onClick={aoRecarregar}>{atual ? "Recarregar proposta atual" : "Conferir lista de propostas"}</Button> : null}</div> : null}
    <form ref={form} onSubmit={(evento) => evento.preventDefault()}><fieldset className={styles.formulario} disabled={ocupado}>
      <section className="ui-dialog-section"><div className={styles.editorTitulo}><h3>Identificação da proposta</h3><span><Layers size={12} aria-hidden="true" />{modelo}</span></div>
        {campo("Título da proposta", "title", { required: true })}
        <div className="ui-dialog-grid">{campo("Cliente / destinatário", "recipient", { required: true })}{campo("Empresa", "company")}{campo("E-mail", "email", { type: "email", autoComplete: "email" })}<TextField label="Celular / WhatsApp" value={mascaraTelefone(conteudo.phone)} inputMode="tel" autoComplete="tel-national" onChange={(evento) => aoAlterar("phone", telefoneNacional(evento.target.value).slice(0, 11))} />{campo("Responsável comercial", "owner")}{campo("Cargo / função do contato", "jobTitle")}{campo("Cidade / UF", "city")}</div>
      </section>
      <section className="ui-dialog-section"><h3 className={styles.secaoTitulo}>Apresentação e escopo</h3><TextareaField label="Apresentação" rows={3} value={conteudo.introduction} maxLength={6000} onChange={(evento) => aoAlterar("introduction", evento.target.value)} /><TextareaField label="Escopo e entregáveis" rows={4} value={conteudo.scope} maxLength={6000} onChange={(evento) => aoAlterar("scope", evento.target.value)} /></section>
      <section className="ui-dialog-section"><h3 className={styles.secaoTitulo}>Investimento e condições</h3><div className="ui-dialog-grid"><CurrencyField label="Investimento proposto" value={conteudo.amount} onValueChange={(valor) => aoAlterar("amount", valor)} /><DatePicker label="Validade da proposta" value={conteudo.validUntil} onChange={(valor) => aoAlterar("validUntil", valor)} required /></div><TextareaField label="Condições comerciais" rows={3} value={conteudo.payment} maxLength={6000} onChange={(evento) => aoAlterar("payment", evento.target.value)} /><TextareaField label="Observações" rows={3} value={conteudo.notes} maxLength={6000} onChange={(evento) => aoAlterar("notes", evento.target.value)} /></section>
    </fieldset></form>
  </Dialog></div>, document.body);
}

export function VisualizacaoPropostaModal({ proposta, aoEditar, aoFechar, voltar }: { proposta: LeadProposal; aoEditar: () => void; aoFechar: () => void; voltar: boolean }) {
  return createPortal(<div className={styles.viewer}><Dialog title="Visualizar proposta" description={`${codigoProposta(proposta)} · ${proposta.templateName} · ${proposta.status === "generated" ? `Versão ${proposta.version}` : "Prévia do rascunho"}`} icon={<FileText />} size="larga" cancelText={voltar ? "Voltar à edição" : "Fechar"} onClose={aoFechar}
    footer={<><Button variant="secondary" icon={<Pencil />} onClick={aoEditar}>Editar proposta</Button><a className="button button--primary ui-button ui-button--md" href={`${caminhoPropostas(proposta.dealId)}/${proposta.id}/download`} download><Download size={16} aria-hidden="true" />{proposta.status === "generated" ? "Baixar PDF" : "Baixar prévia"}</a></>}>
    <div className={styles.viewerMeta}><span className={`${styles.status} ${proposta.status === "generated" ? styles.statusGerada : ""}`}>{proposta.status === "generated" ? "Gerada" : "Rascunho"}</span><span>{proposta.content.title}</span><strong>{formatarBRL(proposta.content.amount)}</strong></div>
    <PdfPreview key={`${proposta.id}-${proposta.revision}`} url={`${caminhoPropostas(proposta.dealId)}/${proposta.id}/preview`} nome={proposta.content.title} />
  </Dialog></div>, document.body);
}
