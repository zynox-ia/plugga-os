import { alcancaDepartamento } from "@plugga/shared";

import { EstadoDaApi } from "../../components/estado-da-api";
import { ProtocolosView } from "../../components/engenharia/protocolos-view";
import { fetchOpcoesDaEngenharia, fetchOpcoesDosProtocolos, fetchProtocolo, fetchProtocolos } from "../../lib/api";
import { hojeEmManaus } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDosProtocolos, ehUuidDeProtocolo, lerFiltrosDosProtocolos, soVencendo } from "../../lib/protocolos";

export default async function ProtocolosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/engenharia/protocolos");
  const parametros = await searchParams;
  const filtros = lerFiltrosDosProtocolos(parametros);
  // As Configurações (plataformas, tipos de O.S., distribuidoras) são da Engenharia.
  const daEngenharia = alcancaDepartamento(sessao.acesso, "engenharia-obras");

  const [lista, opcoes, ficha, opcoesDaEngenharia] = await Promise.all([
    fetchProtocolos(consultaDosProtocolos(filtros)),
    fetchOpcoesDosProtocolos(),
    ehUuidDeProtocolo(parametros.protocolo) ? fetchProtocolo(parametros.protocolo) : Promise.resolve(null),
    daEngenharia ? fetchOpcoesDaEngenharia() : Promise.resolve(null),
  ]);
  if (!lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Protocolos" />;

  // "Data-limite em 7 dias" pede os em andamento à API e corta aqui.
  const dados = filtros.situacao === "vencendo" ? { ...lista.dados, itens: soVencendo(lista.dados.itens), total: soVencendo(lista.dados.itens).length } : lista.dados;
  const falhaDaFicha = !parametros.protocolo || ficha?.ok ? null : ficha && ficha.erro.tipo !== "naoEncontrado" ? "indisponivel" : "nao_encontrado";

  return <ProtocolosView filtros={filtros} lista={dados} opcoes={opcoes.ok ? opcoes.dados : null} opcoesDaEngenharia={opcoesDaEngenharia?.ok ? opcoesDaEngenharia.dados : null}
    ficha={ficha?.ok ? ficha.dados : null} falhaDaFicha={falhaDaFicha} podeConfigurar={daEngenharia} hoje={hojeEmManaus()} />;
}
