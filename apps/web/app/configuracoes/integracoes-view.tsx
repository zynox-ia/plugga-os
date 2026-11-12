import { EmptyState } from "../components/ui";
import styles from "./configuracoes.module.css";

/**
 * Integrações da empresa: conexões da Plugga com sistemas externos, usadas
 * pelo back-end e pelas demais telas. Começa limpa; cada integração entra aqui
 * quando for construída. O título e a descrição vêm do cabeçalho da página.
 */
export function IntegracoesView() {
  return (
    <div className={styles.painel}>
      <EmptyState title="Nenhuma integração conectada">
        As integrações da empresa aparecerão aqui, com o estado de cada conexão.
      </EmptyState>
    </div>
  );
}
