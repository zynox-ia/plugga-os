import { notFound } from "next/navigation";

import { CentroDeCustoView } from "../../components/financeiro/centro-de-custo-view";
import { podeAbrirPagina } from "../../lib/acesso-paginas";
import { exigirPagina } from "../../lib/exigir-pagina";
import { lerFiltrosDosProjetos, ROTA_DO_CENTRO_DE_CUSTO } from "../../lib/prototipo-centro-de-custo";

/**
 * Centro de custo (PLU-362): PROTÓTIPO VISUAL com dados de exemplo, para o André
 * avaliar o desenho antes da API e do banco. Só no desenvolvimento e nos testes;
 * na produção, 404 (o middleware já responde antes; isto é a segunda barreira).
 * `?projeto=<id>` abre a ficha do projeto em modal por cima da lista.
 *
 * Os exemplos não entram em nenhum build de produção, nem no do servidor: a
 * condição vai escrita por extenso (sem `prototipoDoCentroDeCustoHabilitado()`),
 * porque o webpack troca `process.env.NODE_ENV` pelo valor do build e, com
 * "production", o ramo inteiro some, com o `import()` dos exemplos; sem ele, o
 * chunk dos exemplos nem é gerado. O mesmo padrão das Notas fiscais (PLU-361);
 * o teste prototipo-centro-de-custo.test.ts confere.
 */
export default async function CentroDeCustoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    // A guarda vem antes de qualquer leitura, inclusive a dos exemplos.
    const sessao = await exigirPagina(ROTA_DO_CENTRO_DE_CUSTO);
    const [parametros, { clientesDeExemplo, PROJETOS_DE_EXEMPLO }] = await Promise.all([
      searchParams,
      import("../../lib/prototipo-centro-de-custo-exemplos"),
    ]);
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
  notFound();
}
