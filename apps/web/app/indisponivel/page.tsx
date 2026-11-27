import { headers } from "next/headers";

import { EstadoDaApi } from "../components/estado-da-api";
import { TentarDeNovo } from "../components/tentar-de-novo";
import { CABECALHO_DO_CAMINHO, destinoDoAviso } from "../lib/sessao-do-middleware";

/**
 * API indisponível (PLU-343). O middleware reescreve para cá a página pedida,
 * mantendo o endereço, quando a sessão não pôde ser conferida por rede, tempo
 * ou erro do servidor; o destino vem no cabeçalho interno dele, não da query
 * da página (PLU-357). `?de=` vem do `exigirPagina`, quando a API cai entre o
 * middleware e a página. A pessoa continua logada: quando a API volta, segue
 * para onde ia, sem novo login.
 */
export default async function ApiIndisponivelPage({ searchParams }: { searchParams: Promise<{ de?: string | string[] }> }) {
  const { de } = await searchParams;
  const destino = destinoDoAviso((await headers()).get(CABECALHO_DO_CAMINHO), de);
  return <>
    <EstadoDaApi erro={{ tipo: "indisponivel", mensagem: "", status: null }} eyebrow="Plugga OS" />
    <TentarDeNovo destino={destino} />
  </>;
}
