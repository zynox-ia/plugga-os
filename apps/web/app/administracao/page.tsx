import { PlaceholderScreen } from "../components/placeholder-screen";
import { exigirPagina } from "../lib/exigir-pagina";

/**
 * Rota herdada do Bloco A. Gestão de pessoas e acessos passou a viver em
 * Configurações → Equipe e Acessos; a rota fica de pé porque links antigos
 * ainda apontam para cá, e mandar embora sem dizer para onde é pior que um
 * cartão que aponta o caminho.
 */
export default async function AdministracaoPage() {
  await exigirPagina("/administracao");
  return (
    <PlaceholderScreen
      title="Administração"
      description="Pessoas, papéis e acessos agora ficam em Configurações → Equipe e Acessos, onde o acesso é sempre por empresa e departamento."
      status="em-construcao"
    />
  );
}
