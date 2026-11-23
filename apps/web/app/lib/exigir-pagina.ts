import "server-only";

import { notFound, redirect } from "next/navigation";
import { sessionUserSchema } from "@plugga/shared";

import { podeAbrirPagina } from "./acesso-paginas";
import { lerApi } from "./api-client";
import { ROTA_DE_API_INDISPONIVEL } from "./sessao-do-middleware";

/**
 * Revalida antes de ler dados ou renderizar, inclusive sem passar pelo middleware.
 * Só 401/403 querem dizer "sem sessão" e levam ao login; com a API fora do ar
 * (rede, tempo, 5xx), vai para o aviso de API indisponível guardando o destino,
 * sem derrubar a sessão (PLU-343).
 */
export async function exigirPagina(caminho: string) {
  const sessao = await lerApi("/auth/me", sessionUserSchema);
  if (!sessao.ok) {
    if (sessao.erro.tipo === "naoAutenticado" || sessao.erro.tipo === "proibido") redirect(`/login?redirectTo=${encodeURIComponent(caminho)}`);
    redirect(`${ROTA_DE_API_INDISPONIVEL}?de=${encodeURIComponent(caminho)}`);
  }
  if (!podeAbrirPagina(sessao.dados.acesso, caminho)) notFound();
  return sessao.dados;
}
