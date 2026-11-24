"use client";

import { useEffect, useRef, useState } from "react";

import { safeRelativePath } from "../../lib/safe-redirect";
import { GOOGLE_REDIRECT_KEY } from "./google-complete";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Largura mínima/máxima que o próprio Google aceita no botão renderizado. */
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

type ScriptState = "loading" | "ready" | "failed";

type GoogleWindow = Window & {
  google?: { accounts: { id: {
    renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
  } } };
};

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
  rememberMe,
}: {
  clientId: string;
  loginUri: string;
  redirectTo?: string;
  rememberMe: boolean;
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
    if ((window as GoogleWindow).google?.accounts.id) {
      setScriptState("ready");
      return;
    }

    const script = existente ?? document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    const loaded = () => setScriptState("ready");
    const failed = () => setScriptState("failed");
    script.addEventListener("load", loaded);
    // Bloqueador de rastreadores, rede corporativa fechada, Google fora do ar:
    // some só o botão. E-mail e senha continuam sendo o caminho completo.
    script.addEventListener("error", failed);
    if (!existente) document.head.appendChild(script);
    return () => {
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };
  }, []);

  useEffect(() => {
    const slot = containerRef.current?.querySelector<HTMLElement>(".g_id_signin");
    const google = (window as GoogleWindow).google?.accounts.id;
    if (scriptState !== "ready" || !slot || !google) return;
    // O GIS captura state ao renderizar; mudar só data-state deixa o iframe antigo.
    slot.replaceChildren();
    google.renderButton(slot, {
      type: "standard", shape: "pill", theme: "outline", text: "signin_with",
      size: "large", logo_alignment: "left", locale: "pt-BR",
      width: Number(slot.dataset.width),
      state: rememberMe ? "remember" : "session",
    });
  }, [rememberMe, scriptState]);

  // O separador vive AQUI dentro, e não na tela de login, para sumir junto com
  // o botão. Quando o script do Google é bloqueado, um "ou" sozinho no meio da
  // tela anuncia uma alternativa que não existe — foi o que a CI flagrou.
  if (scriptState === "failed") {
    return null;
  }

  return (
    <>
      <div className="auth-pill-divider">
        <span>ou</span>
      </div>
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
          data-state={rememberMe ? "remember" : "session"}
          data-type="standard"
          data-shape="pill"
          data-theme="outline"
          data-text="signin_with"
          data-size="large"
          data-logo_alignment="left"
          data-locale="pt-BR"
        />
      </div>
    </>
  );
}
