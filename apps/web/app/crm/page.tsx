import { PlaceholderScreen } from "../components/placeholder-screen";
import { exigirPagina } from "../lib/exigir-pagina";

export default async function CrmPage() {
  await exigirPagina("/crm");
  return (
    <PlaceholderScreen
      title="CRM"
      description="Leads e oportunidades, clientes, empresas, funil comercial, reativação PluggaMob e campanhas entram em uma etapa futura deste bloco."
      status="em-construcao"
    />
  );
}
