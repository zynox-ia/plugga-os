"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Lock } from "lucide-react";

import { Alert, Button, TextField } from "../components/ui";
import { useSessionUser } from "../lib/use-session-user";
import styles from "./configuracoes.module.css";
import { SegurancaView } from "./seguranca-view";

const TAMANHO_MINIMO = 12;

type Resultado = { tom: "success" | "danger"; titulo: string; texto?: string };

async function mensagemDoServidor(resposta: Response): Promise<string | null> {
  const corpo: unknown = await resposta.json().catch(() => null);
  if (corpo && typeof corpo === "object" && "message" in corpo && typeof corpo.message === "string") return corpo.message;
  return null;
}

async function trocarSenha(senhaAtual: string, senhaNova: string): Promise<Resultado> {
  let resposta: Response;
  try {
    resposta = await fetch("/api/auth/password", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: senhaAtual, newPassword: senhaNova }),
    });
  } catch {
    return { tom: "danger", titulo: "Não foi possível conectar.", texto: "Verifique sua conexão e tente novamente." };
  }
  if (resposta.ok) {
    return {
      tom: "success",
      titulo: "Senha atualizada.",
      texto: "Você continua conectado aqui. Os outros dispositivos foram desconectados.",
    };
  }
  if (resposta.status === 429) {
    return { tom: "danger", titulo: "Muitas tentativas.", texto: "Aguarde um minuto e tente novamente." };
  }
  if (resposta.status === 401) {
    return { tom: "danger", titulo: "Sua sessão expirou.", texto: "Entre novamente para trocar a senha." };
  }
  const mensagem = await mensagemDoServidor(resposta);
  // 400 (senha atual errada / nova igual) e 409 (conta do Google) trazem texto próprio e legível.
  if (mensagem && (resposta.status === 400 || resposta.status === 409) && !/validation|expected|invalid/i.test(mensagem)) {
    return { tom: "danger", titulo: mensagem };
  }
  return { tom: "danger", titulo: "Não foi possível trocar a senha.", texto: "Confira os campos e tente novamente." };
}

function FormularioDeSenha() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const erroNova = !tentou
    ? undefined
    : nova.length < TAMANHO_MINIMO
      ? `Use pelo menos ${TAMANHO_MINIMO} caracteres.`
      : nova === atual
        ? "A nova senha precisa ser diferente da atual."
        : undefined;
  const erroConfirmacao = tentou && !erroNova && confirmacao !== nova ? "As senhas não são iguais." : undefined;
  const erroAtual = tentou && atual.length === 0 ? "Informe a senha atual." : undefined;

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setTentou(true);
    setResultado(null);
    if (atual.length === 0 || nova.length < TAMANHO_MINIMO || nova === atual || confirmacao !== nova) return;
    setEnviando(true);
    const retorno = await trocarSenha(atual, nova);
    setEnviando(false);
    setResultado(retorno);
    if (retorno.tom === "success") {
      setAtual("");
      setNova("");
      setConfirmacao("");
      setTentou(false);
    }
  }

  return (
    <form className={styles.camposUnicaColuna} onSubmit={enviar} noValidate>
      <TextField
        type="password"
        label="Senha atual"
        value={atual}
        onChange={(e) => setAtual(e.target.value)}
        autoComplete="current-password"
        error={erroAtual}
        maxLength={200}
      />
      <TextField
        type="password"
        label="Nova senha"
        value={nova}
        onChange={(e) => setNova(e.target.value)}
        autoComplete="new-password"
        hint={`Mínimo de ${TAMANHO_MINIMO} caracteres. Frases longas funcionam bem.`}
        error={erroNova}
        maxLength={200}
      />
      <TextField
        type="password"
        label="Confirmar nova senha"
        value={confirmacao}
        onChange={(e) => setConfirmacao(e.target.value)}
        autoComplete="new-password"
        error={erroConfirmacao}
        maxLength={200}
      />
      {resultado ? <Alert tone={resultado.tom} title={resultado.titulo}>{resultado.texto}</Alert> : null}
      <div className={styles.rodape}>
        <Button type="submit" variant="primary" size="sm" icon={<KeyRound size={14} />} disabled={enviando}>
          {enviando ? "Atualizando…" : "Atualizar senha"}
        </Button>
      </div>
    </form>
  );
}

export function SegurancaDaContaView() {
  const { usuario } = useSessionUser();
  if (!usuario) return null;

  return (
    <div className={styles.painel}>
      <div className={`${styles.grade} ${styles.gradeSeguranca}`}>
        <section className={styles.secao} aria-label="Segurança e senha">
          <h4 className={styles.tituloDaSecao}>
            <Lock size={16} aria-hidden="true" />
            Alterar senha de acesso
          </h4>
          <FormularioDeSenha />
        </section>

        <SegurancaView />
      </div>
    </div>
  );
}
