"use client";

import { useCallback, useEffect, useState } from "react";

import { ShellCard, StatusPill } from "../components/plugga-shell";

type EstadoDaChave = {
  configurada: boolean;
  origem: "banco" | "ambiente" | "nenhuma" | "banco_ilegivel";
  mascara: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  cofreConfigurado: boolean;
};

/**
 * Onde a chave da OpenRouter é plugada e trocada.
 *
 * A chave nunca volta do servidor — só os quatro últimos caracteres, o bastante
 * para confirmar qual está valendo sem entregar nada a quem estiver olhando a
 * tela por cima do ombro. Quem esqueceu a chave grava outra; não há "revelar".
 *
 * O campo é limpo assim que grava: chave em caixa de texto sobrevive a print de
 * tela, a captura de sessão e a colega que senta na cadeira.
 */
export function ChaveLlmView() {
  const [estado, setEstado] = useState<EstadoDaChave | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await fetch("/api/llm/chave", { cache: "no-store" });
      if (!resposta.ok) throw new Error("não foi possível ler o estado da chave");
      setEstado((await resposta.json()) as EstadoDaChave);
      setErro(null);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "falha ao consultar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function gravar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/llm/chave", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chave: valor }),
      });
      // `ok` antes do parse: um erro que chega sem JSON (proxy fora do ar) não
      // pode estourar aqui como falha de parse.
      if (!resposta.ok) {
        const detalhe = (await resposta.json().catch(() => null)) as { message?: string } | null;
        throw new Error(detalhe?.message ?? "não foi possível gravar a chave");
      }
      const corpo = (await resposta.json().catch(() => null)) as EstadoDaChave | null;

      // Limpo antes de qualquer outra coisa: se algo abaixo falhar, a chave já
      // saiu da tela.
      setValor("");
      if (corpo) setEstado({ ...corpo, cofreConfigurado: true });
      setAviso("Chave gravada. Ela passa a valer nas próximas chamadas.");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "falha ao gravar");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/llm/chave", { method: "DELETE" });
      if (!resposta.ok) throw new Error("não foi possível apagar a chave");
      const corpo = (await resposta.json().catch(() => null)) as EstadoDaChave | null;
      if (corpo) setEstado({ ...corpo, cofreConfigurado: estado?.cofreConfigurado ?? true });
      setAviso(
        corpo?.origem === "ambiente"
          ? "Chave apagada do banco. O sistema voltou a usar a do ambiente."
          : "Chave apagada. As funcionalidades que dependem dela ficam desligadas.",
      );
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "falha ao apagar");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <ShellCard className="panel-card">
        <p className="card-note">Consultando o estado da chave…</p>
      </ShellCard>
    );
  }

  return (
    <ShellCard className="panel-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Configurações</span>
          <h2>Chave de IA (OpenRouter)</h2>
        </div>
        <StatusPill variant={estado?.configurada ? "success" : "neutral"}>
          {estado?.configurada ? "Configurada" : "Ausente"}
        </StatusPill>
      </div>

      <p className="card-note">
        Uma chave serve o sistema inteiro. Todo consumo dela é registrado por processo, com
        tokens e custo, para dar para responder se cada funcionalidade compensa.
      </p>

      {estado?.cofreConfigurado === false ? (
        <p className="card-note" role="alert">
          <b>O cofre não está pronto.</b> Falta a variável <code>SECRETS_ENCRYPTION_KEY</code> no
          ambiente da API — sem ela a chave não pode ser guardada cifrada, e gravar aqui vai
          falhar. Gere com <code>openssl rand -base64 32</code> e reinicie a API.
        </p>
      ) : null}

      {estado?.origem === "banco_ilegivel" ? (
        <p className="card-note" role="alert">
          <b>A chave gravada não pode mais ser lida</b> — a chave-mestra do cofre mudou.
          Regrave a chave. Em uso agora: <b>{estado.mascara ?? "nenhuma"}</b>.
        </p>
      ) : estado?.configurada ? (
        <p className="card-note">
          Em uso: <b>{estado.mascara}</b>{" "}
          {estado.origem === "ambiente" ? (
            <>
              — vinda do arquivo de ambiente. Gravar aqui passa a valer no lugar dela, sem
              reiniciar nada.
            </>
          ) : (
            <>
              — trocada em {estado.atualizadoEm ? new Date(estado.atualizadoEm).toLocaleString("pt-BR") : "—"}
              {estado.atualizadoPor ? <> por {estado.atualizadoPor}</> : null}.
            </>
          )}
        </p>
      ) : (
        <p className="card-note">
          Nenhuma chave configurada. As funcionalidades que dependem de IA seguem
          desligadas — a leitura de fatura, por exemplo, fica só nas regras.
        </p>
      )}

      <div className="form-row">
        <label className="field">
          <span>Nova chave</span>
          <input
            type="password"
            value={valor}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-or-v1-…"
            onChange={(evento) => setValor(evento.target.value)}
          />
        </label>
      </div>

      <p className="card-note">
        <button
          className="button button--accent"
          type="button"
          disabled={salvando || valor.trim().length < 8}
          onClick={() => void gravar()}
        >
          {salvando ? "Gravando…" : "Gravar chave"}
        </button>{" "}
        {estado?.origem === "banco" ? (
          <button
            className="button"
            type="button"
            disabled={salvando}
            onClick={() => void apagar()}
          >
            Apagar chave guardada
          </button>
        ) : null}
      </p>

      {aviso ? <p className="card-note">{aviso}</p> : null}
      {erro ? (
        <p className="card-note" role="alert">
          {erro}
        </p>
      ) : null}

      <p className="card-note">
        A chave é guardada cifrada e nunca volta para esta tela — só os quatro últimos
        caracteres. Quem esquecer, grava outra.
      </p>
    </ShellCard>
  );
}
