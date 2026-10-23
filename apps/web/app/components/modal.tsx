"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Modal sobre o `<dialog>` nativo: o navegador prende o foco dentro, fecha com
 * Esc e escurece o fundo. Clicar fora do conteúdo também fecha.
 */
export function Modal({
  rotulo,
  aoFechar,
  largura = "media",
  className = "",
  children,
}: {
  /** Nome acessível do diálogo (normalmente o título visível). */
  rotulo: string;
  aoFechar: () => void;
  largura?: "estreita" | "media" | "larga";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialogo = ref.current;
    const focoAnterior = document.activeElement;
    if (dialogo && !dialogo.open) dialogo.showModal();
    return () => {
      dialogo?.close();
      if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) focoAnterior.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal modal--${largura} ${className}`}
      aria-label={rotulo}
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
      onKeyDown={(evento) => {
        if (evento.key !== "Tab") return;
        const focaveis = Array.from(evento.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        )).filter((elemento) => elemento.getClientRects().length > 0);
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (!primeiro) { evento.preventDefault(); return; }
        if (evento.shiftKey && document.activeElement === primeiro) {
          evento.preventDefault(); ultimo?.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
          evento.preventDefault(); primeiro.focus();
        }
      }}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div className="modal-conteudo">{children}</div>
    </dialog>
  );
}
