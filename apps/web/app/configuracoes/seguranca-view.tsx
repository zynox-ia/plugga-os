"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { MfaRecoveryCodes, MfaSetup, MfaStatus } from "@plugga/shared";
import { Alert, Badge, Button } from "../components/ui";
import { MfaError, mfaRequest } from "../lib/mfa-client";
import { MfaActionDialog, type MfaAction } from "./mfa-action-dialog";
import { MfaRecoveryCodes as RecoveryCodes } from "./mfa-recovery-codes";
import { MfaSetupForm } from "./mfa-setup";
import config from "./configuracoes.module.css";
import styles from "./mfa.module.css";

export function SegurancaView() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [action, setAction] = useState<MfaAction | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    mfaRequest<MfaStatus>("status")
      .then((value) => {
        if (active) {
          setStatus(value);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar. Tente novamente.");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  function fail(err: unknown) {
    setError(err instanceof Error ? err.message : "Não foi possível concluir. Tente novamente.");
    if (err instanceof MfaError && err.message === "Entre novamente para configurar a autenticação em duas etapas.") {
      setReauth(true);
    }
    if (err instanceof MfaError && err.status === 403) {
      setStatus((value) => (value ? { ...value, recentlyVerified: false } : value));
    }
  }

  async function execute(selected: MfaAction, code = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (status?.enabled && !status.recentlyVerified) {
        await mfaRequest("confirm", { code });
        setStatus((value) => (value ? { ...value, recentlyVerified: true } : value));
      }
      if (selected === "setup") {
        setSetup(await mfaRequest<MfaSetup>("setup", {}));
      } else if (selected === "recovery-codes") {
        const result = await mfaRequest<MfaRecoveryCodes>("recovery-codes", {});
        setCodes(result.recoveryCodes);
        setStatus((value) => (value ? { ...value, recoveryCodesRemaining: result.recoveryCodes.length } : value));
      } else {
        await mfaRequest("disable", {});
        setStatus({ enabled: false, recoveryCodesRemaining: 0, recentlyVerified: false });
        setNotice("Autenticação em duas etapas desativada. As outras sessões foram encerradas.");
      }
      setAction(null);
    } catch (err) {
      fail(err);
      if (err instanceof MfaError && err.status === 403 && status?.enabled) setAction(selected);
    } finally {
      setBusy(false);
    }
  }

  async function enable(code: string) {
    setBusy(true);
    setError("");
    try {
      const result = await mfaRequest<MfaRecoveryCodes>("enable", { code });
      setSetup(null);
      setCodes(result.recoveryCodes);
      setStatus({ enabled: true, recoveryCodesRemaining: result.recoveryCodes.length, recentlyVerified: true });
      setNotice("Proteção ativada. As outras sessões foram encerradas. Salve os códigos abaixo.");
    } catch (err) {
      fail(err);
      if (err instanceof MfaError && err.status === 403) {
        setSetup(null);
        if (status?.enabled) {
          setError("Sua confirmação expirou. Troque o autenticador novamente e confirme seu segundo fator atual.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function reenter() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível sair. Tente novamente.");
      window.location.assign("/login?redirectTo=%2Fconfiguracoes%3Faba%3Dseguranca");
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  return (
    <section className={`${config.secao} ${styles.stack} ${styles.card}`} aria-label="Autenticação em duas etapas">
      <div className={styles.header}>
        <div>
          <h3>
            <ShieldCheck size={18} aria-hidden="true" />
            Autenticação em duas etapas
          </h3>
          <p className={styles.note}>
            Proteja sua conta com um aplicativo autenticador. A ativação é opcional para todos os papéis.
          </p>
        </div>
        {status && (
          <Badge tone={status.enabled ? "success" : "neutral"}>{status.enabled ? "Ativada" : "Desativada"}</Badge>
        )}
      </div>

      {error && !action && <Alert tone="danger" title={error} />}
      {notice && <Alert tone="success" title={notice} />}

      {!status ? (
        <>
          <p className={styles.note} role="status">
            {error ? "O status da proteção não está disponível." : "Carregando proteção…"}
          </p>
          {error && (
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setReload((value) => value + 1)}>
                Tentar novamente
              </Button>
            </div>
          )}
        </>
      ) : reauth ? (
        <div className={styles.actions}>
          <Button loading={busy} onClick={() => void reenter()}>
            Sair e entrar novamente
          </Button>
        </div>
      ) : codes ? (
        <RecoveryCodes
          codes={codes}
          onDone={() => {
            setCodes(null);
            setNotice("Autenticação em duas etapas ativada. Seus códigos foram ocultados.");
          }}
        />
      ) : setup ? (
        <MfaSetupForm
          setup={setup}
          busy={busy}
          onConfirm={enable}
          onCancel={() => {
            setSetup(null);
            setError("");
          }}
        />
      ) : (
        <>
          <p className={styles.note}>
            {status.enabled
              ? `Novos logins por senha e Google exigem o segundo fator. Códigos de recuperação restantes: ${status.recoveryCodesRemaining}.`
              : "Após ativar, todos os novos logins por senha e Google pedirão um código do app ou de recuperação."}
          </p>
          <div className={styles.actions}>
            {status.enabled ? (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setAction("setup");
                  }}
                >
                  Trocar autenticador
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setAction("recovery-codes");
                  }}
                >
                  Gerar novos códigos
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setAction("disable");
                  }}
                >
                  Desativar proteção
                </Button>
              </>
            ) : (
              <Button loading={busy} onClick={() => void execute("setup")}>
                Ativar autenticação em duas etapas
              </Button>
            )}
          </div>
          <p className={styles.note}>
            Guarde os códigos de recuperação fora do autenticador. Se perder ambos, solicite a recuperação a um
            Desenvolvedor da equipe.
          </p>
        </>
      )}

      {action && status && (
        <MfaActionDialog
          action={action}
          recent={status.recentlyVerified}
          busy={busy}
          error={error}
          onClose={() => {
            setAction(null);
            setError("");
          }}
          onSubmit={(code) => execute(action, code)}
        />
      )}
    </section>
  );
}
