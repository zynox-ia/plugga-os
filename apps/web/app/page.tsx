import { DashboardView } from "./components/dashboard-view";
import { PendenciasView } from "./components/pendencias-view";
import { fetchHealth } from "./lib/api";

/**
 * Início: cartões de situação seguidos da fila do que precisa de você.
 *
 * Antes eram duas telas — Dashboard e Central de Pendências — competindo pelo
 * mesmo lugar na barra e pela mesma pergunta na cabeça de quem entra. Os
 * indicadores de cada processo vivem dentro do seu departamento (é lá que se
 * pergunta "como está a saúde do compras"), então esta tela não precisa
 * carregá-los e pode responder só "o que precisa de mim hoje".
 */
export default async function InicioPage() {
  const health = await fetchHealth();

  return (
    <>
      <DashboardView health={health} />
      {/* Alvo da âncora "Ver Central de Pendências" do dashboard. */}
      <div id="pendencias">
        <PendenciasView />
      </div>
    </>
  );
}
