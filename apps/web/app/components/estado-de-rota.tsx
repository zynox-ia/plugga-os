"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ShellCard } from "./plugga-shell";

/**
 * Estados de rota do App Router (US12, T127): erro inesperado e não
 * encontrado, com o mesmo corpo em todos os módulos e só o rótulo mudando.
 *
 * Não há `loading.tsx`: com ele, o React segura o conteúdo novo por no mínimo
 * ~300 ms depois de mostrar o "Carregando…", mesmo quando a tela fica pronta em
 * 20 ms. A troca de tela roda numa transição (`AppShell`) e o shell mostra uma
 * barra fina só quando ela demora.
 */

export function ErroDeRota({
  error,
  reset,
  modulo,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  modulo?: string;
}) {
  useEffect(() => {
    // Só o resumo vai ao console do navegador; a mensagem do servidor já vem
    // sem detalhe interno em produção, e o `digest` liga ao log do servidor.
    console.error("falha ao renderizar a rota", error.digest ?? "");
  }, [error]);

  return (
    <ShellCard className="panel-card">
      <div role="alert" data-testid="estado-erro-inesperado">
        <div className="card-heading">
          <div>
            {modulo ? <span className="eyebrow">{modulo}</span> : null}
            <h2>Algo deu errado</h2>
          </div>
        </div>
        <p className="card-note">
          Não foi possível mostrar esta tela.
          {error.digest ? ` Informe o código ${error.digest} ao suporte.` : ""}
        </p>
        <p className="card-note">
          <button type="button" className="button" onClick={() => reset()}>
            Tentar novamente
          </button>
        </p>
      </div>
    </ShellCard>
  );
}

export function NaoEncontradoRota({ modulo, voltar }: { modulo?: string; voltar?: { href: string; rotulo: string } }) {
  return (
    <ShellCard className="panel-card">
      <div data-testid="estado-nao-encontrado">
        <div className="card-heading">
          <div>
            {modulo ? <span className="eyebrow">{modulo}</span> : null}
            <h2>Página não encontrada</h2>
          </div>
        </div>
        <p className="card-note">Não encontramos o que você procurou. O endereço pode estar incorreto ou o registro foi removido.</p>
        <p className="card-note">
          <Link href={voltar?.href ?? "/"}>{voltar?.rotulo ?? "Voltar ao início"}</Link>
        </p>
      </div>
    </ShellCard>
  );
}
