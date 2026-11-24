import { redirect } from "next/navigation";

import { hrefDaFicha } from "../../lib/clientes";
import { exigirPagina } from "../../lib/exigir-pagina";

/** A ficha agora abre em modal sobre a lista; links antigos para `/clientes/<id>` continuam funcionando. */
export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPagina("/clientes");
  const { id } = await params;
  redirect(hrefDaFicha(id));
}
