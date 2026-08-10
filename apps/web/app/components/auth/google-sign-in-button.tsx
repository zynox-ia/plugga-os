"use client";

import { useEffect, useRef, useState } from "react";

import { safeRelativePath } from "../../lib/safe-redirect";
import { GOOGLE_REDIRECT_KEY } from "./google-complete";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Largura mínima/máxima que o próprio Google aceita no botão renderizado. */
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

type ScriptState = "loading" | "ready" | "failed";

/**
 * Botão oficial "Entrar com o Google", renderizado pelo próprio Google Identity
 * Services em modo redirect.
 *
 * Por que o botão é do Google e não nosso: no modo redirect o fluxo inteiro —
 * `state`, o cookie double-submit `g_csrf_token`, o POST para o `login_uri` —
 * é montado pela biblioteca. Um botão próprio exigiria implementar o
 * Authorization Code por fora, com client secret e troca de código, só para
 * preservar o desenho. O botão anterior era decorativo e não fazia nada.
 *
 * O componente nunca vê ID token: a credencial vai direto do Google para o
 * nosso callback server-side, sem passar por JavaScript desta página.
 */
export function GoogleSignInButton({
  clientId,
  loginUri,
  redirectTo,
}: {
  clientId: string;
  loginUri: string;
  redirectTo?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scriptState, setScriptState] = useState<ScriptState>("loading");

  // O destino é guardado ANTES da ida, não no clique: quando esta tela é
  // montada o `redirectTo` já é conhecido, e o botão do Google é do Google —
  // não há um `onClick` nosso de que dependesse a gravação.
  useEffect(() => {
    const destino = safeRelativePath(redirectTo);
    try {
      if (destino) {
        window.sessionStorage.setItem(GOOGLE_REDIRECT_KEY, destino);
      } else {
        // Sem destino válido, apaga um resíduo de tentativa anterior em vez de
        // deixá-lo mandar esta pessoa para a tela da tentativa passada.
        window.sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
      }
    } catch {
      // Armazenamento bloqueado: o login continua, só cai na raiz no fim.
    }
  }, [redirectTo]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // A largura tem de ser um número em px (o Google não aceita "100%"), então
    // é medida do wrapper que já tem a largura do formulário — assim o botão
    // acompanha o layout em vez de ficar preso a um valor chutado.
    const medida = Math.round(container.getBoundingClientRect().width);
    const largura = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, medida || MIN_WIDTH));
    container.querySelector(".g_id_signin")?.setAttribute("data-width", String(largura));

    const existente = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existente) {
      // Navegação client-side de volta ao /login: o script já está na página e
      // não dispara `load` de novo, mas a biblioteca reprocessa o DOM sozinha.
      setScriptState("ready");
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => setScriptState("ready"));
    // Bloqueador de rastreadores, rede corporativa fechada, Google fora do ar:
    // some só o botão. E-mail e senha continuam sendo o caminho completo.
    script.addEventListener("error", () => setScriptState("failed"));
    document.head.appendChild(script);
  }, []);

  if (scriptState === "failed") {
    return null;
  }

  return (
    <div className="auth-google-slot" ref={containerRef} data-state={scriptState}>
      <div
        id="g_id_onload"
        data-client_id={clientId}
        data-login_uri={loginUri}
        data-ux_mode="redirect"
        // One Tap fica fora desta fase: é prompt automático de terceiro na
        // tela, com FedCM e consentimento próprios, e não é o que foi pedido.
        data-auto_prompt="false"
        data-auto_select="false"
        data-itp_support="true"
      />
      <div
        className="g_id_signin"
        data-type="standard"
        data-shape="pill"
        data-theme="outline"
        data-text="signin_with"
        data-size="large"
        data-logo_alignment="left"
        data-locale="pt-BR"
      />
    </div>
  );
}
