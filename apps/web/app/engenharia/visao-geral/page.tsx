import { alcancaTela, companyKeys } from "@plugga/shared";

import { EstadoDaApi } from "../../components/estado-da-api";
import { VisaoGeralDaEngenhariaView } from "../../components/engenharia/visao-geral-view";
import { fetchOpcoesDaEngenharia, fetchProtocolos, fetchVisaoGeralDaEngenharia } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";

export default async function VisaoGeralDaEngenhariaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/engenharia/visao-geral");
  const parametros = await searchParams;
  const empresa = companyKeys.find((e) => e === parametros.empresa);
  // O bloco de Protocolos (PLU-348) só para quem tem a tela; os da Engenharia, em andamento.
  const comProtocolos = alcancaTela(sessao.acesso, "engenharia-obras.protocolos");
  const [dados, opcoes, protocolos] = await Promise.all([
    fetchVisaoGeralDaEngenharia({ empresa }),
    fetchOpcoesDaEngenharia(),
    comProtocolos ? fetchProtocolos({ grupo: "em_andamento", departamento: "engenharia-obras", empresa }) : Promise.resolve(null),
  ]);
  if (!dados.ok) return <EstadoDaApi erro={dados.erro} eyebrow="Visão geral" />;
  return <VisaoGeralDaEngenhariaView dados={dados.dados} empresa={empresa} opcoes={opcoes.ok ? opcoes.dados : null} protocolos={protocolos?.ok ? protocolos.dados : null} />;
}
