import type { ReactNode } from "react";

export function PublicLegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-root legal-root">
      <div className="spline-container legal-spline">
        <iframe
          src="https://my.spline.design/bganimation-xIKR0ZTWWoifZLAKROH7y9YL"
          frameBorder="0"
          width="100%"
          height="100%"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          title="Animação de fundo"
        />
      </div>

      <main className="legal-page legal-page--glass">
        <header className="legal-header">
          <a className="legal-brand" href="/login" aria-label="Voltar ao login do plugga-os">
            <img src="/brand/icone-verde.svg" alt="plugga-os" />
          </a>
          <a className="legal-back" href="/login">Voltar ao login</a>
        </header>
        {children}
      </main>
    </div>
  );
}
