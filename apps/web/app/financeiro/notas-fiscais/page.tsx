import { notFound } from "next/navigation";

import { EmptyState } from "../../components/ui";
import { exigirPagina } from "../../lib/exigir-pagina";
import { prototipoDasNotasFiscais } from "../../lib/prototipo-das-notas-fiscais";

/** Notas fiscais (PLU-361): protótipo visual, só no desenvolvimento; na produção, 404. */
export default async function NotasFiscaisPage() {
  if (!prototipoDasNotasFiscais()) notFound();
  await exigirPagina("/financeiro/notas-fiscais");
  return <EmptyState title="Notas fiscais">O protótipo desta tela chega aqui em seguida.</EmptyState>;
}
