import { notFound } from "next/navigation";

import { CentroDeCustoView } from "../../components/financeiro/centro-de-custo-view";
import { exigirPagina } from "../../lib/exigir-pagina";
import { clientesDeExemplo, lerFiltrosDosProjetos, PROJETOS_DE_EXEMPLO, ROTA_DO_CENTRO_DE_CUSTO } from "../../lib/prototipo-centro-de-custo";
import { prototipoDoCentroDeCustoHabilitado } from "../../lib/recursos";

/**
 * Centro de custo (PLU-362): PROTÓTIPO VISUAL com dados de exemplo, para o André
 * avaliar o desenho antes da API e do banco. Só existe em desenvolvimento: no
 * build de produção, 404 (o middleware responde antes; isto é a segunda barreira).
 */
export default async function CentroDeCustoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!prototipoDoCentroDeCustoHabilitado()) notFound();
  await exigirPagina(ROTA_DO_CENTRO_DE_CUSTO);
  const filtros = lerFiltrosDosProjetos(await searchParams);
  return <CentroDeCustoView filtros={filtros} projetos={PROJETOS_DE_EXEMPLO} clientes={clientesDeExemplo()} />;
}
