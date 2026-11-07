import { fetchEquipe } from "../lib/api";
import { exigirPagina } from "../lib/exigir-pagina";
import { configuracoesParaAcesso } from "../lib/organizacao";
import { ConfiguracoesView } from "./configuracoes-view";

export const metadata = { title: "Configurações · plugga-os" };

/**
 * Só pré-carrega a equipe quando a sessão alcança essa seção.
 */
export default async function ConfiguracoesPage() {
  const usuario = await exigirPagina("/configuracoes");
  const veEquipe = configuracoesParaAcesso(usuario.acesso).some((secao) => secao.id === "equipe");
  const equipe = veEquipe ? await fetchEquipe() : null;
  return <ConfiguracoesView equipeInicial={equipe?.ok ? equipe.dados : null} />;
}
