"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

import styles from "./cartoes.module.css";

/**
 * Campo de senha no padrão dos campos do sistema (`ui-field`), com o botão de mostrar/ocultar.
 * Fica fora do `TextField` porque ele não aceita um controle dentro do campo.
 */
export function CampoDeSenha({
  label,
  hint,
  error,
  extra,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  hint?: string;
  error?: string | undefined;
  /** Conteúdo entre o campo e a dica (ex.: medidor de tamanho). */
  extra?: ReactNode;
}) {
  const id = useId();
  const [visivel, setVisivel] = useState(false);
  const ajudaId = `${id}-help`;

  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      <div className="ui-input-wrap">
        <input
          {...props}
          id={id}
          type={visivel ? "text" : "password"}
          className="ui-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? ajudaId : undefined}
        />
        <button
          type="button"
          className={styles.olho}
          aria-pressed={visivel}
          aria-label={visivel ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          onClick={() => setVisivel((valor) => !valor)}
        >
          {visivel ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {extra}
      {(error || hint) && (
        <p id={ajudaId} className={error ? "ui-field-error" : "ui-field-hint"}>
          {error ? `Erro: ${error}` : hint}
        </p>
      )}
    </div>
  );
}
