"use client";

import { useState, type ReactNode } from "react";

export function CopyButton({ value, label, children, className = "" }: { value: string; label: string; children: ReactNode; className?: string }) {
  const [message, setMessage] = useState("");
  return <button type="button" className={`ds-copy-button ${className}`} aria-label={`Copiar ${label}`} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setMessage("Copiado"); }
    catch { setMessage("Não foi possível copiar. Selecione o valor manualmente."); }
  }}>{children}<span className="ds-copy-status" role="status">{message || "Copiar"}</span></button>;
}
