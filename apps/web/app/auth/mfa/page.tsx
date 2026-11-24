import { AuthCard } from "../../components/auth/auth-card";
import { MfaChallenge } from "../../components/auth/mfa-challenge";

export const metadata = { title: "Confirmar acesso · plugga-os" };
export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams?: Promise<{ redirectTo?: string }> }) {
  const params = searchParams ? await searchParams : {};
  return <AuthCard variant="single"><MfaChallenge redirectTo={params.redirectTo} /></AuthCard>;
}
