import type { Metadata } from "next";
import { parseGoogleLoginErrorCode } from "@plugga/shared";

import { AuthCard } from "../components/auth/auth-card";
import { LoginForm } from "../components/auth/login-form";
import { googleAuthConfig } from "../lib/google";

export const metadata: Metadata = { title: "Entrar — plugga-os" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; googleError?: string }>;
}) {
  const { redirectTo, googleError } = await searchParams;
  // Lido no servidor, a cada requisição: o client ID não pode ficar preso ao
  // build do bundle standalone, que é o mesmo entre ambientes (ver lib/google).
  const google = googleAuthConfig();

  return (
    <AuthCard>
      <LoginForm
        redirectTo={redirectTo}
        google={google}
        // Um código fora da enumeração vira o genérico em vez de aparecer na
        // tela: a query é entrada de fora como qualquer outra.
        googleError={parseGoogleLoginErrorCode(googleError)}
      />
    </AuthCard>
  );
}
