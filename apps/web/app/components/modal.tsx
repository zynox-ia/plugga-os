"use client";

import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from "react";

import { entrarModal, movimentoReduzido, sairModal } from "../lib/movimento";

const FecharDoModal = createContext<() => void>(() => {});

/**
 * Fechar com a saída animada, para botões dentro do modal (o "×", o
 * "Cancelar"): `<FecharModal>{(fechar) => <button onClick={fechar}>…}</FecharModal>`.
 */
export function FecharModal({ children }: { children: (fechar: () => void) => ReactNode }) {
  return <>{children(useContext(FecharDoModal))}</>;
}

/**
 * Modal sobre o `<dialog>` nativo: o navegador prende o foco dentro, fecha com
 * Esc e escurece o fundo. Clicar fora do conteúdo também fecha.
 *
 * Movimento (PLU-325): entra com escala a partir do elemento que o abriu e as
 * partes internas em cascata. A saída curta toca quando o fechamento passa
 * por aqui (Esc, clique fora, `FecharModal`) e só então chama `aoFechar`.
 * Limitação: quando o pai fecha por conta própria (depois de salvar, por
 * exemplo) o React remove o `<dialog>` no mesmo commit e não há saída.
 * `saidaAnimada={false}` serve para quem pode recusar o fechamento (rascunho
 * a confirmar, envio em curso): aí `aoFechar` é chamado direto.
 */
export function Modal({
  rotulo,
  aoFechar,
  largura = "media",
  className = "",
  saidaAnimada = true,
  children,
}: {
  /** Nome acessível do diálogo (normalmente o título visível). */
  rotulo: string;
  aoFechar: () => void;
  largura?: "estreita" | "media" | "larga";
  className?: string;
  saidaAnimada?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const saindo = useRef(false);

  useLayoutEffect(() => {
    const dialogo = ref.current;
    const focoAnterior = document.activeElement;
    if (dialogo && !dialogo.open) dialogo.showModal();
    const desfazerEntrada = dialogo ? entrarModal(dialogo, focoAnterior) : null;
    return () => {
      desfazerEntrada?.();
      dialogo?.close();
      if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) focoAnterior.focus({ preventScroll: true });
    };
  }, []);

  function fechar() {
    const dialogo = ref.current;
    if (saindo.current) return;
    if (!dialogo || !saidaAnimada || movimentoReduzido()) {
      aoFechar();
      return;
    }
    saindo.current = true;
    sairModal(dialogo, aoFechar, () => { saindo.current = false; });
  }

  return (
    <dialog
      ref={ref}
      className={`modal modal--${largura} ${className}`}
      aria-label={rotulo}
      onCancel={(evento) => {
        if (evento.target !== evento.currentTarget) return;
        evento.preventDefault();
        fechar();
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
        if (evento.target === evento.currentTarget) fechar();
      }}
    >
      <FecharDoModal.Provider value={fechar}>
        <div className="modal-conteudo">{children}</div>
      </FecharDoModal.Provider>
    </dialog>
  );
}
