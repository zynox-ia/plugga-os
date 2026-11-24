"use client";

import { Bot, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { EstadoDaAssinatura, LoginDeAssinatura, ProvedorDeAssinatura, SituacaoDoLogin } from "@plugga/shared";

import { Alert, Button } from "../components/ui";
import { detalheDoErro } from "./integracao-api";
import { AvisosDaIntegracao, CartaoDeIntegracao, type IconeDaIntegracao, type JanelaDaIntegracao, type SeloDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = "gerenciar" | "conectar" | "remover";

const CONFIG: Record<ProvedorDeAssinatura, { nome: string; Icone: IconeDaIntegracao; descricao: string }> = {
  claude: {
    nome: "Claude",
    Icone: Bot,
    descricao: "Claude pela assinatura de uma pessoa, por proxy de CLI. Só para tarefas internas, sem dado de cliente.",
  },
  codex: {
    nome: "Codex",
    Icone: TerminalSquare,
    descricao: "Codex pela assinatura do ChatGPT de uma pessoa, por proxy de CLI. Só para tarefas internas, sem dado de cliente.",
  },
};

const INTERVALO_MS = 2_000;
const LIMITE_DA_ESPERA_MS = 5 * 60_000;

/**
 * Claude ou Codex pela assinatura, por um proxy de CLI. O cartão conduz o login: pede o
 * link do provedor e acompanha o resultado. O token do login mora no proxy; esta tela
 * nunca o vê, só lista e remove contas.
 */
export function IntegracaoAssinaturaIa({ provedor }: { provedor: ProvedorDeAssinatura }) {
  const { nome, Icone, descricao } = CONFIG[provedor];
  const base = `/api/integracoes/ia-assinatura/${provedor}`;

  const [estado, setEstado] = useState<EstadoDaAssinatura | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const [vista, setVista] = useState<Vista>("gerenciar");
  const [ocupado, setOcupado] = useState<"login" | "teste" | "remocao" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [login, setLogin] = useState<(LoginDeAssinatura & { iniciadoEm: number }) | null>(null);
  const [contaParaRemover, setContaParaRemover] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch(base, { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler o estado"));
      setEstado((await resposta.json()) as EstadoDaAssinatura);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar o estado");
    }
  }, [base]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Acompanha o login em andamento até concluir, dar erro ou passar o limite de espera.
  useEffect(() => {
    if (!login) return;
    let ativo = true;
    const tick = async () => {
      if (Date.now() - login.iniciadoEm > LIMITE_DA_ESPERA_MS) {
        setLogin(null);
        setErro("O login demorou demais e foi cancelado. Tente de novo.");
        return;
      }
      try {
        const resposta = await fetch(`${base}/login?estado=${encodeURIComponent(login.estado)}`, { cache: "no-store" });
        if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível acompanhar o login"));
        const { situacao } = (await resposta.json()) as { situacao: SituacaoDoLogin };
        if (!ativo || situacao === "aguardando") return;
        setLogin(null);
        if (situacao === "concluido") {
          await carregar();
          setVista("gerenciar");
          setAviso("Conta conectada. O proxy guarda o login; o Plugga OS não vê o token.");
        } else {
          setErro("O provedor recusou ou cancelou o login. Tente de novo.");
        }
      } catch (falha) {
        if (!ativo) return;
        setLogin(null);
        setErro(falha instanceof Error ? falha.message : "não foi possível acompanhar o login");
      }
    };
    const id = window.setInterval(() => void tick(), INTERVALO_MS);
    return () => {
      ativo = false;
      window.clearInterval(id);
    };
  }, [login, base, carregar]);

  function ir(proxima: Vista) {
    setErro(null);
    setAviso(null);
    setLogin(null);
    setVista(proxima);
    setAberta(true);
  }

  function fechar() {
    setErro(null);
    setAviso(null);
    setLogin(null);
    setContaParaRemover(null);
    setAberta(false);
  }

  async function chamar<T>(quem: "login" | "teste" | "remocao", chamada: () => Promise<Response>, padrao: string): Promise<T | null> {
    setOcupado(quem);
    setErro(null);
    try {
      const resposta = await chamada();
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, padrao));
      return (await resposta.json()) as T;
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : padrao);
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function iniciarLogin() {
    setAviso(null);
    const novo = await chamar<LoginDeAssinatura>("login", () => fetch(`${base}/login`, { method: "POST" }), "não foi possível iniciar o login");
    if (novo) setLogin({ ...novo, iniciadoEm: Date.now() });
  }

  async function conferir() {
    setAviso(null);
    const r = await chamar<{ modelos: string[] }>("teste", () => fetch(`${base}/teste`, { method: "POST" }), "não foi possível conferir a conexão");
    if (r) setAviso(`Conexão confirmada: ${r.modelos.length} modelo(s) disponíveis, como ${r.modelos.slice(0, 2).join(" e ")}.`);
  }

  async function remover() {
    if (!contaParaRemover) return;
    const novo = await chamar<EstadoDaAssinatura>("remocao", () => fetch(`${base}/contas?arquivo=${encodeURIComponent(contaParaRemover)}`, { method: "DELETE" }), "não foi possível remover a conta");
    if (!novo) return;
    setEstado(novo);
    setContaParaRemover(null);
    if (novo.contas.length === 0) fechar();
    else {
      setVista("gerenciar");
      setAviso("Conta removida do proxy.");
    }
  }

  const contas = estado?.contas ?? [];
  const selo: SeloDaIntegracao = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.proxy !== "ok"
      ? { tom: "warning", texto: estado.proxy === "nao_configurado" ? "Proxy não configurado" : "Proxy fora do ar" }
      : contas.length > 0
        ? { tom: "success", texto: "Conectado" }
        : { tom: "neutral", texto: "Não conectado" };
  const resumo = !estado
    ? "Consultando o estado…"
    : estado.proxy === "nao_configurado"
      ? "Proxy de CLI sem configuração"
      : estado.proxy === "fora_do_ar"
        ? "O proxy de CLI não responde"
        : contas.length > 0
          ? `${contas.length} ${contas.length === 1 ? "conta conectada" : "contas conectadas"}`
          : "Nenhuma conta conectada";

  const avisos = <AvisosDaIntegracao falhaAoLer={falhaAoLer} aviso={aviso} erro={erro} />;
  const avisoDoProxy = estado && estado.proxy !== "ok" ? (
    <Alert tone="warning" title={estado.proxy === "nao_configurado" ? "O proxy de CLI não está configurado" : "O proxy de CLI não está respondendo"}>
      {estado.proxy === "nao_configurado"
        ? <>Rode <code>node scripts/cliproxy-config.mjs</code>, suba o serviço com <code>docker compose --profile ia-assinatura up -d cliproxy</code> e reinicie a API. Veja <code>docs/ia-assinatura.md</code>.</>
        : <>Suba o serviço com <code>docker compose --profile ia-assinatura up -d cliproxy</code> e confira o log dele.</>}
    </Alert>
  ) : null;

  let janela: JanelaDaIntegracao | null = null;
  if (aberta && vista === "gerenciar") {
    janela = {
      titulo: nome,
      descricao,
      aoFechar: fechar,
      conteudo: (
        <>
          {avisos}
          {avisoDoProxy}
          {contas.length > 0 ? (
            <ul className={styles.contas}>
              {contas.map((conta) => (
                <li key={conta.arquivo} className={styles.conta} aria-label={`Conta ${conta.email ?? conta.arquivo}`}>
                  <div className={styles.contaInfo}>
                    <strong>{conta.email ?? conta.arquivo}</strong>
                    {conta.email ? <p className={styles.nota}>{conta.arquivo}</p> : null}
                  </div>
                  <div className={styles.contaAcoes}>
                    <Button variant="danger" size="sm" onClick={() => { setContaParaRemover(conta.arquivo); ir("remover"); }}>Remover</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.nota}>Nenhuma conta conectada.</p>
          )}
        </>
      ),
      rodape: (
        <>
          <Button variant="secondary" onClick={conferir} loading={ocupado === "teste"} disabled={estado?.proxy !== "ok" || contas.length === 0}>Conferir conexão</Button>
          <Button onClick={() => ir("conectar")} disabled={estado?.proxy !== "ok"}>Adicionar conta</Button>
        </>
      ),
    };
  } else if (aberta && vista === "conectar") {
    const podeIniciar = estado?.proxy === "ok";
    janela = {
      titulo: `Conectar o ${provedor === "claude" ? "Claude" : "Codex"}`,
      descricao: "O login é feito no site do provedor. O token fica no proxy, não no Plugga OS.",
      textoFechar: login ? "Cancelar login" : "Cancelar",
      aoFechar: fechar,
      rodape: login ? undefined : <Button onClick={iniciarLogin} loading={ocupado === "login"} disabled={!podeIniciar}>Iniciar login</Button>,
      conteudo: (
        <>
          {avisos}
          {avisoDoProxy}
          {login ? (
            <div className={styles.cadastro}>
              <p className={styles.nota}>1. Abra a página do provedor e entre com a conta da assinatura. 2. Volte para esta tela: o resultado aparece sozinho.</p>
              <a className="button button--primary ui-button ui-button--md" href={login.url} target="_blank" rel="noopener noreferrer">Abrir a página de login</a>
              <p className={styles.nota} role="status">Aguardando você concluir o login…</p>
            </div>
          ) : (
            <p className={styles.nota}>Ao iniciar, o Plugga OS pede o link de login ao proxy. Você entra no site do provedor com a conta da assinatura e volta para esta tela.</p>
          )}
        </>
      ),
    };
  } else if (aberta && vista === "remover") {
    janela = {
      titulo: "Remover esta conta?",
      descricao: "O proxy apaga o login guardado. A conta no provedor não é afetada, e dá para conectar de novo.",
      perigo: true,
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button variant="danger" onClick={remover} loading={ocupado === "remocao"}>Remover conta</Button>,
      conteudo: (
        <>
          {avisos}
          {contaParaRemover ? <p className={styles.nota}>{contas.find((c) => c.arquivo === contaParaRemover)?.email ?? contaParaRemover}</p> : null}
        </>
      ),
    };
  }

  return (
    <CartaoDeIntegracao
      nome={nome}
      Icone={Icone}
      descricao={descricao}
      selo={selo}
      resumo={resumo}
      acao={{ rotulo: contas.length > 0 ? "Gerenciar" : "Conectar", destaque: contas.length === 0, desabilitada: !estado, aoClicar: () => ir(contas.length > 0 ? "gerenciar" : "conectar") }}
      janela={janela}
    />
  );
}
