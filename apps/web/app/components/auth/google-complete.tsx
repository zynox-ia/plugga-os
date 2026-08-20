"use client";

import { useEffect } from "react";

import { safeRedirect } from "../../lib/safe-redirect";

/**
 * Chave do destino guardado antes da ida ao Google. Vive em `sessionStorage`
 * (aba, não navegador) porque é exatamente esse o tempo de vida do dado: a ida
 * e a volta de UM login. Cookie não serviria — o POST de volta vem do Google,
 * cross-site, e um cookie que sobrevivesse a isso teria de ser `SameSite=None`.
 */
export const GOOGLE_REDIRECT_KEY = "plugga.googleRedirectTo";

/**
 * Última etapa do login Google: a sessão já existe (o middleware desta rota não
 * deixaria ninguém sem sessão chegar aqui), e o que falta é levar a pessoa para
 * onde ela estava indo antes de ser mandada ao /login.
 *
 * O destino é lido, APAGADO e revalidado. Revalidar de novo aqui não é
 * paranoia repetida: entre a gravação e esta leitura o valor esteve em
 * armazenamento que qualquer script da mesma origem poderia ter reescrito.
 */
export function GoogleComplete() {
  useEffect(() => {
    let destino = "/";
    try {
      const guardado = window.sessionStorage.getItem(GOOGLE_REDIRECT_KEY);
      window.sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
      destino = safeRedirect(guardado);
    } catch {
      // Armazenamento bloqueado (modo restrito, extensão): a raiz é um destino
      // correto, só menos conveniente. Nunca é motivo para travar o login.
      destino = "/";
    }
    // `replace` para esta página não ficar no histórico: o botão "voltar" tem
    // de levar de onde a pessoa veio, não a um POST já consumido.
    window.location.replace(destino);
  }, []);

  return (
    <div className="auth-form-container">
      <h1 className="auth-form-title">Entrando…</h1>
      <p className="auth-form-subtitle">Estamos concluindo o seu acesso ao plugga-os.</p>
      <p className="auth-form-subtitle" aria-live="polite">
        Se esta tela não sair sozinha, <a href="/">continue para o início</a>.
      </p>
    </div>
  );
}
