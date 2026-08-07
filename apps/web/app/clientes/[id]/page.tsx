import { notFound } from "next/navigation";

import { FichaClienteView } from "../../components/ficha-cliente-view";
import { fetchClientFicha } from "../../lib/api";

export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await fetchClientFicha(id);
  if (!ficha) notFound();

  return <FichaClienteView ficha={ficha} />;
}
