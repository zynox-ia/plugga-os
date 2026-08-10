"use client";

import { useEffect, useState, type ReactNode } from "react";

const TYPING_PHRASES = [
  "Inteligente. Unificada.",
  "Automação em Tempo Real.",
  "Eficiência Energética OPM.",
  "Gestão de Frotas & Mob.",
  "Inteligência Artificial Ativa.",
];

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentPhrase = TYPING_PHRASES[phraseIndex] ?? "";

    if (!isDeleting && displayText === currentPhrase) {
      const pauseTimeout = setTimeout(() => {
        setIsDeleting(true);
      }, 1500);
      return () => clearTimeout(pauseTimeout);
    }

    if (isDeleting && displayText === "") {
      const pauseTimeout = setTimeout(() => {
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % TYPING_PHRASES.length);
      }, 400);
      return () => clearTimeout(pauseTimeout);
    }

    const speed = isDeleting ? 45 : 85;
    const timeout = setTimeout(() => {
      setDisplayText((prev) =>
        isDeleting
          ? currentPhrase.slice(0, prev.length - 1)
          : currentPhrase.slice(0, prev.length + 1)
      );
    }, speed);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, phraseIndex]);

  return (
    <div className="auth-root">
      {/* Spline 3D Luminosity Layer */}
      <div className="spline-container">
        <iframe
          src="https://my.spline.design/bganimation-xIKR0ZTWWoifZLAKROH7y9YL"
          frameBorder="0"
          width="100%"
          height="100%"
          id="aura-spline"
          title="Spline 3D Background Animation"
        />
      </div>

      <div className="auth-frame">
        {/* Left Form Panel */}
        <div className="auth-panel-left">
          <div className="auth-brand-header">
            <img src="/brand/icone-verde.svg" alt="Plugga" className="auth-brand-logo" />
          </div>
          {title ? <h1 className="auth-form-title">{title}</h1> : null}
          {description ? <p className="auth-form-subtitle">{description}</p> : null}
          {children}
          {footer ? <div className="auth-pill-options" style={{ marginTop: 16 }}>{footer}</div> : null}
        </div>

        {/* Right Glassmorphism Showcase Panel */}
        <div className="auth-panel-right">
          <div className="auth-hero-content">
            <h2 className="auth-hero-title">
              Gestão Operacional. <br />
              <span className="auth-hero-highlight">
                {displayText}
                <span className="auth-typing-cursor">|</span>
              </span>
            </h2>

            {/* Floating Glassmorphic UI Card Showcase (Centered) */}
            <div className="auth-glass-showcase">
              {/* Card 1: Main Balance / Status */}
              <div className="auth-glass-card auth-glass-card--main">
                <div className="auth-glass-card-header">
                  <span className="auth-glass-badge">Plugga OS • Sistema Ativo</span>
                  <div className="auth-glass-status-dot" />
                </div>
                <div className="auth-glass-card-body">
                  <span className="auth-glass-label">Eficiência Operacional</span>
                  <div className="auth-glass-val">+34.85%</div>
                </div>

                {/* Vertical Bar Micro Chart */}
                <div className="auth-glass-chart">
                  <div className="auth-glass-bar" style={{ height: "45%" }} />
                  <div className="auth-glass-bar" style={{ height: "65%" }} />
                  <div className="auth-glass-bar" style={{ height: "40%" }} />
                  <div className="auth-glass-bar" style={{ height: "85%" }} />
                  <div className="auth-glass-bar auth-glass-bar--active" style={{ height: "100%" }} />
                  <div className="auth-glass-bar" style={{ height: "70%" }} />
                  <div className="auth-glass-bar" style={{ height: "90%" }} />
                </div>
              </div>

              {/* Floating Widget 2 */}
              <div className="auth-glass-card auth-glass-card--floating">
                <div className="auth-glass-user-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className="auth-glass-user-info">
                  <strong>Unidade Consumidora OPM</strong>
                  <span>Operação Ativa • Telemetria IA</span>
                </div>
                <div className="auth-glass-arrow">›</div>
              </div>
            </div>

            {/* Footer module badges */}
            <div className="auth-hero-footer">
              <span>Energia OPM</span>
              <span>•</span>
              <span>Pluggamob</span>
              <span>•</span>
              <span>CRM</span>
              <span>•</span>
              <span>Agentes IA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
