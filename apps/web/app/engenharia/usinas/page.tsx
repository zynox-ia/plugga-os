import { alcancaTela } from "@plugga/shared";

import { UsinasView } from "../../components/engenharia/usinas-view";
import { EstadoDaApi } from "../../components/estado-da-api";
import { fetchMonitoramentoDoDia, fetchOpcoesDaEngenharia, fetchPlataformas, fetchUsina, fetchUsinas } from "../../lib/api";
import { hojeEmManaus } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDasUsinas, ehUuidDeUsina, lerFiltrosDasUsinas } from "../../lib/usinas";

export default async function UsinasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/engenharia/usinas");
  const parametros = await searchParams;
  const filtros = lerFiltrosDasUsinas(parametros);
  const cadastro = filtros.aba === "cadastro";
  const [monitoramento, usinas, plataformas, ficha, opcoes] = await Promise.all([
    cadastro ? Promise.resolve(null) : fetchMonitoramentoDoDia({ empresa: filtros.empresa }),
    cadastro ? fetchUsinas(consultaDasUsinas(filtros)) : Promise.resolve(null),
    fetchPlataformas(),
    ehUuidDeUsina(parametros.usina) ? fetchUsina(parametros.usina) : Promise.resolve(null),
    fetchOpcoesDaEngenharia(),
  ]);
  if (monitoramento && !monitoramento.ok) return <EstadoDaApi erro={monitoramento.erro} eyebrow="Usinas" />;
  if (usinas && !usinas.ok) return <EstadoDaApi erro={usinas.erro} eyebrow="Usinas" />;

  return <UsinasView filtros={filtros} monitoramento={monitoramento?.ok ? monitoramento.dados : null} cadastro={usinas?.ok ? usinas.dados : null}
    plataformas={plataformas.ok ? plataformas.dados.itens : []} ficha={ficha?.ok ? ficha.dados : null} fichaNaoEncontrada={Boolean(parametros.usina) && !ficha?.ok}
    opcoes={opcoes.ok ? opcoes.dados : null} podeCadastrar={alcancaTela(sessao.acesso, "engenharia-obras.usinas")} hoje={hojeEmManaus()} />;
}
