import { PlaceholderScreen } from "../../components/placeholder-screen";
import { exigirPagina } from "../../lib/exigir-pagina";

export default async function AtividadesPage() {
  await exigirPagina("/comercial/atividades");
  return (
    <PlaceholderScreen
      title="Atividades"
      description="As suas tarefas, ligações, reuniões e visitas, separadas em atrasadas, de hoje e dos próximos dias, cada uma ligada ao negócio e ao cliente. A tela está sendo construída."
      status="em-construcao"
    />
  );
}
