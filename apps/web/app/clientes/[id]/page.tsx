import { notFound } from "next/navigation";

import { EstadoDaApi } from "../../components/estado-da-api";
import { FichaClienteView } from "../../components/ficha-cliente-view";
import { fetchClientFicha } from "../../lib/api";

export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultado = await fetchClientFicha(id);

  if (!resultado.ok) {
    if (resultado.erro.tipo === "naoEncontrado") notFound();
    return <EstadoDaApi erro={resultado.erro} eyebrow="Clientes" voltar={{ href: "/clientes", rotulo: "Voltar à lista" }} />;
  }

  return <FichaClienteView ficha={resultado.dados} />;
}
