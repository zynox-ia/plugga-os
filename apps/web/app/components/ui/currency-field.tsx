"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { TextField } from "./fields";
import { CURRENCY_INPUT_PATTERN, currencyFieldText, displayCurrency, maskCurrencyChange, parseCurrencyInput, parseCurrencyPaste, signError } from "./currency-value";

type CurrencyFieldProps = Omit<ComponentProps<typeof TextField>, "type" | "inputMode" | "prefix" | "value" | "defaultValue" | "onChange" | "pattern"> & {
  /** Valor decimal em reais, por exemplo "25000.50" ("-200.00" com `permitirNegativo`). Vazio é uma string vazia. */
  value: string;
  onValueChange: (value: string) => void;
  /**
   * Máscara de app de banco (opcional, desligada por padrão): só algarismos entram, cada um pelos centavos
   * ("1" → "0,01", "123456" → "1.234,56"), com milhar ao vivo. Sem ela, vale o contrato original: o texto
   * é livre, formata ao sair do campo e o erro de formato aparece enquanto digita.
   */
  mascaraDeCentavos?: boolean;
  /** Só com a máscara: a tecla "-" alterna o sinal. Ligue onde o valor negativo faz sentido, como um saldo. */
  permitirNegativo?: boolean;
  /** Só com a máscara: teto de algarismos (inteiros mais centavos). O padrão é 15; use o do contrato da API da tela. */
  maximoDeAlgarismos?: number;
};

/**
 * Valor em reais. Sem `mascaraDeCentavos`, o campo aceita o texto como a pessoa escreve ("1.234,56", "25000") e
 * formata ao sair. Com a máscara, Backspace tira o último algarismo, letras são ignoradas e texto inserido de uma
 * vez (colar, arrastar, autofill, preencher) é lido como colar: "25000" é 25.000,00.
 */
export function CurrencyField({ mascaraDeCentavos = false, permitirNegativo, maximoDeAlgarismos, ...props }: CurrencyFieldProps) {
  return mascaraDeCentavos
    ? <CampoComMascara {...props} {...(permitirNegativo !== undefined ? { permitirNegativo } : {})} {...(maximoDeAlgarismos !== undefined ? { maximoDeAlgarismos } : {})} />
    : <CampoLivre {...props} />;
}

type Livre = Omit<CurrencyFieldProps, "mascaraDeCentavos" | "permitirNegativo" | "maximoDeAlgarismos">;
type Interno = Livre & Pick<CurrencyFieldProps, "permitirNegativo" | "maximoDeAlgarismos">;

/** O contrato original, sem máscara. */
function CampoLivre({ value, onValueChange, onBlur, error, ...props }: Livre) {
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

/** Máscara de centavos: o texto do campo vem sempre das regras puras de `currency-value`. */
function CampoComMascara({ value, onValueChange, onBlur, onPaste, error, permitirNegativo = false, maximoDeAlgarismos, ...props }: Interno) {
  const [draft, setDraft] = useState(() => currencyFieldText(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(currencyFieldText(value));
    }
  }, [value]);
  const opcoes = { allowNegative: permitirNegativo, ...(maximoDeAlgarismos ? { maxDigits: maximoDeAlgarismos } : {}) };
  const aplicar = (next: { text: string; value: string }, input: HTMLInputElement) => {
    setDraft(next.text);
    if (next.value !== emitted.current) { emitted.current = next.value; onValueChange(next.value); }
    // O texto muda de tamanho com os pontos de milhar; com a máscara, o cursor fica sempre no fim.
    requestAnimationFrame(() => { if (document.activeElement === input) input.setSelectionRange(next.text.length, next.text.length); });
  };
  return <TextField aria-description="Valor em reais" placeholder="0,00" {...props} type="text" inputMode="decimal" prefix="R$" autoComplete="off"
    value={draft} error={error ?? signError(draft, permitirNegativo)}
    onChange={(event) => {
      const entrada = event.nativeEvent as Partial<InputEvent>;
      const lido = maskCurrencyChange(event.target.value, draft, { inputType: entrada.inputType ?? null, data: entrada.data ?? null }, opcoes);
      if (lido) aplicar(lido, event.target);
    }}
    onPaste={(event) => {
      onPaste?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      const colado = parseCurrencyPaste(event.clipboardData.getData("text"), permitirNegativo, maximoDeAlgarismos);
      if (colado) aplicar(colado, event.currentTarget);
    }}
    onBlur={(event) => { if (draft === "-") setDraft(""); onBlur?.(event); }} />;
}
