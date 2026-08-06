"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Best-effort: the session cookie may already be gone server-side.
    } finally {
      router.push("/login");
    }
  }

  return (
    <button
      type="button"
      className="button button--small"
      onClick={handleLogout}
      disabled={pending}
    >
      {pending ? "Saindo…" : "Sair"}
    </button>
  );
}
