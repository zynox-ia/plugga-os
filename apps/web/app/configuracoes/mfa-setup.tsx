"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import qrcode from "qrcode-generator";
import type { MfaSetup } from "@plugga/shared";
import { Alert, Button, TextField } from "../components/ui";
import { MfaCodeField } from "../components/auth/mfa-code-field";
import styles from "./mfa.module.css";

export function MfaSetupForm({
  setup,
  busy,
  onConfirm,
  onCancel,
}: {
  setup: MfaSetup;
  busy: boolean;
  onConfirm: (code: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [expired, setExpired] = useState(Date.parse(setup.expiresAt) <= Date.now());

  const qr = useMemo(() => {
    const image = qrcode(0, "M");
    image.addData(setup.otpauthUri);
    image.make();
    return image.createDataURL(5, 20);
  }, [setup.otpauthUri]);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        setExpired(true);
        setCode("");
      },
      Math.max(0, Date.parse(setup.expiresAt) - Date.now())
    );
    return () => clearTimeout(timer);
  }, [setup.expiresAt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onConfirm(code.trim());
    setCode("");
  }

  async function copySecret() {
    setCopyError("");
    setCopied(false);
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
    } catch {
      setCopyError("Não foi possível copiar. Selecione a chave e copie manualmente.");
    }
  }

  return (
    <div className={styles.stack}>
      <Alert title="Adicione a conta ao seu aplicativo autenticador">
        Escaneie o QR code ou digite a chave manualmente. Depois, confirme o primeiro código do app para concluir. Até
        essa confirmação, seu acesso continua como antes.
      </Alert>
      {expired ? (
        <Alert tone="warning" title="Configuração expirada">
          Cancele e inicie a configuração novamente.
        </Alert>
      ) : (
        <div className={styles.setup}>
          <div className={styles.qrContainer}>
            <img
              className={styles.qr}
              src={qr}
              width={220}
              height={220}
              alt="QR code para cadastrar sua conta no aplicativo autenticador"
            />
          </div>
          <form className={styles.stack} onSubmit={submit}>
            <div className={styles.secretWrap}>
              <div className={styles.secretInput}>
                <TextField
                  label="Chave para configuração manual"
                  value={setup.secret}
                  readOnly
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={copySecret}
                className={styles.copySecretBtn}
              >
                {copied ? "Chave copiada" : "Copiar chave"}
              </Button>
            </div>
            {copyError && <p role="alert" className={styles.note}>{copyError}</p>}
            <MfaCodeField value={code} onChange={setCode} recovery={false} disabled={busy} />
            <div className={styles.actions}>
              <Button type="submit" loading={busy}>
                Confirmar primeiro código
              </Button>
            </div>
          </form>
        </div>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancelar configuração
        </Button>
      </div>
    </div>
  );
}
