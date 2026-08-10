import type { Metadata } from "next";

import { AuthCard } from "../components/auth/auth-card";
import { LoginForm } from "../components/auth/login-form";

export const metadata: Metadata = { title: "Entrar — Plugga OS" };

// Re-compile trigger
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <AuthCard>
      <LoginForm redirectTo={redirectTo} />
    </AuthCard>
  );
}
