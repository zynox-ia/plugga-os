"use client";

import { useId, useState, type FormEvent } from "react";
import { CheckCircle2, Circle, KeyRound, Lock, ShieldCheck } from "lucide-react";

import { Alert, Button } from "../components/ui";
import { useSessionUser } from "../lib/use-session-user";
import { CampoDeSenha } from "./campo-de-senha";
import { CartaoDaConfiguracao } from "./cartao";
import styles from "./cartoes.module.css";
import { SegurancaView, type EstadoDoMfa } from "./seguranca-view";

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

function MedidorDeTamanho({ tamanho, legendaId }: { tamanho: number; legendaId: string }) {
  const completo = tamanho >= TAMANHO_MINIMO;
  const largura = Math.min(100, Math.round((tamanho / TAMANHO_MINIMO) * 100));
  return (
    <div className={`${styles.medidor} ${completo ? styles.medidorOk : ""}`}>
      <div className={styles.trilho} aria-hidden="true">
        <i style={{ width: `${largura}%` }} />
      </div>
      <p id={legendaId} className={styles.legenda} aria-live="polite">
        {completo ? <CheckCircle2 aria-hidden="true" /> : null}
        {completo ? "Tamanho suficiente" : `${tamanho} de ${TAMANHO_MINIMO} caracteres`}
      </p>
    </div>
  );
}

function FormularioDeSenha() {
  const legendaId = useId();
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
    <form className={`${styles.formulario} ${styles.compacto}`} onSubmit={enviar} noValidate>
      <CampoDeSenha
        label="Senha atual"
        value={atual}
        onChange={(e) => setAtual(e.target.value)}
        autoComplete="current-password"
        error={erroAtual}
        maxLength={200}
      />
      <div className={styles.duplaDeSenhas}>
        <CampoDeSenha
          label="Nova senha"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          autoComplete="new-password"
          extra={<MedidorDeTamanho tamanho={nova.length} legendaId={legendaId} />}
          aria-describedby={legendaId}
          error={erroNova}
          maxLength={200}
        />
        <CampoDeSenha
          label="Confirmar nova senha"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="new-password"
          error={erroConfirmacao}
          maxLength={200}
        />
      </div>
      {resultado ? <Alert tone={resultado.tom} title={resultado.titulo}>{resultado.texto}</Alert> : null}
      <div className={styles.acaoNoRodape}>
        <Button type="submit" variant="primary" icon={<KeyRound size={14} />} className={styles.botaoDoCartao} disabled={enviando}>
          {enviando ? "Atualizando…" : "Atualizar senha"}
        </Button>
      </div>
    </form>
  );
}

function FaixaDeProtecao({ mfa }: { mfa: EstadoDoMfa }) {
  const verificando = !mfa.carregado;
  const protegida = mfa.carregado && mfa.ativada;
  const resumo = verificando
    ? "Verificando a proteção da conta…"
    : protegida
      ? "Cada novo login exige um código do aplicativo autenticador."
      : "Ative a autenticação em duas etapas para exigir um código do aplicativo em cada login.";
  return (
    <section
      className={`${styles.vidro} ${styles.faixa} ${protegida ? styles.faixaProtegida : ""}`}
      aria-labelledby="protecao-titulo"
    >
      <span className={styles.faixaIcone} aria-hidden="true">
        <ShieldCheck strokeWidth={1.5} />
      </span>
      <div className={styles.faixaTexto}>
        <h2 id="protecao-titulo">Proteção da conta</h2>
        <p aria-live="polite">{resumo}</p>
      </div>
      <div className={styles.camadas}>
        <div className={styles.barra} aria-hidden="true">
          <i className={styles.ligada} />
          <i className={protegida ? styles.ligada : ""} />
        </div>
        <ul className={styles.rotulos}>
          <li className={`${styles.camada} ${styles.camadaOk}`}>
            <CheckCircle2 role="img" aria-label="Ativa" />
            <span>Entrada</span>
          </li>
          <li className={`${styles.camada} ${protegida ? styles.camadaOk : styles.camadaPendente}`}>
            {protegida ? (
              <CheckCircle2 role="img" aria-label="Ativada" />
            ) : (
              <Circle role="img" aria-label={verificando ? "Verificando" : "Desativada"} />
            )}
            <span>Duas etapas</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

export function SegurancaDaContaView() {
  const { usuario } = useSessionUser();
  const [mfa, setMfa] = useState<EstadoDoMfa>({ carregado: false, ativada: false });
  if (!usuario) return null;

  return (
    <div className={styles.seguranca}>
      <FaixaDeProtecao mfa={mfa} />
      <div className={styles.gradeSeguranca}>
        <SegurancaView aoMudarEstado={setMfa} />
        <CartaoDaConfiguracao
          titulo="Alterar senha de acesso"
          tituloId="senha-titulo"
          icone={<Lock />}
          rotulo="Segurança e senha"
          className={styles.compacto}
        >
          <FormularioDeSenha />
        </CartaoDaConfiguracao>
      </div>
    </div>
  );
}
