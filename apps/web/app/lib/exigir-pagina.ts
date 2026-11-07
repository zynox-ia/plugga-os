import "server-only";

import { notFound, redirect } from "next/navigation";
import { sessionUserSchema } from "@plugga/shared";

import { podeAbrirPagina } from "./acesso-paginas";
import { lerApi } from "./api-client";

/** Revalida antes de ler dados ou renderizar, inclusive sem passar pelo middleware. */
export async function exigirPagina(caminho: string) {
  const sessao = await lerApi("/auth/me", sessionUserSchema);
  if (!sessao.ok) redirect(`/login?redirectTo=${encodeURIComponent(caminho)}`);
  if (!podeAbrirPagina(sessao.dados.acesso, caminho)) notFound();
  return sessao.dados;
}
