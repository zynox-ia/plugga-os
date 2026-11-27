import { notFound } from "next/navigation";

import { NotasFiscaisView } from "../../components/financeiro/notas-fiscais-view";
import { fetchOpcoesDoFinanceiro } from "../../lib/api";
import { hojeEmManaus } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { prototipoDasNotasFiscais } from "../../lib/prototipo-das-notas-fiscais";

/**
 * Notas fiscais (PLU-361): PROTÓTIPO visual com dados de exemplo, para o André
 * aprovar o desenho antes do cadastro real. Só no desenvolvimento; na produção,
 * 404 (e o item do menu fica em breve). As notas não vêm da API: só as opções do
 * Financeiro, para a engrenagem do cabeçalho.
 */
export default async function NotasFiscaisPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!prototipoDasNotasFiscais()) notFound();
  await exigirPagina("/financeiro/notas-fiscais");
  const { lado } = await searchParams;
  const opcoes = await fetchOpcoesDoFinanceiro();
  return <NotasFiscaisView hoje={hojeEmManaus()} ladoInicial={lado === "saidas" ? "saida" : "entrada"} opcoes={opcoes.ok ? opcoes.dados : null} />;
}
