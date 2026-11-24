import { ContratosView } from "../../components/contratos-view";
import { EstadoDaApi } from "../../components/estado-da-api";
import { fetchContracts } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";
import { resolverEstado } from "../../lib/estado-da-api";
import { FALLBACK_CONTRACTS } from "../../lib/mock/commercial";

export default async function ContratosPage() {
  await exigirPagina("/comercial/contratos");
  const estado = resolverEstado(await fetchContracts(), (resposta) => resposta.items, FALLBACK_CONTRACTS);
  if (estado.estado === "erro") return <EstadoDaApi erro={estado.erro} eyebrow="Comercial" />;

  return <ContratosView items={estado.dados} isLive={estado.estado === "ok"} />;
}
