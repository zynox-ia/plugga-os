"use client";

import { useState, type FormEvent } from "react";

const MIN_PASSWORD_LENGTH = 12;

/**
 * Requests a reset link by e-mail. The API always returns 200 for this
 * endpoint (never reveals whether the address is registered), so the UI shows
 * the same generic confirmation regardless of the outcome.
 */
export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <p className="auth-reset-status auth-success" role="status">
        Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.
      </p>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setDone(true);
        return;
      }
      setError("Não foi possível processar o pedido agora. Tente novamente.");
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-reset-form" onSubmit={handleSubmit}>
      <div className="auth-pill-field">
        <label className="auth-pill-label" htmlFor="reset-email-input">E-mail</label>
        <div className="auth-pill-input-wrapper">
          <svg className="auth-pill-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2,2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <input
            id="reset-email-input"
            type="email"
            name="email"
            className="auth-pill-input auth-pill-input--has-icon"
            placeholder="seu.email@plugga.com.br"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
      </div>

      {error ? (
        <p className="auth-error-msg" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="auth-pill-submit" disabled={pending}>
        <div className="auth-submit-shimmer" />
        <span className="auth-submit-text">{pending ? "Enviando…" : "Enviar link de redefinição"}</span>
        <svg className="auth-submit-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </form>
  );
}

export function ResetConfirmForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="auth-reset-status" role="status">
        Senha redefinida com sucesso. Você já pode entrar.
      </p>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (response.ok) {
        setDone(true);
        return;
      }

      setError("Link inválido ou expirado. Peça uma nova redefinição.");
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-reset-form" onSubmit={handleSubmit}>
      <div className="auth-pill-field">
        <label className="auth-pill-label" htmlFor="new-password-input">Nova senha</label>
        <div className="auth-pill-input-wrapper">
          <input
            id="new-password-input"
            type="password"
            name="password"
            className="auth-pill-input"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </div>

      <div className="auth-pill-field">
        <label className="auth-pill-label" htmlFor="confirm-password-input">Confirmar senha</label>
        <div className="auth-pill-input-wrapper">
          <input
            id="confirm-password-input"
            type="password"
            name="confirmPassword"
            className="auth-pill-input"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
      </div>

      <p className="auth-reset-hint">Mínimo de {MIN_PASSWORD_LENGTH} caracteres.</p>

      {error ? (
        <p className="auth-error-msg auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="auth-pill-submit" disabled={pending}>
        <div className="auth-submit-shimmer" />
        <span className="auth-submit-text">{pending ? "Confirmando…" : "Redefinir senha"}</span>
        <svg className="auth-submit-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </form>
  );
}
