import type { Metadata } from "next";

import { AuthCard } from "../../components/auth/auth-card";
import { ResetConfirmForm, ResetRequestForm } from "../../components/auth/reset-forms";

export const metadata: Metadata = { title: "Redefinir senha — Plugga OS" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthCard
      title={token ? "Redefinir senha" : "Esqueci minha senha"}
      description={
        token
          ? "Escolha uma nova senha para sua conta."
          : "Informe seu e-mail para receber um link de redefinição."
      }
      footer={<a href="/login">Voltar para o login</a>}
    >
      {token ? <ResetConfirmForm token={token} /> : <ResetRequestForm />}
    </AuthCard>
  );
}
