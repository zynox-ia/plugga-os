import { EstadoDaApi } from "../../components/estado-da-api";
import { EngrenagemDoFinanceiro } from "../../components/financeiro/engrenagem-do-financeiro";
import { TarefasView } from "../../components/tarefas/tarefas-view";
import { podeAbrirPagina } from "../../lib/acesso-paginas";
import { fetchOpcoesDeTarefas, fetchOpcoesDoFinanceiro, fetchTarefas } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDeTarefas, lerFiltrosDeTarefas, type ConfiguracaoDeTarefas } from "../../lib/tarefas";

/**
 * O que é do Financeiro na tela compartilhada de Tarefas (PLU-340; antes "Rotinas
 * do dia"). O atalho só aparece para quem abre a tela dele: quem tem só Fiscal
 * ou só Conciliação não vê um link para Lançamentos. A Conciliação ganha o dela
 * quando a tela chegar (PLU-339).
 */
function configuracao(abreLancamentos: boolean): ConfiguracaoDeTarefas {
  return {
    departamento: "financeiro",
    rota: "/financeiro/tarefas",
    nomeDoDepartamento: "o Financeiro",
    exemplo: { titulo: "Conferir as notas fiscais do Portal Nacional", item: "Baixar o relatório do portal" },
    atalhos: abreLancamentos ? { lancamentos: { href: "/financeiro/lancamentos", rotulo: "Abrir os lançamentos" } } : {},
    // Texto do protótipo em vigor (#rotinas): a antiga rotina de copiar comprovantes saiu (PLU-337).
    nota: "Copiar comprovantes deixou de ser tarefa: o comprovante fica guardado no próprio lançamento.",
  };
}

export default async function TarefasDoFinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/financeiro/tarefas");
  const filtros = lerFiltrosDeTarefas(await searchParams);
  const [resposta, opcoes, opcoesDoFinanceiro] = await Promise.all([
    fetchTarefas("financeiro", consultaDeTarefas(filtros)),
    fetchOpcoesDeTarefas("financeiro"),
    fetchOpcoesDoFinanceiro(),
  ]);
  if (!resposta.ok) return <EstadoDaApi erro={resposta.erro} eyebrow="Tarefas" />;
  return <TarefasView config={configuracao(podeAbrirPagina(sessao.acesso, "/financeiro/lancamentos"))} filtros={filtros} resposta={resposta.dados} opcoes={opcoes.ok ? opcoes.dados : null}
    acoesDoCabecalho={opcoesDoFinanceiro.ok ? <EngrenagemDoFinanceiro opcoes={opcoesDoFinanceiro.dados} /> : null} />;
}
