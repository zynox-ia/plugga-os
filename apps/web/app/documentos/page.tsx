import { PlaceholderScreen } from "../components/placeholder-screen";
import { exigirPagina } from "../lib/exigir-pagina";

export default async function DocumentosPage() {
  await exigirPagina("/documentos");
  return (
    <PlaceholderScreen
      title="Documentos"
      description="Repositório e organização de documentos operacionais entram em uma etapa futura deste bloco."
      status="em-construcao"
    />
  );
}
