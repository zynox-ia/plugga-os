"use client";

import { MousePointer2, SendHorizontal, SquarePen, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import styles from "./assistente-ia.module.css";

type Papel = "usuario" | "assistente";
type Mensagem = { papel: Papel; texto: string };

const RESPOSTA_DE_DEMONSTRACAO =
  "Estou em construção — por enquanto esta janela é só a interface. Quando o backend de IA conectar, respondo de verdade aqui.";

const SUGESTOES = [
  "Resumir meus negócios parados",
  "Rascunhar um follow-up de proposta",
  "O que mudou no CRM essa semana?",
];

const cumprimento: Mensagem = {
  papel: "assistente",
  texto: "Olá! Sou o assistente do Plugga OS. Pergunte algo ou escolha uma sugestão abaixo.",
};

/**
 * Rodapé do shell com o botão "Agent" (padrão Linear/Zynox): barra de 48px no
 * pé da área de conteúdo e painel de chat ancorado acima do botão. Sem cortina:
 * o sistema continua usável; Esc ou clique fora fecham. Front-end apenas:
 * as respostas são de demonstração, sem chamada de API.
 */
export function AssistenteIA() {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([cumprimento]);
  const [rascunho, setRascunho] = useState("");
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const ancoraRef = useRef<HTMLDivElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    campoRef.current?.focus();
    const aoTeclar = (evento: globalThis.KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };
    const aoClicarFora = (evento: MouseEvent) => {
      if (ancoraRef.current && !ancoraRef.current.contains(evento.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicarFora);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicarFora);
    };
  }, [aberto]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, aberto]);

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    const texto = rascunho.trim();
    if (!texto) return;
    setMensagens((atuais) => [...atuais, { papel: "usuario", texto }, { papel: "assistente", texto: RESPOSTA_DE_DEMONSTRACAO }]);
    setRascunho("");
  };

  const aoTeclarNoCampo = (evento: KeyboardEvent<HTMLTextAreaElement>) => {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      evento.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className={styles.barra} ref={ancoraRef}>
      <button
        type="button"
        className={`${styles.botao}${aberto ? ` ${styles.botaoAberto}` : ""}`}
        onClick={() => setAberto((valor) => !valor)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
      >
        <MousePointer2 size={14} aria-hidden="true" />
        <span>Agent</span>
      </button>

      {aberto ? (
        <section className={styles.painel} role="dialog" aria-label="Assistente IA">
          <header className={styles.topo}>
            <span className={styles.topoTitulo}>Agent</span>
            <div className={styles.topoAcoes}>
              <button
                type="button"
                className={styles.botaoIcone}
                onClick={() => setMensagens([cumprimento])}
                aria-label="Nova conversa"
                title="Nova conversa"
              >
                <SquarePen size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.botaoIcone}
                onClick={() => setAberto(false)}
                aria-label="Fechar assistente"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className={styles.conversa}>
            {mensagens.map((mensagem, indice) => (
              <p
                key={indice}
                className={`${styles.mensagem} ${mensagem.papel === "usuario" ? styles.mensagemUsuario : styles.mensagemAssistente}`}
              >
                {mensagem.texto}
              </p>
            ))}
            {mensagens.length === 1 ? (
              <div className={styles.sugestoes}>
                {SUGESTOES.map((sugestao) => (
                  <button
                    key={sugestao}
                    type="button"
                    className={styles.sugestao}
                    onClick={() => setRascunho(sugestao)}
                  >
                    {sugestao}
                  </button>
                ))}
              </div>
            ) : null}
            <div ref={fimRef} />
          </div>

          <form className={styles.entrada} onSubmit={enviar}>
            <textarea
              ref={campoRef}
              className={styles.campo}
              rows={2}
              placeholder="Pergunte algo..."
              value={rascunho}
              onChange={(evento) => setRascunho(evento.target.value)}
              onKeyDown={aoTeclarNoCampo}
              aria-label="Mensagem para o assistente"
            />
            <button type="submit" className={styles.enviar} disabled={!rascunho.trim()} aria-label="Enviar mensagem">
              <SendHorizontal size={15} aria-hidden="true" />
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
