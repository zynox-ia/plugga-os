import { IntegracaoBrevo } from "./integracao-brevo";
import styles from "./integracoes.module.css";

/**
 * Integrações da empresa: conexões da Plugga com sistemas externos, usadas pelo
 * back-end e pelas demais telas. Cada integração é um cartão; a próxima entra
 * aqui quando for construída. Título e descrição vêm do cabeçalho da página.
 */
export function IntegracoesView() {
  return (
    <div className={styles.catalogo}>
      <IntegracaoBrevo />
    </div>
  );
}
