"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Modal sobre o `<dialog>` nativo: o navegador prende o foco dentro, fecha com
 * Esc e escurece o fundo. Clicar fora do conteúdo também fecha.
 */
export function Modal({
  rotulo,
  aoFechar,
  largura = "media",
  children,
}: {
  /** Nome acessível do diálogo (normalmente o título visível). */
  rotulo: string;
  aoFechar: () => void;
  largura?: "estreita" | "media" | "larga";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
    return () => dialogo?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal modal--${largura}`}
      aria-label={rotulo}
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div className="modal-conteudo">{children}</div>
    </dialog>
  );
}
