import type { Metadata } from "next";

import { AuthCard } from "../../../components/auth/auth-card";
import { GoogleComplete } from "../../../components/auth/google-complete";

export const metadata: Metadata = { title: "Entrando — Plugga OS" };

/**
 * Rota NÃO pública de propósito: o middleware exige sessão válida para chegar
 * aqui. Assim quem cair nesta URL sem ter passado pelo callback é mandado ao
 * /login como em qualquer outra tela, e a página nunca é um caminho de saída
 * utilizável por quem não autenticou.
 */
export default function GoogleCompletePage() {
  return (
    <AuthCard singlePanel>
      <GoogleComplete />
    </AuthCard>
  );
}
