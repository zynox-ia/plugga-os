import { fetchEquipe } from "../lib/api";
import { ConfiguracoesView } from "./configuracoes-view";

export const metadata = { title: "Configurações · plugga-os" };

/**
 * A lista da equipe vem junto com a página: buscá-la no navegador depois de
 * montar a tela somava uma segunda ida ao servidor a cada abertura. Sem acesso
 * ou com a API fora do ar, a tela busca de novo e mostra o erro dela.
 */
export default async function ConfiguracoesPage() {
  const equipe = await fetchEquipe();
  return <ConfiguracoesView equipeInicial={equipe.ok ? equipe.dados : null} />;
}
