import { EstadoDaApi } from "../../components/estado-da-api";
import { ObrasView } from "../../components/engenharia/obras-view";
import { fetchObra, fetchObras, fetchOpcoesDaEngenharia, fetchOpcoesDasObras } from "../../lib/api";
import { hojeEmManaus } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDasObras, ehUuidDeObra, lerFiltrosDasObras } from "../../lib/obras";

export default async function ObrasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirPagina("/engenharia/obras");
  const parametros = await searchParams;
  const filtros = lerFiltrosDasObras(parametros);
  const [lista, opcoes, ficha, opcoesDaEngenharia] = await Promise.all([
    fetchObras(consultaDasObras(filtros)),
    fetchOpcoesDasObras(),
    ehUuidDeObra(parametros.obra) ? fetchObra(parametros.obra) : Promise.resolve(null),
    fetchOpcoesDaEngenharia(),
  ]);
  if (!lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Obras" />;
  const falhaDaFicha = !parametros.obra || ficha?.ok ? null : ficha && ficha.erro.tipo !== "naoEncontrado" ? "indisponivel" : "nao_encontrada";

  return <ObrasView filtros={filtros} lista={lista.dados} opcoes={opcoes.ok ? opcoes.dados : null} opcoesDaEngenharia={opcoesDaEngenharia.ok ? opcoesDaEngenharia.dados : null}
    ficha={ficha?.ok ? ficha.dados : null} falhaDaFicha={falhaDaFicha} hoje={hojeEmManaus()} />;
}
