import type { Metadata } from "next";

import { AuthCard } from "../components/auth/auth-card";
import { LoginForm } from "../components/auth/login-form";

export const metadata: Metadata = { title: "Entrar — Plugga OS" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <AuthCard
      title="Entrar"
      description="Acesse o Plugga OS com seu e-mail e senha."
      footer={<a href="/auth/reset">Esqueci minha senha</a>}
    >
      <LoginForm redirectTo={redirectTo} />
    </AuthCard>
  );
}
