import { notFound } from "next/navigation";

import { PaginaDoProjeto } from "../../../components/financeiro/pagina-do-projeto";
import { podeAbrirPagina } from "../../../lib/acesso-paginas";
import { exigirPagina } from "../../../lib/exigir-pagina";
import { hrefDoProjeto } from "../../../lib/prototipo-centro-de-custo";

/**
 * O centro de custo de um projeto em página inteira (PLU-362), PROTÓTIPO com dados
 * de exemplo; só no desenvolvimento e nos testes. A primeira forma, mantida para o
 * André comparar com a ficha em modal (`/financeiro/centro-de-custo?projeto=<id>`).
 * Os exemplos chegam por `import()` dentro do ramo do NODE_ENV escrito por extenso,
 * para não existirem no build de produção (ver a página da lista).
 */
export default async function ProjetoDoCentroDeCustoPage({ params }: { params: Promise<{ projeto: string }> }) {
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    const { projeto: id } = await params;
    const [sessao, { PROJETOS_DE_EXEMPLO, projetoDeExemplo }] = await Promise.all([
      exigirPagina(hrefDoProjeto(id)),
      import("../../../lib/prototipo-centro-de-custo-exemplos"),
    ]);
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
    return <PaginaDoProjeto projeto={projeto} outros={outros} abre={abre} />;
  }
  notFound();
}
