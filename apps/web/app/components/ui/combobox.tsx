"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";

export type SelectOption = { value: string; label: string; description?: string; disabled?: boolean };
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();

export function Combobox({ label, options, value, onChange, disabled = false, hint, error }: {
  label: string; options: SelectOption[]; value: string; onChange: (value: string) => void;
  disabled?: boolean; hint?: string; error?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => normalize(`${option.label} ${option.description ?? ""}`).includes(normalize(query)));
  const expanded = open && !disabled;

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => { setOpen(false); setQuery(""); setActive(-1); };
  const choose = (option: SelectOption) => { if (!option.disabled) { onChange(option.value); close(); } };

  return <div className="ui-field" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <label htmlFor={id}>{label}</label>
    <div className="ui-popover-root">
    <div className="ui-input-wrap">
      <input id={id} className="ui-input" role="combobox" autoComplete="off" disabled={disabled}
        aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined} aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 && filtered[active] ? `${id}-option-${active}` : undefined}
        aria-describedby={hint || error ? `${id}-help` : undefined} aria-invalid={error ? true : undefined}
        placeholder="Buscar e selecionar…" value={expanded ? query : selected?.label ?? ""}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onClick={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const indices = filtered.flatMap((option, index) => option.disabled ? [] : [index]);
            const current = indices.indexOf(active);
            const next = event.key === "ArrowDown" ? current + 1 : current < 0 ? indices.length - 1 : current - 1;
            setActive(indices[(next + indices.length) % indices.length] ?? -1);
          } else if (event.key === "Enter" && expanded) {
            event.preventDefault();
            const option = filtered[active];
            if (option) choose(option);
          } else if (event.key === "Escape" && expanded) {
            event.preventDefault(); event.stopPropagation(); close();
          } else if (event.key === "Tab") close();
        }} />
      <span aria-hidden="true" className="ui-input-adornment">⌄</span>
    </div>
    {expanded && <div className="ui-popover">
      <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label}>
        {filtered.map((option, index) => <li key={option.value} id={`${id}-option-${index}`} role="option"
          aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
          className={`ui-option ${index === active ? "ui-option--active" : ""}`}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
          <span>{option.label}{option.description && <small>{option.description}</small>}</span>
          {option.value === value && <CheckIcon className="ui-option-check" size={16} aria-hidden="true" />}
        </li>)}
      </ul>
      {filtered.length === 0 && <p className="ui-popover-empty" role="status">Nenhuma opção encontrada.</p>}
    </div>}
    </div>
    {(hint || error) && <p id={`${id}-help`} className={error ? "ui-field-error" : "ui-field-hint"}>{error ? `Erro: ${error}` : hint}</p>}
  </div>;
}
