"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EstadoDoTelegramComCofre } from "@plugga/shared";

import { Button, Switch, TextField } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { detalheDoErro } from "./integracao-api";
import { AvisosDaIntegracao, CartaoDeIntegracao, type JanelaDaIntegracao, type SeloDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = "gerenciar" | "conectar" | "desconectar";

const DESCRICAO = "Avisos da equipe: novo lead e atividade atrasada.";

/**
 * Telegram: o canal da equipe para os avisos do sistema (novo lead e atividade
 * atrasada). O token do bot é escrita-apenas: nunca volta do servidor, só os
 * quatro últimos caracteres, e o campo é limpo ao gravar.
 */
export function IntegracaoTelegram() {
  const [estado, setEstado] = useState<EstadoDoTelegramComCofre | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const [vista, setVista] = useState<Vista>("gerenciar");
  const [ocupado, setOcupado] = useState<"teste" | "formulario" | null>(null);
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

  function ir(proxima: Vista) {
    setErro(null);
    setAviso(null);
    setToken("");
    if (proxima === "conectar") {
      setChatId(estado?.chatId ?? "");
      setNovoLead(estado?.conectado ? estado.avisarNovoLead : true);
      setAtrasada(estado?.conectado ? estado.avisarAtividadeAtrasada : true);
    }
    setVista(proxima);
    setAberta(true);
  }

  function fechar() {
    setToken("");
    setErro(null);
    setAviso(null);
    setAberta(false);
  }

  async function chamar(quem: "teste" | "formulario", chamada: () => Promise<Response>, padrao: string): Promise<Response | null> {
    setOcupado(quem);
    setErro(null);
    try {
      const resposta = await chamada();
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, padrao));
      return resposta;
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : padrao);
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function conectar(evento: FormEvent) {
    evento.preventDefault();
    const resposta = await chamar("formulario", () => fetch("/api/integracoes/telegram", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, chatId, avisarNovoLead: novoLead, avisarAtividadeAtrasada: atrasada }),
    }), "não foi possível conectar o Telegram");
    // O token sai da tela antes de qualquer outra coisa.
    setToken("");
    if (!resposta) return;
    await carregar();
    setVista("gerenciar");
    setAviso("Telegram conectado. Os avisos ligados passam a sair neste chat.");
  }

  async function testar() {
    setAviso(null);
    const resposta = await chamar("teste", () => fetch("/api/integracoes/telegram/teste", { method: "POST" }), "não foi possível enviar a mensagem de teste");
    if (resposta) setAviso("Mensagem de teste enviada. Confira o chat no Telegram.");
  }

  async function desconectar() {
    const resposta = await chamar("formulario", () => fetch("/api/integracoes/telegram", { method: "DELETE" }), "não foi possível desconectar o Telegram");
    if (!resposta) return;
    await carregar();
    fechar();
  }

  const selo: SeloDaIntegracao = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.origem === "cofre_ilegivel"
      ? { tom: "warning", texto: "Requer atenção" }
      : estado.conectado
        ? { tom: "success", texto: "Conectado" }
        : { tom: "neutral", texto: "Não conectado" };

  const resumo = !estado ? "Consultando o estado…" : estado.conectado ? `Chat ${estado.chatId}` : "Nenhum chat conectado";

  const avisosLigados = estado?.conectado
    ? [estado.avisarNovoLead ? "novo lead" : null, estado.avisarAtividadeAtrasada ? "atividade atrasada" : null].filter(Boolean).join(" e ") || "nenhum"
    : null;

  const avisos = (
    <AvisosDaIntegracao
      falhaAoLer={falhaAoLer}
      aviso={aviso}
      erro={erro}
      cofreConfigurado={estado?.cofreConfigurado}
      ilegivel={estado?.origem === "cofre_ilegivel" ? { titulo: "A configuração guardada não pode mais ser lida", texto: "A chave-mestra do cofre mudou. Conecte de novo para gravar o token." } : null}
    />
  );

  let janela: JanelaDaIntegracao | null = null;
  if (aberta && vista === "gerenciar") {
    janela = {
      titulo: "Telegram",
      descricao: DESCRICAO,
      tamanho: "media",
      aoFechar: fechar,
      conteudo: (
        <>
          {avisos}
          {estado?.conectado ? (
            <dl className={styles.detalhes}>
              <div><dt>Chat</dt><dd>{estado.chatId}</dd></div>
              <div><dt>Token do bot</dt><dd>{estado.mascara}</dd></div>
              <div><dt>Avisos ligados</dt><dd>{avisosLigados}</dd></div>
              {estado.atualizadoEm ? <div><dt>Atualizado em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
            </dl>
          ) : null}
        </>
      ),
      rodape: (
        <>
          <Button variant="danger" onClick={() => ir("desconectar")}>Desconectar</Button>
          {estado?.conectado ? <Button variant="secondary" onClick={testar} loading={ocupado === "teste"}>Enviar mensagem de teste</Button> : null}
          <Button onClick={() => ir("conectar")}>Editar conexão</Button>
        </>
      ),
    };
  } else if (aberta && vista === "conectar") {
    janela = {
      titulo: estado?.conectado ? "Editar a conexão do Telegram" : "Conectar o Telegram",
      descricao: "O token fica guardado cifrado no cofre da plataforma e não é exibido depois de salvo.",
      tamanho: "estreita",
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button type="submit" form="form-telegram" loading={ocupado === "formulario"}>Salvar conexão</Button>,
      conteudo: (
        <form id="form-telegram" className={styles.formulario} onSubmit={conectar}>
          {avisos}
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
      ),
    };
  } else if (aberta && vista === "desconectar") {
    janela = {
      titulo: "Desconectar o Telegram?",
      descricao: "Nenhum aviso sai mais para o canal da equipe até você conectar de novo.",
      tamanho: "estreita",
      perigo: true,
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button variant="danger" onClick={desconectar} loading={ocupado === "formulario"}>Desconectar</Button>,
      conteudo: avisos,
    };
  }

  return (
    <CartaoDeIntegracao
      nome="Telegram"
      Icone={Send}
      descricao={DESCRICAO}
      selo={selo}
      resumo={resumo}
      acao={{ rotulo: estado?.conectado ? "Gerenciar" : "Conectar", destaque: !estado?.conectado, desabilitada: !estado, aoClicar: () => ir(estado?.conectado ? "gerenciar" : "conectar") }}
      janela={janela}
    />
  );
}
