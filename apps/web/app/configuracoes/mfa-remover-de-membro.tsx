"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { MfaStatus } from "@plugga/shared";
import { Alert, Button, TextareaField } from "../components/ui";
import { MfaCodeField } from "../components/auth/mfa-code-field";
import { MfaError, mfaRequest } from "../lib/mfa-client";
import { useSessionUser } from "../lib/use-session-user";
import styles from "./mfa.module.css";

export function MfaRemoverDeMembro({
  id,
  name,
  tipo,
}: {
  id: string;
  name: string;
  tipo?: "pessoa" | "agente_ia";
}) {
  const { usuario } = useSessionUser();
  const allowed = usuario?.acesso.plataforma === "desenvolvedor" && usuario.id !== id && tipo !== "agente_ia";
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!allowed || !open) return;
    let active = true;
    mfaRequest<MfaStatus>("status")
      .then((value) => {
        if (active) {
          setStatus(value);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Tente novamente.");
      });
    return () => {
      active = false;
    };
  }, [allowed, open, reload]);

  if (!allowed) return null;

  async function remove(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!status?.recentlyVerified) {
        await mfaRequest("confirm", { code: code.trim() });
        setStatus((value) => (value ? { ...value, recentlyVerified: true } : value));
      }
      await mfaRequest(`users/${encodeURIComponent(id)}/remove`, { reason: reason.trim() });
      setCode("");
      setReason("");
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover. Tente novamente.");
      if (err instanceof MfaError && err.status === 403) {
        setStatus((value) => (value ? { ...value, recentlyVerified: false } : value));
      }
    } finally {
      setCode("");
      setBusy(false);
    }
  }

  return (
    <section className={styles.stack} aria-label="Recuperação do segundo fator">
      <h3>Recuperação do segundo fator</h3>
      {done ? (
        <Alert tone="success" title="Proteção removida">
          Todas as sessões de {name} foram encerradas. A pessoa poderá entrar novamente e escolher se deseja ativar a
          proteção.
        </Alert>
      ) : !open ? (
        <div className={styles.actions}>
          <Button variant="danger" onClick={() => setOpen(true)}>
            Remover 2FA desta pessoa
          </Button>
        </div>
      ) : (
        <div className={styles.confirmation}>
          <Alert tone="warning" title={`Remover a proteção de ${name}?`}>
            Use somente após uma solicitação da pessoa que perdeu o app e os códigos de recuperação. Todas as sessões da
            conta serão encerradas. A remoção será registrada na auditoria.
          </Alert>
          {error && <Alert tone="danger" title={error} />}
          {!status ? (
            <>
              {!error && <p role="status">Verificando sua proteção…</p>}
              {error && (
                <Button variant="secondary" onClick={() => setReload((value) => value + 1)}>
                  Tentar novamente
                </Button>
              )}
            </>
          ) : !status.enabled ? (
            <Alert title="Ative sua própria proteção para continuar">
              Somente um Desenvolvedor com 2FA ativo pode recuperar outra conta.{" "}
              <a href="/configuracoes?aba=seguranca">Configure sua segurança</a>.
            </Alert>
          ) : (
            <form className={styles.stack} onSubmit={remove}>
              <TextareaField
                label="Solicitação recebida e motivo da remoção"
                hint="Descreva quem solicitou a recuperação e o motivo (10 a 500 caracteres). Não inclua senhas nem códigos."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={10}
                maxLength={500}
                required
                disabled={busy}
              />
              {!status.recentlyVerified && <MfaCodeField value={code} onChange={setCode} disabled={busy} />}
              <div className={styles.actions}>
                <Button
                  type="submit"
                  variant="danger"
                  loading={busy}
                  disabled={reason.trim().length < 10}
                >
                  Confirmar remoção e encerrar sessões
                </Button>
              </div>
            </form>
          )}
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setCode("");
                setReason("");
                setError("");
                setStatus(null);
              }}
            >
              Cancelar remoção
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
