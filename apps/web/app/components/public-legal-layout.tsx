import type { ReactNode } from "react";
import { SplineBackground } from "./spline-background";

export function PublicLegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-root legal-root">
      <SplineBackground />

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
