"use client";

import { useEffect, useState } from "react";

export type SessionUser = { name: string; email: string; roles: string[] };

/**
 * Usuário da sessão atual, lido de GET /api/auth/me (espelho da API sob a
 * origem do web). Compartilhado pelo menu do avatar e por Configurações, que
 * filtra as seções pelos papéis — duas telas perguntando a mesma coisa por
 * caminhos diferentes divergiriam na primeira mudança de contrato.
 *
 * `carregando` existe para o consumidor não confundir "ainda não sei os
 * papéis" com "não tem papel nenhum" e mostrar um vazio que não é verdade.
 */
export function useSessionUser(): { usuario: SessionUser | null; carregando: boolean } {
  const [usuario, setUsuario] = useState<SessionUser | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
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
  }, []);

  return { usuario, carregando };
}
