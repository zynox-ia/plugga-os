"use client";

import { useState, type FormEvent } from "react";
import { MfaCodeField } from "../components/auth/mfa-code-field";
import { Alert, Button, Dialog } from "../components/ui";
import styles from "./mfa.module.css";

export type MfaAction = "setup" | "recovery-codes" | "disable";

const TEXT: Record<MfaAction, { title: string; description: string; button: string }> = {
  setup: {
    title: "Trocar aplicativo autenticador",
    description:
      "Após confirmar o novo app, o autenticador e os códigos de recuperação anteriores deixarão de funcionar. Suas outras sessões serão encerradas.",
    button: "Configurar novo app",
  },
  "recovery-codes": {
    title: "Gerar novos códigos de recuperação",
    description:
      "Todos os códigos de recuperação anteriores deixarão de funcionar. Salve os novos códigos assim que forem apresentados.",
    button: "Gerar novos códigos",
  },
  disable: {
    title: "Desativar autenticação em duas etapas",
    description:
      "Novos logins por senha e Google passarão a pedir somente a autenticação inicial. O app e os códigos serão invalidados, e suas outras sessões serão encerradas.",
    button: "Desativar proteção",
  },
};

export function MfaActionDialog({
  action,
  recent,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  action: MfaAction;
  recent: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const text = TEXT[action];

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit(code.trim());
    setCode("");
  }

  return (
    <Dialog
      className={styles.dialog}
      title={text.title}
      description={text.description}
      variant={action === "disable" ? "danger" : "default"}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="estreita"
    >
      <form onSubmit={submit} className={styles.stack}>
        {error && <Alert tone="danger" title={error} />}
        {recent ? (
          <p className={styles.note}>Segundo fator confirmado recentemente. A confirmação vale por cinco minutos.</p>
        ) : (
          <MfaCodeField value={code} onChange={setCode} disabled={busy} />
        )}
        <div className={styles.actions}>
          <Button type="submit" variant={action === "disable" ? "danger" : "primary"} loading={busy}>
            {text.button}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
