import type { Acesso } from "@plugga/shared";

import { integracoesParaAcesso } from "../lib/integracoes";
import { IntegracaoBrevo } from "./integracao-brevo";
import { IntegracaoCadastro } from "./integracao-cadastro";
import { IntegracaoGoogleOAuth } from "./integracao-google-oauth";
import styles from "./integracoes.module.css";

/**
 * Integrações: cada uma é um cartão, e a pessoa só vê as do catálogo que o papel
 * dela alcança (`integracoesParaAcesso`). A integração nova entra no catálogo e
 * aqui; título e descrição vêm do cabeçalho da página.
 */
export function IntegracoesView({ acesso }: { acesso: Acesso }) {
  const visiveis = integracoesParaAcesso(acesso);

  return (
    <div className={styles.catalogo}>
      {visiveis.map((integracao) => {
        switch (integracao.id) {
          case "brevo":
            return <IntegracaoBrevo key={integracao.id} />;
          case "cadastro":
            return <IntegracaoCadastro key={integracao.id} />;
          case "google-oauth":
            return <IntegracaoGoogleOAuth key={integracao.id} />;
        }
      })}
    </div>
  );
}
