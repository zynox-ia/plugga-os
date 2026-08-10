import { ComprasScorecardView } from "../../components/compras-scorecard-view";
import { fetchDiagnosticoCompras, fetchScorecardCompras } from "../../lib/api";
import { FALLBACK_SCORECARD } from "../../lib/mock/compras";
import { EMPRESA_PADRAO, isEmpresaId } from "../../lib/organizacao";

/**
 * Período padrão: o mês corrente. O POP fala em scorecard semanal nas reuniões
 * Level 10, mas a janela é escolha de quem lê — a rota aceita `de` e `ate`.
 */
function periodoPadrao(): { de: string; ate: string } {
  const agora = new Date();
  const de = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const ate = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0, 23, 59, 59));
  return { de: de.toISOString(), ate: ate.toISOString() };
}

export default async function ScorecardComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; de?: string; ate?: string }>;
}) {
  const { empresa, de, ate } = await searchParams;
  const ativa = isEmpresaId(empresa) ? empresa : EMPRESA_PADRAO;
  const padrao = periodoPadrao();
  const inicio = de ?? padrao.de;
  const fim = ate ?? padrao.ate;

  const [scorecard, diagnostico] = await Promise.all([
    fetchScorecardCompras(ativa, inicio, fim),
    fetchDiagnosticoCompras(ativa, inicio, fim),
  ]);

  return (
    <ComprasScorecardView
      scorecard={scorecard ?? FALLBACK_SCORECARD}
      diagnostico={diagnostico}
      empresa={ativa}
      isLive={scorecard !== null}
    />
  );
}
