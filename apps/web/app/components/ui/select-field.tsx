"use client";

import { useId, useRef, useState } from "react";
import type { SelectOption } from "./combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select";

export function SelectField({ label, options, value, defaultValue, onChange, name, id, disabled, required, hint, error, placeholder = "Selecione uma opção" }: {
  label: string; options: readonly SelectOption[]; value?: string; defaultValue?: string;
  onChange?: (value: string) => void; name?: string; id?: string; disabled?: boolean; required?: boolean;
  hint?: string; error?: string; placeholder?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return <div className="ui-field">
    <label id={`${fieldId}-label`} htmlFor={fieldId}>{label}{required && <span className="ui-required"> (obrigatório)</span>}</label>
    <Select value={value} defaultValue={defaultValue} onValueChange={onChange} name={name} disabled={disabled} required={required}
      onOpenChange={(open) => { if (open) setContainer(trigger.current?.closest("dialog") ?? null); }}>
      <SelectTrigger ref={trigger} id={fieldId} aria-labelledby={`${fieldId}-label`}
        aria-invalid={error ? true : undefined} aria-describedby={hint || error ? `${fieldId}-help` : undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent container={container} aria-labelledby={`${fieldId}-label`}>
        {options.map((option) => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}
        {options.length === 0 && <p className="ui-popover-empty">Nenhuma opção disponível.</p>}
      </SelectContent>
    </Select>
    {(hint || error) && <p id={`${fieldId}-help`} className={error ? "ui-field-error" : "ui-field-hint"}>{error ? `Erro: ${error}` : hint}</p>}
  </div>;
}
