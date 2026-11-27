import { EmptyState } from "../../components/ui";
import { exigirPagina } from "../../lib/exigir-pagina";

/** Relatórios do Financeiro (PLU-360): a tela abre com a tela de Relatórios; o primeiro relatório vem a seguir. */
export default async function RelatoriosDoFinanceiroPage() {
  await exigirPagina("/financeiro/relatorios");
  return (
    <EmptyState title="Relatórios do Financeiro">
      O relatório por grupo e categoria chega a esta tela em seguida.
    </EmptyState>
  );
}
