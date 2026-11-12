import type { Acesso } from "@plugga/shared";

import { integracoesParaAcesso, type EscopoDaIntegracao } from "../lib/integracoes";
import { IntegracaoBrevo } from "./integracao-brevo";
import { IntegracaoCadastro } from "./integracao-cadastro";
import { IntegracaoTelegram } from "./integracao-telegram";
import { IntegracaoAutentique } from "./integracao-autentique";
import { IntegracaoOmie } from "./integracao-omie";
import { IntegracaoOpenRouter } from "./integracao-openrouter";
import { IntegracaoGoogleCalendar } from "./integracao-google-calendar";
import { IntegracaoGoogleOAuth } from "./integracao-google-oauth";
import styles from "./integracoes.module.css";

/**
 * Integrações: cada uma é um cartão, e a pessoa só vê as do catálogo que o papel
 * dela alcança (`integracoesParaAcesso`). O `escopo` separa os dois lugares: as
 * pessoais na aba Integrações, as de plataforma na tela do Desenvolvedor. A
 * integração nova entra no catálogo e aqui.
 */
export function IntegracoesView({ acesso, escopo }: { acesso: Acesso; escopo: EscopoDaIntegracao }) {
  const visiveis = integracoesParaAcesso(acesso, escopo);

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
            return <IntegracaoOmie key={integracao.id} />;
          case "openrouter":
            return <IntegracaoOpenRouter key={integracao.id} />;
          case "google-oauth":
            return <IntegracaoGoogleOAuth key={integracao.id} />;
          case "google-calendar":
            return <IntegracaoGoogleCalendar key={integracao.id} />;
        }
      })}
    </div>
  );
}
