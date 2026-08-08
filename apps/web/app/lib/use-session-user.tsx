"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SessionUser } from "@plugga/shared";

export type { SessionUser };

export type SessaoAtual = { usuario: SessionUser | null; carregando: boolean };

const SessaoContext = createContext<SessaoAtual | null>(null);

/**
 * Lê GET /api/auth/me (espelho da API sob a origem do web). `enabled` existe
 * porque hook não pode ser condicional: quem já recebe a sessão do contexto
 * monta este mesmo hook, só que sem disparar a requisição.
 */
function useBuscaSessao(enabled: boolean): SessaoAtual {
  const [usuario, setUsuario] = useState<SessionUser | null>(null);
  const [carregando, setCarregando] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let ativo = true;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((dados) => {
        if (ativo && dados) setUsuario(dados as SessionUser);
      })
      .catch(() => {
        // Sem identidade a tela ainda funciona; só não personaliza.
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [enabled]);

  return { usuario, carregando };
}

/**
 * Uma leitura de /me por navegação, compartilhada. Barra lateral, menu da conta,
 * seletor de empresa e Configurações perguntam a mesma coisa; sem isto cada um
 * abriria a própria requisição e poderiam desenhar a partir de respostas
 * diferentes no mesmo instante.
 */
export function SessionUserProvider({ children }: { children: ReactNode }) {
  const sessao = useBuscaSessao(true);
  return <SessaoContext.Provider value={sessao}>{children}</SessaoContext.Provider>;
}

/**
 * Usuário da sessão atual: identidade + acesso inteiro (empresas, departamentos,
 * papéis por empresa). É o acesso que decide qual empresa aparece no seletor e
 * quais departamentos entram na barra — a lista achatada de papéis não sabe onde
 * cada papel vale.
 *
 * `carregando` existe para o consumidor não confundir "ainda não sei o acesso"
 * com "não tem acesso nenhum" e mostrar um vazio que não é verdade.
 *
 * Fora do provider (páginas públicas de auth) o hook busca por conta própria,
 * para nunca depender de uma árvore que aquela rota não monta.
 */
export function useSessionUser(): SessaoAtual {
  const doContexto = useContext(SessaoContext);
  const proprio = useBuscaSessao(doContexto === null);
  return doContexto ?? proprio;
}
