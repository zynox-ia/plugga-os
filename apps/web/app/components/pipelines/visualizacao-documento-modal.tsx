"use client";

import { useState } from "react";
import type { LeadDocument } from "@plugga/shared";
import { Download, FileText, Pencil } from "lucide-react";
import { CATEGORIAS_DOCUMENTOS, tamanhoDocumento } from "../../lib/documentos-lead";
import { formatarData } from "../../lib/format";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { PdfPreview } from "../ui/pdf-preview";
import styles from "./documentos-do-lead.module.css";

export function VisualizacaoDocumentoModal({ documento, leadId, aoFechar, aoEditar }: { documento: LeadDocument; leadId: string; aoFechar: () => void; aoEditar: () => void }) {
  const [erroImagem, setErroImagem] = useState(false);
  const base = `/api/leads/${leadId}/documentos/${documento.id}`;
  return <div className={styles.escopoVisualizacao}><Dialog title="Visualizar documento" description={documento.originalName} icon={<FileText />} size="larga" cancelText="Fechar" onClose={aoFechar}
    footer={<><Button variant="secondary" icon={<Pencil />} onClick={aoEditar}>Editar</Button><a className="button button--primary ui-button ui-button--md" href={`${base}/download`} download={documento.originalName}><Download size={16} aria-hidden="true" />Baixar documento</a></>}>
    <div className={styles.metaVisualizacao}><span className={styles.categoria}>{CATEGORIAS_DOCUMENTOS[documento.category]}</span><span>{tamanhoDocumento(documento.sizeBytes)} · {formatarData(documento.createdAt)}</span></div>
    {!documento.canPreview ? <div className={styles.vazio}>Este formato está disponível para download.</div> : documento.detectedMime === "application/pdf" ? <PdfPreview url={`${base}/preview`} nome={documento.originalName} /> : <div className={styles.imagem}>{erroImagem ? <p role="alert">Não foi possível visualizar a imagem. Baixe o documento para abri-lo.</p> : <img src={`${base}/preview`} alt={documento.originalName} onError={() => setErroImagem(true)} />}</div>}
  </Dialog></div>;
}
