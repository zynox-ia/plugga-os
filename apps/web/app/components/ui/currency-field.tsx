"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { TextField } from "./fields";
import { currencyFieldText, maskCurrencyTyping, parseCurrencyPaste } from "./currency-value";

type CurrencyFieldProps = Omit<ComponentProps<typeof TextField>, "type" | "inputMode" | "prefix" | "value" | "defaultValue" | "onChange" | "pattern"> & {
  /** Valor decimal em reais, por exemplo "25000.50" ("-200.00" com `permitirNegativo`). Vazio é uma string vazia. */
  value: string;
  onValueChange: (value: string) => void;
  /** Aceita o sinal de menos (a tecla "-" alterna o sinal). Só liga onde o valor negativo faz sentido, como um saldo. */
  permitirNegativo?: boolean;
};

/**
 * Valor em reais no padrão de app de banco: só algarismos entram, cada um pelos centavos
 * ("1" → "0,01", "123456" → "1.234,56"), com milhar ao vivo. Backspace tira o último algarismo;
 * letras são ignoradas; colar "1.234,56", "1234.56" ou "R$ 1.234,56" dá o mesmo valor.
 */
export function CurrencyField({ value, onValueChange, onBlur, onPaste, permitirNegativo = false, ...props }: CurrencyFieldProps) {
  const [draft, setDraft] = useState(() => currencyFieldText(value, permitirNegativo));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(currencyFieldText(value, permitirNegativo));
    }
  }, [value, permitirNegativo]);
  const aplicar = (next: { text: string; value: string }, input: HTMLInputElement) => {
    setDraft(next.text);
    if (next.value !== emitted.current) { emitted.current = next.value; onValueChange(next.value); }
    // O texto muda de tamanho com os pontos de milhar; o cursor fica sempre no fim.
    requestAnimationFrame(() => { if (document.activeElement === input) input.setSelectionRange(next.text.length, next.text.length); });
  };
  return <TextField aria-description="Valor em reais" placeholder="0,00" {...props} type="text" inputMode="decimal" prefix="R$" autoComplete="off"
    value={draft}
    onChange={(event) => aplicar(maskCurrencyTyping(event.target.value, draft, permitirNegativo), event.target)}
    onPaste={(event) => {
      onPaste?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      const colado = parseCurrencyPaste(event.clipboardData.getData("text"), permitirNegativo);
      if (colado) aplicar(colado, event.currentTarget);
    }}
    onBlur={(event) => { if (draft === "-") setDraft(""); onBlur?.(event); }} />;
}
