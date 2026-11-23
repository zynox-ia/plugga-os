import { companyKeys } from "@plugga/shared";

import { EstadoDaApi } from "../../components/estado-da-api";
import { VisaoGeralDaEngenhariaView } from "../../components/engenharia/visao-geral-view";
import { fetchOpcoesDaEngenharia, fetchVisaoGeralDaEngenharia } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";

export default async function VisaoGeralDaEngenhariaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirPagina("/engenharia/visao-geral");
  const parametros = await searchParams;
  const empresa = companyKeys.find((e) => e === parametros.empresa);
  const [dados, opcoes] = await Promise.all([fetchVisaoGeralDaEngenharia({ empresa }), fetchOpcoesDaEngenharia()]);
  if (!dados.ok) return <EstadoDaApi erro={dados.erro} eyebrow="Visão geral" />;
  return <VisaoGeralDaEngenhariaView dados={dados.dados} empresa={empresa} opcoes={opcoes.ok ? opcoes.dados : null} />;
}
