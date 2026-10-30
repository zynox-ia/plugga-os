"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

type FieldProps = { label: string; hint?: string; error?: string };
type FieldFrameProps = FieldProps & { id: string; required?: boolean; children: ReactNode };

function FieldFrame({ label, hint, error, id, required, children }: FieldFrameProps) {
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}{required && <span className="ui-required"> (obrigatório)</span>}</label>
      {children}
      {(error || hint) && <p id={`${id}-help`} className={error ? "ui-field-error" : "ui-field-hint"}>
        {error ? `Erro: ${error}` : hint}
      </p>}
    </div>
  );
}

function useField({ id, hint, error, describedBy }: { id?: string; hint?: string; error?: string; describedBy?: string }) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return {
    id: fieldId,
    "aria-describedby": [describedBy, (hint || error) && `${fieldId}-help`].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? true as const : undefined,
  };
}

export function TextField({ label, hint, error, id, className = "", prefix, suffix, ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement> & { prefix?: string; suffix?: string }) {
  const field = useField({ id, hint, error, describedBy: props["aria-describedby"] });
  return <FieldFrame {...{ label, hint, error }} id={field.id} required={props.required}>
    <div className={`ui-input-wrap ${className}`}>
      {prefix && <span className="ui-input-adornment" aria-hidden="true">{prefix}</span>}
      <input {...props} {...field} className="ui-input" />
      {suffix && <span className="ui-input-adornment" aria-hidden="true">{suffix}</span>}
    </div>
  </FieldFrame>;
}

export function TextareaField({ label, hint, error, id, className = "", ...props }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useField({ id, hint, error, describedBy: props["aria-describedby"] });
  return <FieldFrame {...{ label, hint, error }} id={field.id} required={props.required}>
    <textarea rows={3} {...props} {...field} className={`ui-input ui-textarea ${className}`} />
  </FieldFrame>;
}
