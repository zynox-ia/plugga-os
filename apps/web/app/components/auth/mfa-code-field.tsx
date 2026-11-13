"use client";

import { TextField } from "../ui";
import styles from "./mfa-code-field.module.css";

export function MfaCodeField({
  value,
  onChange,
  recovery = true,
  disabled = false,
  semDica = false,
}: {
  value: string;
  onChange: (code: string) => void;
  recovery?: boolean;
  disabled?: boolean;
  /** Esconde a linha de ajuda sob o campo (telas onde o espaço é curto). */
  semDica?: boolean;
}) {
  return (
    <TextField
      className={styles.field}
      label={recovery ? "Código de verificação ou recuperação" : "Código do aplicativo"}
      {...(semDica
        ? {}
        : {
            hint: recovery
              ? "Use os 6 dígitos do app ou um código de recuperação ainda não utilizado."
              : "Digite os 6 dígitos exibidos no seu aplicativo autenticador.",
          })}
      placeholder={recovery ? "000000 ou ABCD-EFGH-IJKL" : "000000"}
      name="code"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required
      autoComplete="one-time-code"
      autoCapitalize="none"
      spellCheck={false}
      inputMode={recovery ? "text" : "numeric"}
      maxLength={recovery ? 40 : 6}
      pattern={recovery ? undefined : "[0-9]{6}"}
      disabled={disabled}
    />
  );
}
