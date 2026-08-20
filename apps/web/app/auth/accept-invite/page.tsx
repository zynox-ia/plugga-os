import type { Metadata } from "next";

import { AcceptInviteForm } from "../../components/auth/accept-invite-form";
import { AuthCard } from "../../components/auth/auth-card";

export const metadata: Metadata = { title: "Aceitar convite — plugga-os" };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthCard
      title="Bem-vindo(a) ao plugga-os"
      description="Defina sua senha para concluir o convite."
      footer={<a href="/login">Voltar para o login</a>}
    >
      <AcceptInviteForm token={token} />
    </AuthCard>
  );
}
