import { redirect } from "next/navigation";

import { exigirPagina } from "../lib/exigir-pagina";

/** Rota antiga: as integrações vivem na aba de Configurações. */
export default async function IntegracoesPage() {
  await exigirPagina("/integracoes");
  redirect("/configuracoes?aba=integracoes");
}
