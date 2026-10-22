"use client";

import { useId } from "react";
import { DropdownMenu } from "./dropdown-menu";
import type { SelectOption } from "./combobox";

export function MultiSelect({ label, options, value, onChange, disabled = false }: {
  label: string; options: SelectOption[]; value: string[]; onChange: (value: string[]) => void; disabled?: boolean;
}) {
  const id = useId();
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  return <div className="ui-field" role="group" aria-labelledby={id}>
    <span className="ui-field-label" id={id}>{label}</span>
    <DropdownMenu label={`${label}: ${value.length} selecionados`} disabled={disabled}
      items={options.map((option) => ({ id: option.value, label: option.label, disabled: option.disabled,
        checked: value.includes(option.value), onSelect: () => toggle(option.value) }))} />
    <div className="ui-chip-list" aria-live="polite">
      {options.filter((option) => value.includes(option.value)).map((option) => <span className="ui-chip" key={option.value}>
        {option.label}<button type="button" disabled={disabled || option.disabled} aria-label={`Remover ${option.label}`} onClick={() => toggle(option.value)}>×</button>
      </span>)}
      {value.length === 0 && <span className="ui-field-hint">Nenhum item selecionado.</span>}
    </div>
  </div>;
}
