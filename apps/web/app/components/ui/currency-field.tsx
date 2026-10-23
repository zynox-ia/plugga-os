"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { TextField } from "./fields";
import { CURRENCY_INPUT_PATTERN, displayCurrency, parseCurrencyInput } from "./currency-value";

type CurrencyFieldProps = Omit<ComponentProps<typeof TextField>, "type" | "inputMode" | "prefix" | "value" | "defaultValue" | "onChange" | "pattern"> & {
  /** Valor decimal em reais, por exemplo "25000.50". Vazio é uma string vazia. */
  value: string;
  onValueChange: (value: string) => void;
};

export function CurrencyField({ value, onValueChange, onBlur, error, ...props }: CurrencyFieldProps) {
  const [draft, setDraft] = useState(() => displayCurrency(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(displayCurrency(value));
    }
  }, [value]);
  const parsed = parseCurrencyInput(draft);
  return <TextField aria-description="Valor em reais" placeholder="0,00" {...props} type="text" inputMode="decimal" prefix="R$"
    value={draft} pattern={CURRENCY_INPUT_PATTERN} error={error ?? (parsed === undefined ? "Informe um valor em reais, como 1.234,56." : undefined)}
    onChange={(event) => {
      setDraft(event.target.value);
      const next = parseCurrencyInput(event.target.value);
      if (next !== undefined) { emitted.current = next; onValueChange(next); }
    }}
    onBlur={(event) => { if (parsed !== undefined) setDraft(displayCurrency(parsed)); onBlur?.(event); }} />;
}
