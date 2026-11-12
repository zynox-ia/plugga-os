"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EstadoDoTelegramComCofre } from "@plugga/shared";

import { Alert, Badge, Button, Dialog, Switch, TextField, type Tone } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { detalheDoErro } from "./integracao-api";
import styles from "./integracoes.module.css";

type Janela = "conectar" | "desconectar" | null;

/**
 * Telegram: o canal da equipe para os avisos do sistema (novo lead e atividade
 * atrasada). O token do bot é escrita-apenas: nunca volta do servidor, só os
 * quatro últimos caracteres, e o campo é limpo ao gravar.
 */
export function IntegracaoTelegram() {
  const [estado, setEstado] = useState<EstadoDoTelegramComCofre | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [janela, setJanela] = useState<Janela>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [novoLead, setNovoLead] = useState(true);
  const [atrasada, setAtrasada] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/integracoes/telegram", { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler o estado do Telegram"));
      setEstado((await resposta.json()) as EstadoDoTelegramComCofre);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar o Telegram");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(proxima: Exclude<Janela, null>) {
    setErro(null);
    setAviso(null);
    setToken("");
    if (proxima === "conectar") {
      setChatId(estado?.chatId ?? "");
      setNovoLead(estado?.conectado ? estado.avisarNovoLead : true);
      setAtrasada(estado?.conectado ? estado.avisarAtividadeAtrasada : true);
    }
    setJanela(proxima);
  }

  function fechar() {
    if (ocupado) return;
    setToken("");
    setJanela(null);
  }

  async function chamar(chamada: () => Promise<Response>, padrao: string): Promise<Response | null> {
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await chamada();
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, padrao));
      return resposta;
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : padrao);
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function conectar(evento: FormEvent) {
    evento.preventDefault();
    const resposta = await chamar(
      () => fetch("/api/integracoes/telegram", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, chatId, avisarNovoLead: novoLead, avisarAtividadeAtrasada: atrasada }),
      }),
      "não foi possível conectar o Telegram",
    );
    // O token sai da tela antes de qualquer outra coisa.
    setToken("");
    if (!resposta) return;
    await carregar();
    setJanela(null);
    setAviso("Telegram conectado. Os avisos ligados passam a sair neste chat.");
  }

  async function testar() {
    setAviso(null);
    const resposta = await chamar(() => fetch("/api/integracoes/telegram/teste", { method: "POST" }), "não foi possível enviar a mensagem de teste");
    if (resposta) setAviso("Mensagem de teste enviada. Confira o chat no Telegram.");
  }

  async function desconectar() {
    const resposta = await chamar(() => fetch("/api/integracoes/telegram", { method: "DELETE" }), "não foi possível desconectar o Telegram");
    if (!resposta) return;
    await carregar();
    setJanela(null);
    setAviso("Telegram desconectado. Nenhum aviso sai mais para o canal.");
  }

  const selo: { tom: Tone; texto: string } = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.origem === "cofre_ilegivel"
      ? { tom: "warning", texto: "Requer atenção" }
      : estado.conectado
        ? { tom: "success", texto: "Conectado" }
        : { tom: "neutral", texto: "Não conectado" };

  const avisosLigados = estado?.conectado
    ? [estado.avisarNovoLead ? "novo lead" : null, estado.avisarAtividadeAtrasada ? "atividade atrasada" : null].filter(Boolean).join(" e ") || "nenhum"
    : null;

  return (
    <article className={styles.cartao} aria-label="Telegram">
      <div className={styles.topo}>
        <span className={styles.marca} aria-hidden="true"><Send size={20} /></span>
        <div className={styles.titulo}>
          <h3>Telegram</h3>
          <p>Avisos da equipe: novo lead e atividade atrasada.</p>
        </div>
        <Badge tone={selo.tom}>{selo.texto}</Badge>
      </div>

      {falhaAoLer ? <Alert tone="danger" title={falhaAoLer} /> : null}
      {aviso ? <Alert tone="success" title={aviso} /> : null}
      {erro && janela === null ? <Alert tone="danger" title={erro} /> : null}
      {estado?.cofreConfigurado === false ? (
        <Alert tone="warning" title="O cofre não está pronto">
          Falta a variável <code>SECRETS_ENCRYPTION_KEY</code> no ambiente da API. Gere com{" "}
          <code>openssl rand -base64 32</code> e reinicie a API antes de conectar.
        </Alert>
      ) : null}
      {estado?.origem === "cofre_ilegivel" ? (
        <Alert tone="warning" title="A configuração guardada não pode mais ser lida">
          A chave-mestra do cofre mudou. Conecte de novo para gravar o token.
        </Alert>
      ) : null}

      {estado?.conectado ? (
        <dl className={styles.detalhes}>
          <div><dt>Chat</dt><dd>{estado.chatId}</dd></div>
          <div><dt>Token do bot</dt><dd>{estado.mascara}</dd></div>
          <div><dt>Avisos ligados</dt><dd>{avisosLigados}</dd></div>
          {estado.atualizadoEm ? <div><dt>Atualizado em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
        </dl>
      ) : null}

      <div className={styles.acoes}>
        <Button variant={estado?.conectado ? "secondary" : "primary"} size="sm" onClick={() => abrir("conectar")} disabled={!estado}>
          {estado?.conectado ? "Editar conexão" : "Conectar"}
        </Button>
        {estado?.conectado ? (
          <Button variant="secondary" size="sm" onClick={testar} loading={ocupado && janela === null}>Enviar mensagem de teste</Button>
        ) : null}
        {estado?.origem === "cofre" || estado?.origem === "cofre_ilegivel" ? (
          <Button variant="danger" size="sm" onClick={() => abrir("desconectar")}>Desconectar</Button>
        ) : null}
      </div>

      {janela === "conectar" ? (
        <Dialog
          title={estado?.conectado ? "Editar conexão do Telegram" : "Conectar o Telegram"}
          description="O token fica guardado cifrado no cofre da plataforma e não é exibido depois de salvo."
          onClose={fechar}
          size="estreita"
          footer={<Button type="submit" form="form-telegram" loading={ocupado}>Salvar conexão</Button>}
        >
          <form id="form-telegram" className={styles.formulario} onSubmit={conectar}>
            {erro ? <Alert tone="danger" title={erro} /> : null}
            <TextField
              label="Token do bot"
              hint={estado?.conectado ? "Cole o token de novo para salvar as alterações." : "Gerado no BotFather, ao criar o bot."}
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <TextField
              label="Id do chat"
              hint="O id numérico do grupo (começa com -100) ou o @canal. O bot precisa estar no chat."
              autoComplete="off"
              spellCheck={false}
              required
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
            <Switch label="Avisar novo lead" description="Uma mensagem quando entra um lead no pipeline." checked={novoLead} onChange={(e) => setNovoLead(e.target.checked)} />
            <Switch label="Avisar atividade atrasada" description="Uma mensagem quando uma atividade passa do prazo sem conclusão." checked={atrasada} onChange={(e) => setAtrasada(e.target.checked)} />
          </form>
        </Dialog>
      ) : null}

      {janela === "desconectar" ? (
        <Dialog
          title="Desconectar o Telegram?"
          description="Nenhum aviso sai mais para o canal da equipe até você conectar de novo."
          variant="danger"
          onClose={fechar}
          size="estreita"
          footer={<Button variant="danger" onClick={desconectar} loading={ocupado}>Desconectar</Button>}
        >
          {erro ? <Alert tone="danger" title={erro} /> : null}
        </Dialog>
      ) : null}
    </article>
  );
}
