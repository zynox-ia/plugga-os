"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText, Plus, Upload, X } from "lucide-react";
import { type LeadDocument, type LeadDocumentCategory } from "@plugga/shared";
import { enviarDocumentoDoLead, FORMATOS_DOCUMENTO, tamanhoDocumento, validarArquivoDocumento } from "../../lib/documentos-lead";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Select, SelectContent, SelectTrigger, SelectValue } from "../ui/shadcn/select";
import { OpcoesCategoriasDocumentos } from "./opcoes-categorias-documentos";
import styles from "./documentos-do-lead.module.css";

type Item = { id: string; arquivo: File; estado: "pronto" | "enviando" | "enviado" | "erro"; erro?: string };
const item = (arquivo: File): Item => ({ id: crypto.randomUUID(), arquivo, estado: validarArquivoDocumento(arquivo) ? "erro" : "pronto", erro: validarArquivoDocumento(arquivo) ?? undefined });

export function EnvioDocumentosModal({ leadId, arquivos, aoFechar, aoEnviar, aoRascunho, aoOcupar }: {
  leadId: string; arquivos: File[]; aoFechar: () => void; aoEnviar: (documento: LeadDocument) => void;
  aoRascunho: (valor: boolean) => void; aoOcupar: (valor: boolean) => void;
}) {
  const [fila, setFila] = useState<Item[]>(() => arquivos.map(item));
  const [categoria, setCategoria] = useState<LeadDocumentCategory>("outros");
  const [enviando, setEnviando] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const emEnvio = useRef(false);
  useEffect(() => { aoRascunho(fila.some((arquivo) => arquivo.estado !== "enviado")); }, [fila, aoRascunho]);
  useEffect(() => { aoOcupar(enviando); }, [enviando, aoOcupar]);
  useEffect(() => () => { aoRascunho(false); aoOcupar(false); }, [aoRascunho, aoOcupar]);
  const pendentes = fila.filter((arquivo) => arquivo.estado !== "enviado" && !validarArquivoDocumento(arquivo.arquivo));
  async function enviar() {
    if (emEnvio.current || !pendentes.length) return;
    emEnvio.current = true; setEnviando(true); let falhou = false;
    for (const arquivo of pendentes) {
      setFila((atuais) => atuais.map((atual) => atual.id === arquivo.id ? { ...atual, estado: "enviando", erro: undefined } : atual));
      try {
        const documento = await enviarDocumentoDoLead(leadId, arquivo.arquivo, categoria);
        aoEnviar(documento);
        setFila((atuais) => atuais.map((atual) => atual.id === arquivo.id ? { ...atual, estado: "enviado" } : atual));
      } catch (erro) {
        falhou = true;
        setFila((atuais) => atuais.map((atual) => atual.id === arquivo.id ? { ...atual, estado: "erro", erro: (erro as Error).message } : atual));
      }
    }
    emEnvio.current = false; setEnviando(false);
    if (!falhou && !fila.some((arquivo) => validarArquivoDocumento(arquivo.arquivo))) aoFechar();
  }
  return <div className={styles.escopoEnvio}><Dialog title="Enviar documentos" description="Confira os arquivos antes de adicionar ao lead." icon={<Upload />} onClose={() => { if (!emEnvio.current) aoFechar(); }}
    footer={<Button icon={<Upload />} loading={enviando} disabled={!pendentes.length} onClick={() => void enviar()}>Enviar {pendentes.length === 1 ? "documento" : `${pendentes.length} documentos`}</Button>}>
    <div className="ui-dialog-form">
      <div className="ui-field" ref={(elemento) => { if (elemento && elemento !== container) setContainer(elemento); }}>
        <label id="categoria-envio-label" htmlFor="categoria-envio">Categoria dos documentos</label>
        <Select value={categoria} onValueChange={(valor) => setCategoria(valor as LeadDocumentCategory)} disabled={enviando}><SelectTrigger id="categoria-envio" aria-labelledby="categoria-envio-label"><SelectValue /></SelectTrigger><SelectContent container={container} className={styles.menuCategorias}><OpcoesCategoriasDocumentos /></SelectContent></Select>
      </div>
      <div className={styles.fila}>{fila.map((arquivo) => <div key={arquivo.id} className={styles.itemFila}><span className={styles.iconeArquivo}><FileText size={21} aria-hidden="true" /></span><div><strong>{arquivo.arquivo.name}</strong><small>{tamanhoDocumento(arquivo.arquivo.size)} · {arquivo.estado === "enviando" ? "Enviando…" : arquivo.estado === "enviado" ? "Enviado" : "Pronto para enviar"}</small>{arquivo.erro ? <p role="alert" className="ui-field-error">{arquivo.erro}</p> : null}</div>{arquivo.estado === "enviado" ? <Check size={17} aria-label="Enviado" /> : <Button variant="secondary" size="sm" icon={<X />} iconOnly aria-label={`Remover ${arquivo.arquivo.name}`} disabled={enviando} onClick={() => setFila((atuais) => atuais.filter((atual) => atual.id !== arquivo.id))} />}</div>)}</div>
      <input ref={input} hidden type="file" multiple accept={FORMATOS_DOCUMENTO} onChange={(evento) => { const selecionados = Array.from(evento.target.files ?? []); setFila((atuais) => [...atuais, ...selecionados.map(item)]); evento.target.value = ""; }} />
      <button type="button" className={styles.adicionar} disabled={enviando} onClick={() => input.current?.click()}><Plus size={16} aria-hidden="true" />Adicionar mais arquivos</button>
      <p className={styles.ajuda}>PDF, JPG, PNG, DOCX e XLSX. Até 25 MB por arquivo.</p>
    </div>
  </Dialog></div>;
}
