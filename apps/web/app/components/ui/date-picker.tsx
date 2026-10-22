"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDaysIcon } from "lucide-react";
import { Calendar } from "./shadcn/calendar";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./shadcn/popover";
import { dateInputError, dateValue, displayDate, maskDateInput, parseDate, parseDateInput } from "./date-value";

export function DatePicker({ label, value, defaultValue = "", onChange, name, min, max, disabled = false, readOnly = false, required = false, hint, error }: {
  label: string; value?: string; defaultValue?: string; onChange?: (value: string) => void; name?: string;
  min?: string; max?: string; disabled?: boolean; readOnly?: boolean; required?: boolean; hint?: string; error?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const current = value ?? internalValue;
  const [draft, setDraft] = useState(() => displayDate(current));
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const issue = dateInputError(draft, { min, max, required });
  const message = error || (touched ? issue : undefined);
  const parsed = parseDateInput(draft);
  const minDate = min ? parseDate(min) : undefined;
  const maxDate = max ? parseDate(max) : undefined;

  useEffect(() => { setDraft(displayDate(current)); setTouched(false); }, [current]);
  useEffect(() => { input.current?.setCustomValidity(error || issue || ""); }, [issue, error]);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => {
      if (value === undefined) setInternalValue(defaultValue);
      setDraft(displayDate(value ?? defaultValue)); setTouched(false); setOpen(false);
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [value, defaultValue]);

  const update = (next: string) => { setInternalValue(next); onChange?.(next); };
  const select = (date?: Date) => {
    const next = date ? dateValue(date) : "";
    update(next); setDraft(displayDate(next)); setTouched(false); setOpen(false);
  };
  const changeOpen = (next: boolean) => {
    if (next && (disabled || readOnly)) return;
    if (next) {
      let start = parsed ?? parseDate(current) ?? new Date();
      if (minDate && start < minDate) start = minDate;
      if (maxDate && start > maxDate) start = maxDate;
      setMonth(start);
      setContainer(trigger.current?.closest("dialog") ?? null);
    }
    setOpen(next);
  };
  const today = new Date();
  const todayDisabled = !!dateInputError(displayDate(dateValue(today)), { min, max });

  return <div className="ui-field">
    <label htmlFor={id}>{label}{required && <span className="ui-required"> (obrigatório)</span>}</label>
    <Popover open={open && !disabled && !readOnly} onOpenChange={changeOpen}>
      <PopoverAnchor asChild>
        <div className="ui-input-wrap ui-date-input-wrap">
          <input ref={input} id={id} className="ui-input" type="text" inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa" maxLength={10}
            value={draft} disabled={disabled} readOnly={readOnly} required={required} aria-invalid={message ? true : undefined}
            aria-describedby={`${id}-help`} onBlur={() => setTouched(true)}
            onInvalid={(event) => { event.preventDefault(); setTouched(true); input.current?.focus(); }}
            onChange={(event) => {
              const next = maskDateInput(event.target.value);
              setDraft(next); setTouched(false);
              if (!next) update("");
              else if (!dateInputError(next, { min, max })) update(dateValue(parseDateInput(next)!));
            }}
            onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); changeOpen(true); } }} />
          <PopoverTrigger asChild><button ref={trigger} type="button" className="ui-date-trigger" disabled={disabled || readOnly}
            aria-label={`Abrir calendário de ${label}`}><CalendarDaysIcon size={18} aria-hidden="true" /></button></PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent container={container} aria-label={`Calendário de ${label}`} className="ui-date-popover"
        onOpenAutoFocus={(event) => event.preventDefault()}>
        <Calendar mode="single" required selected={issue ? undefined : parsed} onSelect={select} month={month} onMonthChange={setMonth}
          startMonth={minDate} endMonth={maxDate} disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]} autoFocus />
        <div className="ui-calendar-footer"><button type="button" disabled={todayDisabled} onClick={() => select(today)}>Hoje</button><button type="button" onClick={() => select()}>Limpar</button></div>
        <p className="ui-calendar-help">Use as setas para navegar e Enter para selecionar.</p>
      </PopoverContent>
    </Popover>
    {name && <input type="hidden" name={name} disabled={disabled} value={parsed && !issue ? dateValue(parsed) : ""} />}
    <p id={`${id}-help`} className={message ? "ui-field-error" : "ui-field-hint"}>{message ? `Erro: ${message}` : hint ?? "Digite a data ou escolha no calendário."}</p>
  </div>;
}
