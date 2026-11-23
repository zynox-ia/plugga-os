"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDaysIcon } from "lucide-react";
import { Calendar } from "./shadcn/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./shadcn/popover";
import { dateInputError, dateValue, displayDate, maskDateInput, parseDate, parseDateInput, valorDigitado } from "./date-value";

/**
 * Para envios fora de um <form> (botão com onClick): procura em `raiz` um DatePicker
 * com data digitada que não vale (incompleta, inexistente ou fora do min/max). Se
 * achar, o campo mostra o erro e ganha o foco, e a função responde true para o
 * envio parar. Campo vazio fica com a validação de quem chama (required).
 * Dentro de um <form>, o próprio DatePicker já segura o submit.
 */
export function dataInvalidaEm(raiz: ParentNode | null | undefined): boolean {
  const campo = [...(raiz?.querySelectorAll<HTMLInputElement>(".ui-date-input-wrap input") ?? [])]
    .find((input) => !input.disabled && !input.readOnly && input.value !== "" && !input.checkValidity());
  if (!campo) return false;
  campo.focus();
  return true;
}

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
  // Último valor avisado ao formulário: quando o value volta com ele, o texto digitado
  // fica como está (um "" por data inválida não apaga o que a pessoa está digitando).
  const emitido = useRef<string | undefined>(undefined);
  const issue = dateInputError(draft, { min, max, required });
  const message = error || (touched ? issue : undefined);
  const parsed = parseDateInput(draft);
  const minDate = min ? parseDate(min) : undefined;
  const maxDate = max ? parseDate(max) : undefined;

  useEffect(() => {
    if (current === emitido.current) return;
    emitido.current = undefined;
    setDraft(displayDate(current)); setTouched(false);
  }, [current]);
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
  // Data digitada inválida segura o envio do formulário, inclusive com noValidate: o
  // listener no próprio form corre antes do onSubmit do React (delegado na raiz).
  // Campo vazio fica com a validação do formulário (required).
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const segurar = (event: SubmitEvent) => {
      const campo = input.current;
      if (!campo || campo.disabled || campo.readOnly || !dateInputError(campo.value, { min, max })) return;
      event.preventDefault(); event.stopImmediatePropagation();
      setTouched(true); campo.focus();
    };
    form.addEventListener("submit", segurar);
    return () => form.removeEventListener("submit", segurar);
  }, [min, max]);

  const update = (next: string) => {
    if (next === current) return;
    emitido.current = next; setInternalValue(next); onChange?.(next);
  };
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
      <div className="ui-input-wrap ui-date-input-wrap">
        <input ref={input} id={id} className="ui-input" type="text" inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa" maxLength={10}
          value={draft} disabled={disabled} readOnly={readOnly} required={required} aria-invalid={message ? true : undefined}
          aria-describedby={`${id}-help`} onBlur={() => setTouched(true)}
          onInvalid={(event) => { event.preventDefault(); setTouched(true); input.current?.focus(); }}
          onChange={(event) => {
            const next = maskDateInput(event.target.value);
            setDraft(next); setTouched(false);
            update(valorDigitado(next, { min, max }).valor);
          }}
          onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); changeOpen(true); } }} />
        <PopoverTrigger asChild><button ref={trigger} type="button" className="ui-date-trigger" disabled={disabled || readOnly}
          aria-label={`Abrir calendário de ${label}`}><CalendarDaysIcon size={18} aria-hidden="true" /></button></PopoverTrigger>
      </div>
      <PopoverContent container={container} aria-label={`Calendário de ${label}`} className="ui-date-popover" align="end" sideOffset={8}
        onOpenAutoFocus={(event) => event.preventDefault()}>
        <Calendar mode="single" required selected={issue ? undefined : parsed} onSelect={select} month={month} onMonthChange={setMonth}
          startMonth={minDate} endMonth={maxDate} disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]} autoFocus />
        <div className="ui-calendar-footer"><button type="button" disabled={todayDisabled} onClick={() => select(today)}>Hoje</button><button type="button" onClick={() => select()}>Limpar</button></div>
      </PopoverContent>
    </Popover>
    {name && <input type="hidden" name={name} disabled={disabled} value={parsed && !issue ? dateValue(parsed) : ""} />}
    <p id={`${id}-help`} className={message ? "ui-field-error" : "ui-field-hint"}>{message ? `Erro: ${message}` : hint ?? "Digite a data ou escolha no calendário."}</p>
  </div>;
}
