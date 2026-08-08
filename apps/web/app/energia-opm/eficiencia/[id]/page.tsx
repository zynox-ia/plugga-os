import { notFound } from "next/navigation";

import { EstudoDetalheView } from "../../../components/estudo-detalhe-view";
import { fetchEnergyStudy } from "../../../lib/api";

export default async function EstudoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const estudo = await fetchEnergyStudy(id);

  if (!estudo) notFound();

  return <EstudoDetalheView estudo={estudo} />;
}
