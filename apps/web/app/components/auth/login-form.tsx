"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/** Only accept same-origin relative paths; never redirect off Plugga OS. */
function safeRedirect(path: string | undefined): string {
  if (path && path.startsWith("/") && !path.startsWith("//")) return path;
  return "/";
}

function loginErrorMessage(status: number): string {
  if (status === 429) return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  if (status === 401) return "E-mail ou senha inválidos.";
  return "Não foi possível entrar. Verifique os dados e tente novamente.";
}

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
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
        Digite seus dados para gerenciar sua operação no Plugga OS.
      </p>

      <form className="auth-form-fields" onSubmit={handleSubmit}>
        <div className="auth-pill-field">
          <label className="auth-pill-label" htmlFor="email-input">
            Email
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

        {error ? (
          <p className="auth-error-msg" role="alert">
            {error}
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
      </form>

      <div className="auth-pill-divider">
        <span>ou</span>
      </div>

      {/* Google Login Button */}
      <button type="button" className="auth-sso-btn">
        <div className="auth-sso-icon">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
        </div>
        <span className="auth-sso-text">Entrar com o Google</span>
      </button>
    </div>
  );
}
