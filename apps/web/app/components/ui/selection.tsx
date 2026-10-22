"use client";

import { useEffect, useId, useRef, type InputHTMLAttributes } from "react";

type SelectionProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; description?: string };

export function Checkbox({ label, description, indeterminate = false, id, className = "", ...props }: SelectionProps & { indeterminate?: boolean }) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <label className={`ui-choice ${className}`} htmlFor={fieldId}>
    <input {...props} id={fieldId} ref={ref} type="checkbox" aria-labelledby={`${fieldId}-label`} aria-describedby={description ? `${fieldId}-description` : props["aria-describedby"]} />
    <span><span id={`${fieldId}-label`}>{label}</span>{description && <small id={`${fieldId}-description`}>{description}</small>}</span>
  </label>;
}

export function Radio({ label, description, id, className = "", ...props }: SelectionProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return <label className={`ui-choice ${className}`} htmlFor={fieldId}>
    <input {...props} type="radio" id={fieldId} aria-labelledby={`${fieldId}-label`} aria-describedby={description ? `${fieldId}-description` : props["aria-describedby"]} />
    <span><span id={`${fieldId}-label`}>{label}</span>{description && <small id={`${fieldId}-description`}>{description}</small>}</span>
  </label>;
}

export function Switch({ label, description, id, className = "", ...props }: SelectionProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return <label className={`ui-choice ui-switch ${className}`} htmlFor={fieldId}>
    <input {...props} id={fieldId} type="checkbox" role="switch" aria-labelledby={`${fieldId}-label`} aria-describedby={description ? `${fieldId}-description` : props["aria-describedby"]} />
    <span><span id={`${fieldId}-label`}>{label}</span>{description && <small id={`${fieldId}-description`}>{description}</small>}</span>
  </label>;
}
