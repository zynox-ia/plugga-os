import { AgendaView } from "../../components/engenharia/agenda-view";
import { EstadoDaApi } from "../../components/estado-da-api";
import { consultaDaAgenda, lerFiltrosDaAgenda } from "../../lib/agenda";
import { fetchAgendaDeCampo, fetchOpcoesDaEngenharia } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";

export default async function AgendaDeCampoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirPagina("/engenharia/agenda");
  const filtros = lerFiltrosDaAgenda(await searchParams);
  const [agenda, opcoes] = await Promise.all([fetchAgendaDeCampo(consultaDaAgenda(filtros)), fetchOpcoesDaEngenharia()]);
  if (!agenda.ok) return <EstadoDaApi erro={agenda.erro} eyebrow="Agenda de campo" />;
  return <AgendaView agenda={agenda.dados} filtros={filtros} opcoes={opcoes.ok ? opcoes.dados : null} />;
}
