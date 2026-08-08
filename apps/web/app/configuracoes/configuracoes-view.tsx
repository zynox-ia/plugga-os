"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ShellCard, StatusPill } from "../components/plugga-shell";
import { CONFIGURACOES, configuracoesParaAcesso } from "../lib/organizacao";
import { useSessionUser } from "../lib/use-session-user";
import { EquipeView } from "./equipe-view";

/**
 * Configurações com navegação própria: o que se ajusta uma vez fica reunido
 * aqui, em vez de disputar espaço na barra lateral com o trabalho do dia.
 *
 * As seções são filtradas pelos papéis da sessão. A entrada em si aparece
 * sempre na barra — esconder o menu inteiro faz quem não tem acesso procurar
 * onde não existe, e o "você não tem acesso" é a resposta honesta.
 */
export function ConfiguracoesView() {
  const router = useRouter();
  const { usuario, carregando } = useSessionUser();
  const [ativa, setAtiva] = useState(0);

  const visiveis = usuario ? configuracoesParaAcesso(usuario) : [];
  const secao = visiveis[Math.min(ativa, Math.max(visiveis.length - 1, 0))];

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
      <nav className="config-nav" aria-label="Seções de configuração">
        {visiveis.map((item, indice) => (
          <button
            key={item.label}
            type="button"
            className={`config-nav-item${item === secao ? " config-nav-item--active" : ""}`}
            onClick={() => setAtiva(indice)}
            aria-current={item === secao ? "page" : undefined}
          >
            <span>{item.label}</span>
            {item.status === "em-breve" ? <span className="nav-tag">em breve</span> : null}
          </button>
        ))}
      </nav>

      {secao?.id === "equipe" ? (
        <EquipeView />
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

        {secao?.rota ? (
          <p className="card-note">
            <button
              className="button button--accent"
              type="button"
              onClick={() => secao.rota && router.push(secao.rota)}
            >
              Abrir {secao.label}
            </button>
          </p>
        ) : (
          <p className="card-note">
            Ainda não construído. A estrutura está definida e a tela entra quando este
            bloco for priorizado.
          </p>
        )}

        <p className="card-note">
          Visível para: <b>{secao?.roles.join(", ")}</b>.
        </p>
      </ShellCard>
      )}
    </div>
  );
}
