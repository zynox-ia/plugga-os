import { redirect } from "next/navigation";

import { hrefDaFicha } from "../../lib/clientes";

/** A ficha agora abre em modal sobre a lista; links antigos para `/clientes/<id>` continuam funcionando. */
export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(hrefDaFicha(id));
}
