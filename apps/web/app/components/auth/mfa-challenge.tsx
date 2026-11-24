"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { mfaRequest, MfaError } from "../../lib/mfa-client";
import { safeRedirect } from "../../lib/safe-redirect";
import { Alert, Button } from "../ui";
import { MfaCodeField } from "./mfa-code-field";

export function MfaChallenge({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [challenge, setChallenge] = useState<{ pending: boolean; expiresAt: string | null } | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    mfaRequest<{ pending: boolean; expiresAt: string | null }>("challenge")
      .then((value) => {
        if (active) setChallenge(value);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Tente novamente.");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  useEffect(() => {
    if (!challenge?.pending || !challenge.expiresAt) return;
    const timer = setTimeout(
      () => setChallenge({ pending: false, expiresAt: null }),
      Math.max(0, Date.parse(challenge.expiresAt) - Date.now())
    );
    return () => clearTimeout(timer);
  }, [challenge]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await mfaRequest("verify", { code: code.trim() });
      setCode("");
      router.replace(safeRedirect(redirectTo));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tente novamente.");
      if (err instanceof MfaError && err.status === 401) setReload((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await mfaRequest("cancel", {});
      setCode("");
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form-container">
      <h1 className="auth-form-title">Confirme seu acesso</h1>
      <p className="auth-form-subtitle">Sua conta está protegida com autenticação em duas etapas.</p>
      {error && <Alert tone="danger" title={error} />}
      {!challenge ? (
        <>
          {!error && <p role="status">Verificando solicitação…</p>}
          {error && (
            <Button variant="secondary" onClick={() => { setError(""); setReload((value) => value + 1); }}>
              Tentar novamente
            </Button>
          )}
        </>
      ) : !challenge.pending ? (
        <Alert tone="warning" title="Solicitação encerrada">
          O prazo para confirmar terminou ou não há um login pendente. <Link href="/login">Entre novamente</Link>.
        </Alert>
      ) : (
        <form onSubmit={verify} className="auth-form-fields">
          <MfaCodeField value={code} onChange={setCode} disabled={busy} />
          <Button type="submit" loading={busy}>
            Confirmar e entrar
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void cancel()}>
            Cancelar acesso
          </Button>
        </form>
      )}
      <p
        className="auth-card-footer"
        style={{
          margin: "20px 0 0",
          fontSize: "13px",
          color: "var(--ui-muted, #536579)",
          lineHeight: "1.5",
          whiteSpace: "normal",
          wordBreak: "break-word",
          textAlign: "center",
        }}
      >
        Perdeu o app e os códigos? Peça a um Desenvolvedor da equipe a recuperação da conta. Redefinir a senha não
        remove esta proteção.
      </p>
    </div>
  );
}
