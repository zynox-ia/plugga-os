import { notFound } from "next/navigation";

import { ProjetoDoCentroDeCusto } from "../../../components/financeiro/projeto-do-centro-de-custo";
import { podeAbrirPagina } from "../../../lib/acesso-paginas";
import { exigirPagina } from "../../../lib/exigir-pagina";
import { hrefDoProjeto } from "../../../lib/prototipo-centro-de-custo";
import { PROJETOS_DE_EXEMPLO, projetoDeExemplo } from "../../../lib/prototipo-centro-de-custo-exemplos";
import { prototipoDoCentroDeCustoHabilitado } from "../../../lib/recursos";

/** O centro de custo de um projeto (PLU-362), PROTÓTIPO com dados de exemplo; só em desenvolvimento. */
export default async function ProjetoDoCentroDeCustoPage({ params }: { params: Promise<{ projeto: string }> }) {
  if (!prototipoDoCentroDeCustoHabilitado()) notFound();
  const { projeto: id } = await params;
  const sessao = await exigirPagina(hrefDoProjeto(id));
  const projeto = projetoDeExemplo(id);
  if (!projeto) notFound();
  const outros = PROJETOS_DE_EXEMPLO.filter((p) => p.cliente.id === projeto.cliente.id && p.id !== projeto.id);
  // O link para a origem só aparece a quem abre a tela dela; os outros veem o código como texto.
  const abre = {
    lancamentos: podeAbrirPagina(sessao.acesso, "/financeiro/lancamentos"),
    compras: podeAbrirPagina(sessao.acesso, "/suprimentos/compras"),
    estoque: podeAbrirPagina(sessao.acesso, "/suprimentos/estoque"),
    clientes: podeAbrirPagina(sessao.acesso, "/clientes"),
    projetos: podeAbrirPagina(sessao.acesso, "/engenharia/obras"),
  };
  return <ProjetoDoCentroDeCusto projeto={projeto} outros={outros} abre={abre} />;
}
