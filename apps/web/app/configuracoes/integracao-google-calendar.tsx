"use client";

import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AutorizacaoDoGoogleCalendar, EstadoDoGoogleCalendar } from "@plugga/shared";

import { Alert, Button } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { MENSAGEM_DO_RESULTADO, resultadoDaUrl, type ResultadoDaConexao } from "../lib/google-calendar-resultado";
import { detalheDoErro } from "./integracao-api";
import { CartaoDeIntegracao, type JanelaDaIntegracao, type SeloDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = "gerenciar" | "desconectar";

const ORIGEM_DO_CONSENTIMENTO = "https://accounts.google.com";
const DESCRICAO = "A agenda do Google da sua conta. Cada pessoa conecta a sua, e só você a alcança.";

/**
 * Google Calendar: a agenda do Google da PRÓPRIA pessoa. Qualquer papel conecta a
 * sua, e só ela a vê: nem admin nem desenvolvedor alcançam a conexão de outro.
 * Nenhum token passa por aqui; a tela só sabe a conta conectada e desde quando.
 *
 * "Conectar" leva direto ao consentimento do Google, que volta pela aba
 * (`?google=resultado`): o modal abre sozinho, mostra o resultado e tira o
 * parâmetro do endereço.
 */
export function IntegracaoGoogleCalendar() {
  const [estado, setEstado] = useState<EstadoDoGoogleCalendar | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const [vista, setVista] = useState<Vista>("gerenciar");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [retorno, setRetorno] = useState<ResultadoDaConexao | null>(null);

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/google/calendar/conexao", { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler a conexão com o Google"));
      setEstado((await resposta.json()) as EstadoDoGoogleCalendar);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar o Google");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O resultado do consentimento vem na URL; mostra uma vez e tira do endereço.
  useEffect(() => {
    const url = new URL(window.location.href);
    const resultado = resultadoDaUrl(url.searchParams.get("google"));
    if (!resultado) return;
    setRetorno(resultado);
    setVista("gerenciar");
    setAberta(true);
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url.toString());
  }, []);

  function fechar() {
    setErro(null);
    setRetorno(null);
    setAberta(false);
  }

  async function conectar() {
    setOcupado(true);
    setErro(null);
    setRetorno(null);
    try {
      const resposta = await fetch("/api/google/calendar/conexao/autorizacao", { method: "POST" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível iniciar a conexão com o Google"));
      const { url } = (await resposta.json()) as AutorizacaoDoGoogleCalendar;
      // Só segue para o consentimento do Google, nunca para outro endereço.
      if (new URL(url).origin !== ORIGEM_DO_CONSENTIMENTO) throw new Error("endereço de consentimento inesperado");
      window.location.assign(url);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "não foi possível iniciar a conexão com o Google");
      setOcupado(false);
    }
  }

  async function desconectar() {
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/google/calendar/conexao", { method: "DELETE" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível desconectar o Google Calendar"));
      setEstado((await resposta.json()) as EstadoDoGoogleCalendar);
      fechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "não foi possível desconectar o Google Calendar");
    } finally {
      setOcupado(false);
    }
  }

  const selo: SeloDaIntegracao = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.conectado
      ? { tom: "success", texto: "Conectado" }
      : estado.disponivel
        ? { tom: "neutral", texto: "Não conectado" }
        : { tom: "neutral", texto: "Indisponível" };

  const resumo = !estado
    ? "Consultando o estado…"
    : estado.conectado
      ? `Conta ${estado.email ?? "conectada"}`
      : estado.disponivel
        ? "Nenhuma agenda conectada"
        : "A plataforma ainda não habilitou";

  const mensagem = retorno ? MENSAGEM_DO_RESULTADO[retorno] : null;

  let janela: JanelaDaIntegracao | null = null;
  if (aberta && vista === "gerenciar") {
    janela = {
      titulo: "Google Calendar",
      descricao: DESCRICAO,
      tamanho: "media",
      aoFechar: fechar,
      conteudo: (
        <>
          {falhaAoLer ? <Alert tone="danger" title={falhaAoLer} /> : null}
          {mensagem ? <Alert tone={mensagem.tom} title={mensagem.texto} /> : null}
          {erro ? <Alert tone="danger" title={erro} /> : null}
          {estado?.conectado ? (
            <dl className={styles.detalhes}>
              {estado.email ? <div><dt>Conta</dt><dd>{estado.email}</dd></div> : null}
              {estado.conectadoEm ? <div><dt>Conectado em</dt><dd>{formatarDataHora(estado.conectadoEm)}</dd></div> : null}
            </dl>
          ) : null}
          <p className={styles.nota}>
            Pedimos acesso para ver e editar eventos da sua agenda. Por enquanto só a conexão está liberada; a
            sincronização das atividades com a agenda vem na próxima etapa.
          </p>
        </>
      ),
      rodape: estado?.conectado ? (
        <>
          <Button variant="danger" onClick={() => { setErro(null); setVista("desconectar"); }}>Desconectar</Button>
          <Button variant="secondary" onClick={conectar} loading={ocupado}>Reconectar</Button>
        </>
      ) : estado?.disponivel ? (
        <Button onClick={conectar} loading={ocupado}>Conectar</Button>
      ) : undefined,
    };
  } else if (aberta && vista === "desconectar") {
    janela = {
      titulo: "Desconectar o Google Calendar?",
      descricao: "O Plugga OS deixa de acessar a sua agenda e revoga a autorização no Google. Os eventos que já estão na sua agenda não são apagados.",
      tamanho: "estreita",
      perigo: true,
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button variant="danger" onClick={desconectar} loading={ocupado}>Desconectar</Button>,
      conteudo: erro ? <Alert tone="danger" title={erro} /> : null,
    };
  }

  return (
    <CartaoDeIntegracao
      nome="Google Calendar"
      Icone={CalendarDays}
      descricao={DESCRICAO}
      selo={selo}
      resumo={resumo}
      alerta={!aberta ? (erro ?? falhaAoLer) : null}
      acao={
        estado?.conectado
          ? { rotulo: "Gerenciar", aoClicar: () => { setErro(null); setVista("gerenciar"); setAberta(true); } }
          : estado && !estado.disponivel
            ? { rotulo: "Indisponível", desabilitada: true, aoClicar: () => undefined }
            : { rotulo: "Conectar", destaque: true, carregando: ocupado, desabilitada: !estado, aoClicar: () => void conectar() }
      }
      janela={janela}
    />
  );
}
