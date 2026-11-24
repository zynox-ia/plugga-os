import { PlaceholderScreen } from "../components/placeholder-screen";
import { exigirPagina } from "../lib/exigir-pagina";

export default async function AgentesIaPage() {
  await exigirPagina("/agentes-ia");
  return (
    <PlaceholderScreen
      title="Agentes IA"
      description="Ações do agente (OpenClaw), auditoria de decisões e aprovações entram em uma etapa futura deste bloco."
      status="em-construcao"
    />
  );
}
