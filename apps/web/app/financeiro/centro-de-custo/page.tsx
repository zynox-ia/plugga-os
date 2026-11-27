import { notFound } from "next/navigation";

import { CentroDeCustoView } from "../../components/financeiro/centro-de-custo-view";
import { podeAbrirPagina } from "../../lib/acesso-paginas";
import { exigirPagina } from "../../lib/exigir-pagina";
import { lerFiltrosDosProjetos, ROTA_DO_CENTRO_DE_CUSTO } from "../../lib/prototipo-centro-de-custo";
// Os exemplos só carregam aqui, no servidor, e descem por props depois da trava.
import { clientesDeExemplo, PROJETOS_DE_EXEMPLO } from "../../lib/prototipo-centro-de-custo-exemplos";
import { prototipoDoCentroDeCustoHabilitado } from "../../lib/recursos";

/**
 * Centro de custo (PLU-362): PROTÓTIPO VISUAL com dados de exemplo, para o André
 * avaliar o desenho antes da API e do banco. Só existe em desenvolvimento: no
 * build de produção, 404 (o middleware responde antes; isto é a segunda barreira).
 * `?projeto=<id>` abre a ficha do projeto em modal por cima da lista.
 */
export default async function CentroDeCustoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!prototipoDoCentroDeCustoHabilitado()) notFound();
  const sessao = await exigirPagina(ROTA_DO_CENTRO_DE_CUSTO);
  const parametros = await searchParams;
  const clientes = clientesDeExemplo();
  const filtros = lerFiltrosDosProjetos(parametros, clientes.map((c) => c.id));
  const projetoAberto = PROJETOS_DE_EXEMPLO.some((p) => p.id === parametros.projeto) ? parametros.projeto! : null;
  // O link para a origem só aparece a quem abre a tela dela; os outros veem o código como texto.
  const abre = {
    lancamentos: podeAbrirPagina(sessao.acesso, "/financeiro/lancamentos"),
    compras: podeAbrirPagina(sessao.acesso, "/suprimentos/compras"),
    estoque: podeAbrirPagina(sessao.acesso, "/suprimentos/estoque"),
    clientes: podeAbrirPagina(sessao.acesso, "/clientes"),
    projetos: podeAbrirPagina(sessao.acesso, "/engenharia/obras"),
  };
  return <CentroDeCustoView filtros={filtros} projetos={PROJETOS_DE_EXEMPLO} clientes={clientes} projetoAberto={projetoAberto} abre={abre} />;
}
