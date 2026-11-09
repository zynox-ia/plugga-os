"use client";

import { Bell, Cable, KeyRound, ShieldCheck, Terminal, UserRound, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import type {
  EmailStatus,
  IntegrationSummary,
  JobRunInventoryItem,
  ListaDaEquipe,
} from "@plugga/shared";

import { EstadoDaApi } from "../components/estado-da-api";
import type { ErroDeApi } from "../lib/api-core";
import { ChaveLlmView } from "./chave-llm-view";
import { IntegracoesView } from "../components/integracoes-view";
import { ShellCard, StatusPill } from "../components/plugga-shell";
import { CONFIGURACOES, ROTULO_DO_PAPEL, configuracoesParaAcesso } from "../lib/organizacao";
import { useSessionUser } from "../lib/use-session-user";
import styles from "./configuracoes.module.css";
import { DesenvolvedorView } from "./desenvolvedor-view";
import { EquipeView } from "./equipe-view";
import { NotificacoesView } from "./notificacoes-view";
import { PerfilView } from "./perfil-view";
import { SegurancaDaContaView } from "./seguranca-da-conta-view";

const ICONE_DA_SECAO: Record<string, ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>> = {
  perfil: UserRound,
  seguranca: ShieldCheck,
  notificacoes: Bell,
  equipe: Users,
  integracoes: Cable,
  "chave-llm": KeyRound,
  desenvolvedor: Terminal,
};

export type ConfiguracoesViewProps = {
  abaInicial?: string | null;
  erroIntegracoes?: ErroDeApi | null;
  erroJobs?: ErroDeApi | null;
  equipeInicial: ListaDaEquipe | null;
  integracoesDados?: {
    items: IntegrationSummary[];
    isLive: boolean;
    emailStatus: EmailStatus;
    isEmailStatusLive: boolean;
  } | null;
  jobsDados?: {
    items: JobRunInventoryItem[];
    isLive: boolean;
  } | null;
};

/**
 * Configurações com navegação própria em abas lineares:
 * O que se ajusta fica reunido aqui, filtrado pelo papel da sessão.
 */
export function ConfiguracoesView({
  abaInicial,
  equipeInicial,
  integracoesDados,
  jobsDados,
  erroIntegracoes,
  erroJobs,
}: ConfiguracoesViewProps) {
  const { usuario, carregando } = useSessionUser();

  const visiveis = useMemo(() => usuario ? configuracoesParaAcesso(usuario.acesso) : [], [usuario]);

  const [ativa, setAtiva] = useState<string | undefined>();
  const [equipe, setEquipe] = useState(equipeInicial);

  // Sincroniza a aba ativa quando as seções visíveis ou o abaInicial mudarem
  useEffect(() => {
    if (abaInicial && visiveis.length > 0) {
      setAtiva(abaInicial);
    }
  }, [abaInicial, visiveis]);

  const secao = visiveis.find((item) => item.id === ativa) ?? visiveis[0];

  function trocarAba(indice: number) {
    const item = visiveis[indice];
    setAtiva(item?.id);
    if (item?.id && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("aba", item.id);
      window.history.replaceState(null, "", url.toString());
    }
  }

  if (carregando) {
    return (
      <ShellCard className="panel-card">
        <p className="card-note">Carregando permissões…</p>
      </ShellCard>
    );
  }

  if (visiveis.length === 0) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Configurações</span>
            <h2>Sem acesso a esta área</h2>
          </div>
        </div>
        <p className="card-note">
          Nenhuma seção de configuração está liberada para o seu papel. Fale com um
          administrador se precisar de acesso.
        </p>
        <p className="card-note">
          {CONFIGURACOES.length} seções existem no sistema; o seu papel não alcança nenhuma.
        </p>
      </ShellCard>
    );
  }

  return (
    <div className="config-layout">
      <nav className={`config-nav ${styles.navegacaoAbas}`} aria-label="Seções de configuração" role="tablist">
        {visiveis.map((item, indice) => {
          const IconeComp = item.id ? ICONE_DA_SECAO[item.id] : null;
          const selecionado = item === secao;
          return (
            <button
              key={item.label}
              type="button"
              role="tab"
              id={`config-aba-${item.id}`}
              aria-controls={`config-painel-${item.id}`}
              aria-selected={selecionado}
              tabIndex={selecionado ? 0 : -1}
              className={styles.abaBotao}
              onClick={() => trocarAba(indice)}
              onKeyDown={(evento) => {
                const proximo = evento.key === "ArrowRight" ? (indice + 1) % visiveis.length
                  : evento.key === "ArrowLeft" ? (indice - 1 + visiveis.length) % visiveis.length
                  : evento.key === "Home" ? 0 : evento.key === "End" ? visiveis.length - 1 : null;
                if (proximo === null) return;
                evento.preventDefault();
                trocarAba(proximo);
                const botoes = evento.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                botoes?.[proximo]?.focus();
              }}
            >
              {IconeComp ? <IconeComp size={16} aria-hidden={true} /> : null}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={secao?.id === "equipe" ? "equipe-layout" : undefined} role="tabpanel" id={`config-painel-${secao?.id}`} aria-labelledby={`config-aba-${secao?.id}`} tabIndex={0}>
      {secao?.id === "perfil" ? (
        <PerfilView />
      ) : secao?.id === "seguranca" ? (
        <SegurancaDaContaView />
      ) : secao?.id === "notificacoes" ? (
        <NotificacoesView />
      ) : secao?.id === "equipe" ? (
        <EquipeView inicial={equipe} aoCarregar={setEquipe} />
      ) : secao?.id === "chave-llm" ? (
        <ChaveLlmView />
      ) : secao?.id === "integracoes" && erroIntegracoes ? (
        <EstadoDaApi erro={erroIntegracoes} eyebrow="Integrações" />
      ) : secao?.id === "integracoes" && integracoesDados ? (
        <IntegracoesView
          items={integracoesDados.items}
          isLive={integracoesDados.isLive}
          emailStatus={integracoesDados.emailStatus}
          isEmailStatusLive={integracoesDados.isEmailStatusLive}
        />
      ) : secao?.id === "desenvolvedor" ? (
        <DesenvolvedorView jobsDados={jobsDados} erroJobs={erroJobs} />
      ) : (
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Configurações</span>
              <h2>{secao?.label}</h2>
            </div>
            <StatusPill variant={secao?.status === "em-breve" ? "neutral" : "success"}>
              {secao?.status === "em-breve" ? "Em breve" : "Disponível"}
            </StatusPill>
          </div>

          <p className="card-note">{secao?.descricao}</p>

          <p className="card-note">
            Visível a partir de: <b>{secao ? ROTULO_DO_PAPEL[secao.minimo] : ""}</b>.
          </p>
        </ShellCard>
      )}
      </div>
    </div>
  );
}
