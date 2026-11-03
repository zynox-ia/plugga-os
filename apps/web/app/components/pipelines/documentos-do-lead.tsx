"use client";

import { LEAD_DOCUMENT_MAX_BYTES, leadDocumentAcceptedMimes, leadDocumentCategories, leadDocumentSchema, listLeadDocumentsResponseSchema, type LeadDocument, type LeadDocumentCategory } from "@plugga/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { enviar, lerErro } from "../../lib/clientes";
import { formatarData } from "../../lib/format";
import { Button } from "../ui/button";
import { CampoDoLead } from "./ficha-do-lead";
import styles from "./detalhes-do-lead-modal.module.css";

const CATEGORIAS: Record<LeadDocumentCategory, string> = { proposta: "Proposta", conta_de_energia: "Conta de energia", documento_do_cliente: "Documento do cliente", procuracao_contrato: "Procuração ou contrato", outros: "Outros" };
type Edicao = { id: string; nome: string; categoria: LeadDocumentCategory };

export function DocumentosDoLead({ id, ativo, aoRascunho, aoOcupar, aoAtualizar }: { id: string; ativo: boolean; aoRascunho: (alterado: boolean) => void; aoOcupar: (ocupado: boolean) => void; aoAtualizar: () => void }) {
  const [documentos, setDocumentos] = useState<LeadDocument[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [categoria, setCategoria] = useState<LeadDocumentCategory>("outros");
  const [filtro, setFiltro] = useState("");
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [arquivar, setArquivar] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { aoRascunho(!!arquivo || !!edicao); }, [arquivo, edicao, aoRascunho]);
  useEffect(() => { aoOcupar(ocupado); }, [ocupado, aoOcupar]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const resposta = await enviar<unknown>(`/api/leads/${id}/documentos`, "GET");
    setCarregando(false);
    if (!resposta.ok) { setErro(resposta.erro.mensagem); return; }
    const lista = listLeadDocumentsResponseSchema.safeParse(resposta.dados);
    if (!lista.success) { setErro("Não foi possível interpretar a lista de documentos."); return; }
    setDocumentos(lista.data.documents.filter((item) => !item.archivedAt));
    setCarregado(true);
  }, [id]);
  useEffect(() => { if (ativo && !carregado) void carregar(); }, [ativo, carregado, carregar]);

  function aplicar(documento: LeadDocument, mensagem: string) {
    setDocumentos((atuais) => documento.archivedAt ? atuais.filter((item) => item.id !== documento.id) : [documento, ...atuais.filter((item) => item.id !== documento.id)]);
    setSucesso(mensagem);
    aoAtualizar();
  }

  async function enviarArquivo() {
    if (!arquivo || ocupado) return;
    if (arquivo.size > LEAD_DOCUMENT_MAX_BYTES) { setErro("O arquivo deve ter até 25 MiB."); return; }
    setOcupado(true); setErro(null); setSucesso(null);
    try {
      const corpo = new FormData(); corpo.append("arquivo", arquivo); corpo.append("category", categoria);
      const resposta = await fetch(`/api/leads/${id}/documentos`, { method: "POST", body: corpo });
      const dados: unknown = await resposta.json();
      if (!resposta.ok) { setErro(lerErro(dados, "Não foi possível enviar o arquivo.").mensagem); return; }
      const documento = leadDocumentSchema.safeParse(dados);
      if (!documento.success) { setErro("Resposta incompleta. Atualize a lista para conferir se o arquivo foi enviado."); return; }
      aplicar(documento.data, "Documento enviado.");
      setArquivo(null); if (input.current) input.current.value = "";
    } catch { setErro("Sem conexão. O arquivo selecionado foi preservado; confira a lista antes de tentar novamente."); }
    finally { setOcupado(false); }
  }

  async function salvarDocumento() {
    if (!edicao || ocupado) return;
    if (!edicao.nome.trim()) { setErro("Informe o nome do documento."); return; }
    setOcupado(true); setErro(null); setSucesso(null);
    const resposta = await enviar<unknown>(`/api/leads/${id}/documentos/${edicao.id}`, "PATCH", { originalName: edicao.nome.trim(), category: edicao.categoria });
    setOcupado(false);
    if (!resposta.ok) { setErro(resposta.erro.mensagem); return; }
    const documento = leadDocumentSchema.safeParse(resposta.dados);
    if (!documento.success) { setErro("Resposta incompleta. Atualize a lista para conferir o documento."); return; }
    aplicar(documento.data, "Documento atualizado."); setEdicao(null);
  }

  async function confirmarArquivo(documento: LeadDocument) {
    if (ocupado) return;
    setOcupado(true); setErro(null); setSucesso(null);
    const resposta = await enviar<unknown>(`/api/leads/${id}/documentos/${documento.id}/arquivar`, "POST", {});
    setOcupado(false);
    if (!resposta.ok) { setErro(resposta.erro.mensagem); return; }
    const atualizado = leadDocumentSchema.safeParse(resposta.dados);
    if (!atualizado.success) { setErro("Resposta incompleta. Atualize a lista para conferir o arquivamento."); return; }
    aplicar(atualizado.data, "Documento arquivado."); setArquivar(null);
  }

  return <>
    <div className={styles.tituloSecao}><h3>Documentos do lead</h3><p>Envie, categorize e consulte os arquivos deste atendimento.</p></div>
    {erro ? <div role="alert" className="aviso aviso--erro">{erro} <Button size="sm" variant="secondary" onClick={() => void carregar()} disabled={ocupado || carregando}>Atualizar documentos</Button></div> : null}
    {sucesso ? <p role="status" className="aviso aviso--sucesso">{sucesso}</p> : null}
    <fieldset className={styles.painelCard} disabled={ocupado}>
      <legend>Enviar documento</legend>
      <CampoDoLead rotulo="Categoria do arquivo"><select className="ui-input" value={categoria} onChange={(e) => setCategoria(e.target.value as LeadDocumentCategory)}>{leadDocumentCategories.map((item) => <option key={item} value={item}>{CATEGORIAS[item]}</option>)}</select></CampoDoLead>
      <CampoDoLead rotulo="Arquivo"><input ref={input} type="file" accept={leadDocumentAcceptedMimes.join(",")} onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setErro(null); }} /></CampoDoLead>
      <p className={styles.cockpitCardSub}>PDF, JPG, PNG, DOCX e XLSX · até 25 MiB por arquivo.</p>
      <div className={styles.propostaAcoes}><Button size="sm" disabled={!arquivo || ocupado} onClick={() => void enviarArquivo()} loading={ocupado && !!arquivo}>Enviar documento</Button>{arquivo ? <Button size="sm" variant="secondary" onClick={() => { setArquivo(null); if (input.current) input.current.value = ""; }}>Limpar seleção</Button> : null}</div>
    </fieldset>
    <CampoDoLead rotulo="Filtrar documentos por categoria"><select className="ui-input" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todas as categorias</option>{leadDocumentCategories.map((item) => <option key={item} value={item}>{CATEGORIAS[item]}</option>)}</select></CampoDoLead>
    {carregando ? <p role="status">Carregando documentos…</p> : null}
    {carregado && !documentos.some((item) => !filtro || item.category === filtro) ? <p className={styles.cockpitCardSub}>Nenhum documento nesta seleção.</p> : null}
    <div className={styles.listaDocumentos}>{documentos.filter((item) => !filtro || item.category === filtro).map((documento) => <article className={styles.painelCard} aria-label={`Documento ${documento.originalName}`} key={documento.id}>
      {edicao?.id === documento.id ? <fieldset disabled={ocupado} className={styles.formularioSemBorda}>
        <CampoDoLead rotulo="Nome do documento"><input className="ui-input" value={edicao.nome} maxLength={200} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} /></CampoDoLead>
        <CampoDoLead rotulo="Categoria do documento"><select className="ui-input" value={edicao.categoria} onChange={(e) => setEdicao({ ...edicao, categoria: e.target.value as LeadDocumentCategory })}>{leadDocumentCategories.map((item) => <option key={item} value={item}>{CATEGORIAS[item]}</option>)}</select></CampoDoLead>
        <div className={styles.propostaAcoes}><Button size="sm" onClick={() => void salvarDocumento()}>Salvar documento</Button><Button size="sm" variant="secondary" onClick={() => setEdicao(null)}>Cancelar edição</Button></div>
      </fieldset> : <>
        <strong className={styles.nomeDocumento}>{documento.originalName}</strong>
        <span className={styles.cockpitCardSub}>{CATEGORIAS[documento.category]} · {(documento.sizeBytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KiB · {formatarData(documento.createdAt)} · {documento.uploadedBy?.name ?? "Autor não informado"}</span>
        <div className={styles.propostaAcoes}>
          <a className={styles.btnAcaoRapida} href={`/api/leads/${id}/documentos/${documento.id}/download`} download={documento.originalName}>Baixar</a>
          {documento.canPreview ? <a className={styles.btnAcaoRapida} href={`/api/leads/${id}/documentos/${documento.id}/preview`} target="_blank" rel="noopener noreferrer">Visualizar</a> : null}
          <button type="button" className={styles.btnAcaoRapida} disabled={ocupado || !!edicao} onClick={() => setEdicao({ id: documento.id, nome: documento.originalName, categoria: documento.category })}>Editar</button>
          <button type="button" className={styles.btnAcaoRapida} disabled={ocupado} onClick={() => setArquivar(documento.id)}>Arquivar</button>
        </div>
      </>}
      {arquivar === documento.id ? <div className={styles.confirmacaoInline}><p>Arquivar este documento? Ele sairá da lista ativa.</p><Button size="sm" variant="danger" disabled={ocupado} onClick={() => void confirmarArquivo(documento)}>Confirmar arquivamento</Button><Button size="sm" variant="secondary" disabled={ocupado} onClick={() => setArquivar(null)}>Cancelar arquivamento</Button></div> : null}
    </article>)}</div>
  </>;
}
