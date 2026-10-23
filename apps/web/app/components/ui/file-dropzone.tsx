"use client";

import { useId, useRef, useState } from "react";
import { FileIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "./button";

export function FileDropzone({ label, value, onChange, disabled = false }: {
  label: string; value: File[]; onChange: (files: File[]) => void; disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const add = (files: File[]) => {
    const next = [...value];
    for (const file of files) {
      if (!next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file);
    }
    onChange(next);
  };
  return <div className="ui-field">
    <label htmlFor={id}>{label}</label>
    <input ref={input} id={id} hidden type="file" multiple disabled={disabled}
      onChange={(event) => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <div className="ui-file-dropzone" data-dragging={dragging && !disabled} aria-disabled={disabled || undefined}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; }}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled) add(Array.from(event.dataTransfer.files)); }}>
      <UploadIcon size={24} aria-hidden="true" />
      <p>Arraste seus arquivos aqui</p>
      <span className="ui-field-hint">ou selecione no dispositivo</span>
      <Button variant="secondary" size="sm" icon={<UploadIcon />} disabled={disabled} onClick={() => input.current?.click()}>Selecionar arquivos</Button>
    </div>
    <span className="ui-field-hint" role="status">{value.length === 0 ? "Nenhum arquivo selecionado." : value.length === 1 ? "1 arquivo selecionado." : `${value.length} arquivos selecionados.`}</span>
    {value.length > 0 && <ul className="ui-file-list">{value.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`}>
      <FileIcon size={18} aria-hidden="true" /><span><strong>{file.name}</strong><small>{file.size < 1024 ? `${file.size} B` : `${Math.ceil(file.size / 1024)} KB`}</small></span>
      <Button icon={<XIcon />} iconOnly size="sm" variant="secondary" disabled={disabled} aria-label={`Remover ${file.name}`} onClick={() => onChange(value.filter((_, current) => current !== index))} />
    </li>)}</ul>}
  </div>;
}
