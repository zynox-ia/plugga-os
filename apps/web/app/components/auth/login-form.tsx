"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { googleLoginErrorMessage, type GoogleLoginErrorCode } from "@plugga/shared";

import type { GoogleAuthConfig } from "../../lib/google";
import { safeRedirect } from "../../lib/safe-redirect";
import { GoogleSignInButton } from "./google-sign-in-button";

function loginErrorMessage(status: number): string {
  if (status === 429) return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  if (status === 401) return "E-mail ou senha inválidos.";
  return "Não foi possível entrar. Verifique os dados e tente novamente.";
}

export function LoginForm({
  redirectTo,
  google,
  googleError,
}: {
  redirectTo?: string;
  /** Ausente quando o login Google está desligado ou mal configurado. */
  google?: GoogleAuthConfig | null;
  googleError?: GoogleLoginErrorCode | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        router.push(safeRedirect(redirectTo));
        router.refresh();
        return;
      }

      setError(loginErrorMessage(response.status));
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-form-container">
      <h1 className="auth-form-title">Acessar a plataforma</h1>
      <p className="auth-form-subtitle">
        Digite seus dados para gerenciar sua operação no plugga-os.
      </p>

      <form className="auth-form-fields" onSubmit={handleSubmit}>
        <div className="auth-pill-field">
          <label className="auth-pill-label" htmlFor="email-input">
            E-mail
          </label>
          <div className="auth-pill-input-wrapper">
            <svg className="auth-pill-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <input
              id="email-input"
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

        <div className="auth-pill-field">
          <label className="auth-pill-label" htmlFor="password-input">
            Senha
          </label>
          <div className="auth-pill-input-wrapper">
            <svg className="auth-pill-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              id="password-input"
              type={showPassword ? "text" : "password"}
              name="password"
              className="auth-pill-input auth-pill-input--has-icon"
              placeholder="Digite sua senha"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="auth-pill-eye"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" x2="22" y1="2" y2="22" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="auth-pill-options">
          <label className="auth-remember-label">
            <span className="auth-remember-checkbox-wrapper">
              <input
                type="checkbox"
                className="auth-remember-checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="auth-remember-custom-check">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </span>
            <span>Mantenha-me conectado</span>
          </label>
          <a href="/auth/reset" className="auth-forgot-link">
            Esqueceu a senha?
          </a>
        </div>

        {/* A recusa do Google chega pela URL (`?googleError=`), já reduzida a um
            código enumerado pelo servidor — nenhum e-mail, `sub` ou mensagem
            interna atravessa. Uma tentativa de senha em seguida sobrepõe a
            mensagem, que é a ordem que a pessoa espera. */}
        {error ?? googleError ? (
          <p className="auth-error-msg" role="alert">
            {error ?? googleLoginErrorMessage(googleError as GoogleLoginErrorCode)}
          </p>
        ) : null}

        {/* Primary Login Button with Shimmer & Icon */}
        <button type="submit" className="auth-pill-submit" disabled={pending}>
          <div className="auth-submit-shimmer" />
          <span className="auth-submit-text">{pending ? "Entrando…" : "Fazer login"}</span>
          <svg className="auth-submit-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
        <p className="auth-legal-notice">
          Ao continuar, você concorda com os <a className="auth-legal-link" href="/termos">Termos de uso</a> e a{" "}
          <a className="auth-legal-link" href="/privacidade">Política de privacidade</a>.
        </p>
      </form>

      {/* O separador "ou" mora dentro do botão, não aqui: sem Google
          configurado ele não aparece, e se o script do Google for bloqueado os
          dois somem juntos. Anunciar uma alternativa que não existe é pior do
          que não anunciar nada. */}
      {google ? (
        <GoogleSignInButton
          clientId={google.clientId}
          loginUri={google.loginUri}
          redirectTo={redirectTo}
        />
      ) : null}
    </div>
  );
}
