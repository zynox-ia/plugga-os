import type { Acesso } from "@plugga/shared";

import { integracoesParaAcesso } from "../lib/integracoes";
import { financeiroHabilitado } from "../lib/recursos";
import { IntegracaoBrevo } from "./integracao-brevo";
import { IntegracaoCadastro } from "./integracao-cadastro";
import { IntegracaoTelegram } from "./integracao-telegram";
import { IntegracaoAutentique } from "./integracao-autentique";
import { IntegracaoOmie } from "./integracao-omie";
import { IntegracaoOmieContaUnica } from "./integracao-omie-conta-unica";
import { IntegracaoOpenRouter } from "./integracao-openrouter";
import { IntegracaoAssinaturaIa } from "./integracao-assinatura-ia";
import { IntegracaoGoogleCalendar } from "./integracao-google-calendar";
import { IntegracaoGoogleOAuth } from "./integracao-google-oauth";
import styles from "./integracoes.module.css";

/**
 * Integrações: cada uma é um cartão, e a pessoa só vê as do catálogo que o papel
 * dela alcança (`integracoesParaAcesso`). O `escopo` diz o lugar: "pessoal" é a aba
 * Integrações (as pessoais e o OMIE, que o Financeiro gere) e "plataforma" é a
 * tela do Desenvolvedor. A integração nova entra no catálogo e aqui.
 */
export function IntegracoesView({ acesso, escopo }: { acesso: Acesso; escopo: "pessoal" | "plataforma" }) {
  const visiveis = integracoesParaAcesso(acesso, escopo === "pessoal" ? "integracoes" : "desenvolvedor");

  return (
    <div className={styles.catalogo}>
      {visiveis.map((integracao) => {
        switch (integracao.id) {
          case "brevo":
            return <IntegracaoBrevo key={integracao.id} />;
          case "cadastro":
            return <IntegracaoCadastro key={integracao.id} />;
          case "telegram":
            return <IntegracaoTelegram key={integracao.id} />;
          case "autentique":
            return <IntegracaoAutentique key={integracao.id} />;
          case "omie":
            // Portão do Financeiro: aberto, o cartão por empresa; fechado (produção), o da conta única.
            return financeiroHabilitado() ? <IntegracaoOmie key={integracao.id} acesso={acesso} /> : <IntegracaoOmieContaUnica key={integracao.id} />;
          case "openrouter":
            return <IntegracaoOpenRouter key={integracao.id} />;
          case "claude-assinatura":
            return <IntegracaoAssinaturaIa key={integracao.id} provedor="claude" />;
          case "codex-assinatura":
            return <IntegracaoAssinaturaIa key={integracao.id} provedor="codex" />;
          case "google-oauth":
            return <IntegracaoGoogleOAuth key={integracao.id} />;
          case "google-calendar":
            return <IntegracaoGoogleCalendar key={integracao.id} />;
        }
      })}
    </div>
  );
}
