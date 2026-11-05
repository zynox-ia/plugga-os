"use client";

import { leadDocumentSchema, listLeadDocumentsResponseSchema, type LeadDocument, type LeadDocumentCategory } from "@plugga/shared";
import { Check, Download, Eye, FileImage, FileText, Files, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { enviar } from "../../lib/clientes";
import { CATEGORIAS_DOCUMENTOS, FORMATOS_DOCUMENTO, tamanhoDocumento } from "../../lib/documentos-lead";
import { formatarData } from "../../lib/format";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { TextField } from "../ui/fields";
import { OptionLabel } from "../ui/select-option";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/select";
import { EnvioDocumentosModal } from "./envio-documentos-modal";
import { OpcoesCategoriasDocumentos } from "./opcoes-categorias-documentos";
import { VisualizacaoDocumentoModal } from "./visualizacao-documento-modal";
import styles from "./documentos-do-lead.module.css";

type Edicao = { id: string; nome: string; categoria: LeadDocumentCategory };
export function DocumentosDoLead({ id, ativo, aoRascunho, aoOcupar, aoAtualizar }: {
  id: string; ativo: boolean; aoRascunho: (valor: boolean) => void; aoOcupar: (valor: boolean) => void; aoAtualizar: () => void;
}) {
  const [documentos, setDocumentos] = useState<LeadDocument[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("todos");
  const [arquivos, setArquivos] = useState<File[] | null>(null);
  const [filaSuja, setFilaSuja] = useState(false);
  const [visualizando, setVisualizando] = useState<LeadDocument | null>(null);
  const [excluindo, setExcluindo] = useState<LeadDocument | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [focarEnvio, setFocarEnvio] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const arrastos = useRef(0);
  const emOperacao = useRef(false);
  useEffect(() => { aoRascunho(filaSuja || !!edicao); }, [filaSuja, edicao, aoRascunho]);
  useEffect(() => { aoOcupar(ocupado); }, [ocupado, aoOcupar]);
  useEffect(() => { if (ativo) setPortal(raiz.current?.closest("dialog") ?? null); }, [ativo]);
  useEffect(() => { if (focarEnvio && !excluindo) { raiz.current?.querySelector<HTMLButtonElement>("header button")?.focus({ preventScroll: true }); setFocarEnvio(false); } }, [focarEnvio, excluindo]);

  const carregar = useCallback(async (signal?: AbortSignal) => {
    setCarregando(true); setErro(null);
    const resposta = await enviar<unknown>(`/api/leads/${id}/documentos`, "GET");
    if (signal?.aborted) return;
    setCarregando(false);
    if (!resposta.ok) { setErro(resposta.erro.mensagem); return; }
    const lista = listLeadDocumentsResponseSchema.safeParse(resposta.dados);
    if (!lista.success || lista.data.documents.some((item) => item.dealId !== id)) { setErro("Não foi possível interpretar a lista de documentos."); return; }
    setDocumentos(lista.data.documents.filter((item) => !item.archivedAt)); setCarregado(true);
  }, [id]);
  useEffect(() => {
    if (!ativo || carregado) return;
    const controller = new AbortController(); void carregar(controller.signal);
    return () => controller.abort();
  }, [ativo, carregado, carregar]);
  function aplicar(documento: LeadDocument, mensagem: string) {
    setDocumentos((atuais) => documento.archivedAt ? atuais.filter((item) => item.id !== documento.id) : [documento, ...atuais.filter((item) => item.id !== documento.id)]);
    setSucesso(mensagem); aoAtualizar();
  }
  function selecionar(selecionados: File[]) { if (selecionados.length && !ocupado && !edicao) { setSucesso(null); setArquivos(selecionados); } }
  async function salvarDocumento() {
    if (!edicao || emOperacao.current || !edicao.nome.trim()) return;
    emOperacao.current = true; setOcupado(true); setErro(null);
    const resposta = await enviar<unknown>(`/api/leads/${id}/documentos/${edicao.id}`, "PATCH", { originalName: edicao.nome.trim(), category: edicao.categoria });
    emOperacao.current = false; setOcupado(false);
    if (!resposta.ok) { setErro(resposta.erro.mensagem); return; }
    const resultado = leadDocumentSchema.safeParse(resposta.dados);
    if (!resultado.success) { setErro("Resposta incompleta. Atualize a lista para conferir o documento."); return; }
    aplicar(resultado.data, "Documento atualizado."); setEdicao(null);
  }
  async function excluirDocumento() {
    if (!excluindo || emOperacao.current) return;
    emOperacao.current = true; setOcupado(true); setErroExclusao(null);
    const resposta = await enviar<unknown>(`/api/leads/${id}/documentos/${excluindo.id}/arquivar`, "POST", {});
    emOperacao.current = false; setOcupado(false);
    if (!resposta.ok) { setErroExclusao(resposta.erro.mensagem); return; }
    const resultado = leadDocumentSchema.safeParse(resposta.dados);
    if (!resultado.success || !resultado.data.archivedAt || resultado.data.id !== excluindo.id) { setErroExclusao("Não foi possível confirmar o arquivamento. Atualize a lista para conferir o documento."); return; }
    aplicar(resultado.data, "Documento arquivado."); setExcluindo(null); setFocarEnvio(true);
  }
  const visiveis = documentos.filter((item) => filtro === "todos" || item.category === filtro);
  return <div ref={raiz} className={styles.documentos}>
    <input ref={input} hidden type="file" multiple accept={FORMATOS_DOCUMENTO} onChange={(evento) => { selecionar(Array.from(evento.target.files ?? [])); evento.target.value = ""; }} />
    <header className={styles.barra}><div><h3>Documentos do lead {carregado ? <span>{documentos.length}</span> : null}</h3><p>Todos os arquivos deste atendimento, no mesmo lugar.</p></div><Button size="sm" icon={<Upload />} disabled={ocupado || !!edicao} onClick={() => input.current?.click()}>Enviar documentos</Button></header>
    <div className={`${styles.areaEnvio} ${arrastando ? styles.areaAtiva : ""}`} data-dropzone="documentos"
      onDragEnter={(evento) => { evento.preventDefault(); if (!ocupado && !edicao) { arrastos.current++; setArrastando(true); } }}
      onDragOver={(evento) => { evento.preventDefault(); evento.dataTransfer.dropEffect = ocupado || edicao ? "none" : "copy"; }}
      onDragLeave={(evento) => { evento.preventDefault(); arrastos.current = Math.max(0, arrastos.current - 1); if (!arrastos.current) setArrastando(false); }}
      onDrop={(evento) => { evento.preventDefault(); arrastos.current = 0; setArrastando(false); selecionar(Array.from(evento.dataTransfer.files)); }}>
      <span className={styles.iconeEnvio}><Upload size={22} aria-hidden="true" /></span><div><strong>{arrastando ? "Solte os arquivos aqui" : "Arraste seus documentos para cá"}</strong><p>PDF, imagens, DOCX e XLSX · até 25 MB por arquivo</p></div><Button variant="secondary" size="sm" disabled={ocupado || !!edicao} onClick={() => input.current?.click()}>Selecionar arquivos</Button>
    </div>
    {erro ? <div role="alert" className="aviso aviso--erro">{erro} <Button size="sm" variant="secondary" disabled={ocupado || carregando} onClick={() => void carregar()}>Atualizar documentos</Button></div> : null}
    {sucesso ? <p role="status" className={styles.sucesso}><Check size={15} aria-hidden="true" />{sucesso}</p> : null}
    <div className={styles.cabecalhoLista}>
      <span>{filtro === "todos" ? "Todos os documentos" : CATEGORIAS_DOCUMENTOS[filtro as LeadDocumentCategory]}</span>
      <Select value={filtro} onValueChange={setFiltro}>
        <SelectTrigger aria-label="Filtrar documentos" className={styles.filtro}><SelectValue /></SelectTrigger>
        <SelectContent container={portal} className={styles.menuCategorias}>
          <SelectItem value="todos"><OptionLabel option={{ label: "Todas as categorias", icon: <Files /> }} /></SelectItem>
          <OpcoesCategoriasDocumentos />
        </SelectContent>
      </Select>
    </div>
    {carregado && !visiveis.length ? <p className={styles.vazio}>Nenhum documento nesta categoria.</p> : null}
    <div className={styles.lista}>{visiveis.map((documento) => <article className={styles.linha} key={documento.id} aria-label={`Documento ${documento.originalName}`}>
      {edicao?.id === documento.id ? <fieldset className={styles.editor} disabled={ocupado}>
        <TextField label="Nome do documento" value={edicao.nome} maxLength={200} required onChange={(evento) => setEdicao({ ...edicao, nome: evento.target.value })} />
        <div className="ui-field"><label id="categoria-edicao-label" htmlFor="categoria-edicao">Categoria do documento</label><Select value={edicao.categoria} onValueChange={(valor) => setEdicao({ ...edicao, categoria: valor as LeadDocumentCategory })}><SelectTrigger id="categoria-edicao" aria-labelledby="categoria-edicao-label"><SelectValue /></SelectTrigger><SelectContent container={portal} className={styles.menuCategorias}><OpcoesCategoriasDocumentos /></SelectContent></Select></div>
        <div className={styles.acoesEditor}><Button variant="secondary" size="sm" onClick={() => setEdicao(null)}>Cancelar edição</Button><Button size="sm" loading={ocupado} disabled={!edicao.nome.trim()} onClick={() => void salvarDocumento()}>Salvar documento</Button></div>
      </fieldset> : <>
        <span className={styles.iconeArquivo}>{documento.detectedMime.startsWith("image/") ? <FileImage size={22} aria-hidden="true" /> : <FileText size={22} aria-hidden="true" />}</span>
        <div className={styles.dadosArquivo}><button type="button" className={styles.nomeArquivo} onClick={() => setVisualizando(documento)}>{documento.originalName}</button><div className={styles.metaArquivo}><span className={styles.categoria}>{CATEGORIAS_DOCUMENTOS[documento.category]}</span><span>{tamanhoDocumento(documento.sizeBytes)} · {formatarData(documento.createdAt)}</span></div></div>
        <div className={styles.acoes}><Button variant="secondary" size="sm" icon={<Eye />} iconOnly aria-label={`Visualizar ${documento.originalName}`} disabled={ocupado || !!edicao} onClick={() => setVisualizando(documento)} /><Button variant="secondary" size="sm" className={styles.excluir} icon={<Trash2 />} iconOnly aria-label={`Arquivar ${documento.originalName}`} disabled={ocupado || !!edicao} onClick={() => { setErroExclusao(null); setExcluindo(documento); }} /><a className={styles.baixar} href={`/api/leads/${id}/documentos/${documento.id}/download`} download={documento.originalName} aria-label={`Baixar ${documento.originalName}`}><Download size={16} aria-hidden="true" /></a></div>
      </>}
    </article>)}</div>
    {arquivos ? createPortal(<EnvioDocumentosModal leadId={id} arquivos={arquivos} aoFechar={() => setArquivos(null)} aoEnviar={(documento) => aplicar(documento, "Documento enviado.")} aoRascunho={setFilaSuja} aoOcupar={setOcupado} />, document.body) : null}
    {visualizando ? createPortal(<VisualizacaoDocumentoModal key={visualizando.id} leadId={id} documento={visualizando} aoFechar={() => setVisualizando(null)} aoEditar={() => { setEdicao({ id: visualizando.id, nome: visualizando.originalName, categoria: visualizando.category }); setVisualizando(null); }} />, document.body) : null}
    {excluindo ? createPortal(<Dialog title="Arquivar documento?" description="O documento sairá da lista ativa deste lead." icon={<Trash2 />} variant="danger" size="estreita" cancelAutoFocus onClose={() => { if (!emOperacao.current) setExcluindo(null); }} footer={<Button variant="danger" icon={<Trash2 />} loading={ocupado} onClick={() => void excluirDocumento()}>Arquivar documento</Button>}><p className={styles.confirmacaoExclusao}>Ao arquivar <strong>“{excluindo.originalName}”</strong>, ele será removido da lista ativa. O arquivo e seu histórico serão preservados.</p>{erroExclusao ? <p role="alert" className="ui-field-error">{erroExclusao}</p> : null}</Dialog>, document.body) : null}
  </div>;
}
