"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
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

  return (
    <div className={`${styles.stack} ${styles.setupRaiz}`}>
      {expired ? (
        <Alert tone="warning" title="Configuração expirada">
          Cancele e inicie a configuração novamente.
        </Alert>
      ) : (
        <form className={styles.setup} onSubmit={submit}>
          <div className={styles.qrContainer}>
            <img
              className={styles.qr}
              src={qr}
              width={220}
              height={220}
              alt="QR code para cadastrar sua conta no aplicativo autenticador"
            />
          </div>
          <div className={styles.camposDaConfiguracao}>
            <TextField
              label="Chave para configuração manual"
              value={setup.secret}
              readOnly
              spellCheck={false}
              autoComplete="off"
            />
            <MfaCodeField value={code} onChange={setCode} recovery={false} disabled={busy} semDica />
          </div>
          <div className={styles.acoesDaConfiguracao}>
            <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
              Cancelar configuração
            </Button>
            <Button type="submit" icon={<Check size={14} />} loading={busy}>
              Confirmar primeiro código
            </Button>
          </div>
        </form>
      )}
      {expired && (
        <div className={styles.actions}>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancelar configuração
          </Button>
        </div>
      )}
    </div>
  );
}
