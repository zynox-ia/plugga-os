import { notFound } from "next/navigation";

import { CentroDeCustoView } from "../../components/financeiro/centro-de-custo-view";
import { exigirPagina } from "../../lib/exigir-pagina";
import { lerFiltrosDosProjetos, ROTA_DO_CENTRO_DE_CUSTO } from "../../lib/prototipo-centro-de-custo";
// Os exemplos só carregam aqui, no servidor, e descem por props depois da trava.
import { clientesDeExemplo, PROJETOS_DE_EXEMPLO } from "../../lib/prototipo-centro-de-custo-exemplos";
import { prototipoDoCentroDeCustoHabilitado } from "../../lib/recursos";

/**
 * Centro de custo (PLU-362): PROTÓTIPO VISUAL com dados de exemplo, para o André
 * avaliar o desenho antes da API e do banco. Só existe em desenvolvimento: no
 * build de produção, 404 (o middleware responde antes; isto é a segunda barreira).
 */
export default async function CentroDeCustoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!prototipoDoCentroDeCustoHabilitado()) notFound();
  await exigirPagina(ROTA_DO_CENTRO_DE_CUSTO);
  const clientes = clientesDeExemplo();
  const filtros = lerFiltrosDosProjetos(await searchParams, clientes.map((c) => c.id));
  return <CentroDeCustoView filtros={filtros} projetos={PROJETOS_DE_EXEMPLO} clientes={clientes} />;
}
