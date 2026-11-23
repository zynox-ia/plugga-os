import { EstadoDaApi } from "../../components/estado-da-api";
import { TarefasView } from "../../components/tarefas/tarefas-view";
import { fetchOpcoesDeTarefas, fetchTarefas } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDeTarefas, lerFiltrosDeTarefas, type ConfiguracaoDeTarefas } from "../../lib/tarefas";

/** O que é da Engenharia na tela compartilhada de Tarefas (PLU-349). */
const CONFIGURACAO: ConfiguracaoDeTarefas = {
  departamento: "engenharia-obras",
  rota: "/engenharia/tarefas",
  nomeDoDepartamento: "a Engenharia",
  exemplo: { titulo: "Conferir o monitoramento das usinas da Solarman", item: "Anexar o print da plataforma" },
  // Usinas, Protocolos, Agenda e Obras ganham o atalho quando as telas chegarem (PLU-346 a PLU-350).
  atalhos: {},
};

export default async function TarefasDaEngenhariaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirPagina("/engenharia/tarefas");
  const filtros = lerFiltrosDeTarefas(await searchParams);
  const [resposta, opcoes] = await Promise.all([
    fetchTarefas("engenharia-obras", consultaDeTarefas(filtros)),
    fetchOpcoesDeTarefas("engenharia-obras"),
  ]);
  if (!resposta.ok) return <EstadoDaApi erro={resposta.erro} eyebrow="Tarefas" />;
  return <TarefasView config={CONFIGURACAO} filtros={filtros} resposta={resposta.dados} opcoes={opcoes.ok ? opcoes.dados : null} />;
}
