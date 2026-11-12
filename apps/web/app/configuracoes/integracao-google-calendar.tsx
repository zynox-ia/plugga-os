"use client";

import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AutorizacaoDoGoogleCalendar, EstadoDoGoogleCalendar } from "@plugga/shared";

import { Alert, Badge, Button, Dialog, type Tone } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { MENSAGEM_DO_RESULTADO, resultadoDaUrl, type ResultadoDaConexao } from "../lib/google-calendar-resultado";
import { detalheDoErro } from "./integracao-api";
import styles from "./integracoes.module.css";

const ORIGEM_DO_CONSENTIMENTO = "https://accounts.google.com";

/**
 * Google Calendar: a agenda do Google da PRÓPRIA pessoa. Qualquer papel conecta a
 * sua, e só ela a vê: nem admin nem desenvolvedor alcançam a conexão de outro.
 * Nenhum token passa por aqui; a tela só sabe a conta conectada e desde quando.
 *
 * O consentimento acontece no Google e volta pela aba (`?google=resultado`), que
 * o cartão lê, mostra e tira do endereço.
 */
export function IntegracaoGoogleCalendar() {
  const [estado, setEstado] = useState<EstadoDoGoogleCalendar | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [desconectando, setDesconectando] = useState(false);
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
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url.toString());
  }, []);

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
      setDesconectando(false);
      setRetorno(null);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "não foi possível desconectar o Google Calendar");
    } finally {
      setOcupado(false);
    }
  }

  const selo: { tom: Tone; texto: string } = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.conectado
      ? { tom: "success", texto: "Conectado" }
      : estado.disponivel
        ? { tom: "neutral", texto: "Não conectado" }
        : { tom: "neutral", texto: "Indisponível" };
  const mensagem = retorno ? MENSAGEM_DO_RESULTADO[retorno] : null;

  return (
    <article className={styles.cartao} aria-label="Google Calendar">
      <div className={styles.topo}>
        <span className={styles.marca} aria-hidden="true"><CalendarDays size={20} /></span>
        <div className={styles.titulo}>
          <h3>Google Calendar</h3>
          <p>A agenda do Google da sua conta. Cada pessoa conecta a sua, e só você a alcança.</p>
        </div>
        <Badge tone={selo.tom}>{selo.texto}</Badge>
      </div>

      {falhaAoLer ? <Alert tone="danger" title={falhaAoLer} /> : null}
      {mensagem ? <Alert tone={mensagem.tom} title={mensagem.texto} /> : null}
      {erro && !desconectando ? <Alert tone="danger" title={erro} /> : null}
      {estado && !estado.disponivel && !estado.conectado ? (
        <Alert tone="info" title="Indisponível por enquanto">
          A plataforma ainda não habilitou a conexão com o Google. Fale com o desenvolvedor.
        </Alert>
      ) : null}

      {estado?.conectado ? (
        <dl className={styles.detalhes}>
          {estado.email ? <div><dt>Conta</dt><dd>{estado.email}</dd></div> : null}
          {estado.conectadoEm ? <div><dt>Conectado em</dt><dd>{formatarDataHora(estado.conectadoEm)}</dd></div> : null}
        </dl>
      ) : null}
      {estado ? (
        <p className={styles.nota}>
          Pedimos acesso para ver e editar eventos da sua agenda. Por enquanto só a conexão está liberada; a
          sincronização das atividades com a agenda vem na próxima etapa.
        </p>
      ) : null}

      <div className={styles.acoes}>
        <Button
          variant={estado?.conectado ? "secondary" : "primary"}
          size="sm"
          onClick={conectar}
          loading={ocupado && !desconectando}
          disabled={!estado || (!estado.disponivel && !estado.conectado)}
        >
          {estado?.conectado ? "Reconectar" : "Conectar"}
        </Button>
        {estado?.conectado ? (
          <Button variant="danger" size="sm" onClick={() => { setErro(null); setDesconectando(true); }}>Desconectar</Button>
        ) : null}
      </div>

      {desconectando ? (
        <Dialog
          title="Desconectar o Google Calendar?"
          description="O Plugga OS deixa de acessar a sua agenda e revoga a autorização no Google. Os eventos que já estão na sua agenda não são apagados."
          variant="danger"
          onClose={() => { if (!ocupado) setDesconectando(false); }}
          size="estreita"
          footer={<Button variant="danger" onClick={desconectar} loading={ocupado}>Desconectar</Button>}
        >
          {erro ? <Alert tone="danger" title={erro} /> : null}
        </Dialog>
      ) : null}
    </article>
  );
}
