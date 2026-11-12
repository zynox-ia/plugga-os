"use client";

import { FileSignature } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CompanyKey, ContaConsultadaDaAutentique, ContaDaAutentique, EstadoDaAutentiqueComCofre } from "@plugga/shared";

import { Alert, Badge, Button, Dialog, Switch, TextField, type Tone } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { EMPRESAS_POR_ID } from "../lib/organizacao";
import { detalheDoErro } from "./integracao-api";
import styles from "./integracoes.module.css";

type Janela = { tipo: "conectar" | "desconectar"; empresa: CompanyKey } | null;

function selo(conta: ContaDaAutentique): { tom: Tone; texto: string } {
  if (conta.origem === "cofre_ilegivel") return { tom: "warning", texto: "Requer atenção" };
  return conta.conectada ? { tom: "success", texto: "Conectada" } : { tom: "neutral", texto: "Não conectada" };
}

/**
 * Autentique (assinatura eletrônica): uma conta por empresa. A Plugga e a Waze
 * Energia têm cada uma o seu token, e o contrato de uma empresa assina na conta
 * dela. O token é escrita-apenas: nunca volta do servidor, só os quatro últimos
 * caracteres, e o campo é limpo ao gravar.
 */
export function IntegracaoAutentique() {
  const [estado, setEstado] = useState<EstadoDaAutentiqueComCofre | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [janela, setJanela] = useState<Janela>(null);
  const [ocupado, setOcupado] = useState<CompanyKey | "janela" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [sandbox, setSandbox] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/integracoes/autentique", { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler o estado da Autentique"));
      setEstado((await resposta.json()) as EstadoDaAutentiqueComCofre);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar a Autentique");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(tipo: "conectar" | "desconectar", conta: ContaDaAutentique) {
    setErro(null);
    setAviso(null);
    setToken("");
    setSandbox(conta.conectada ? conta.sandbox : true);
    setJanela({ tipo, empresa: conta.empresa });
  }

  function fechar() {
    if (ocupado === "janela") return;
    setToken("");
    setJanela(null);
  }

  async function chamar(quem: CompanyKey | "janela", chamada: () => Promise<Response>, padrao: string): Promise<Response | null> {
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
    if (janela?.tipo !== "conectar") return;
    const { empresa } = janela;
    const resposta = await chamar("janela", () => fetch(`/api/integracoes/autentique/${empresa}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, sandbox }),
    }), "não foi possível conectar a Autentique");
    // O token sai da tela antes de qualquer outra coisa.
    setToken("");
    if (!resposta) return;
    await carregar();
    setJanela(null);
    setAviso(`Autentique da ${EMPRESAS_POR_ID[empresa].nome} conectada.`);
  }

  async function testar(empresa: CompanyKey) {
    setAviso(null);
    const resposta = await chamar(empresa, () => fetch(`/api/integracoes/autentique/${empresa}/teste`, { method: "POST" }), "não foi possível testar a conta");
    if (!resposta) return;
    const dono = (await resposta.json().catch(() => null)) as ContaConsultadaDaAutentique | null;
    const quem = [dono?.nome, dono?.email].filter(Boolean).join(" · ");
    setAviso(`Conta da ${EMPRESAS_POR_ID[empresa].nome} confirmada${quem ? `: ${quem}` : ""}.`);
  }

  async function desconectar() {
    if (janela?.tipo !== "desconectar") return;
    const { empresa } = janela;
    const resposta = await chamar("janela", () => fetch(`/api/integracoes/autentique/${empresa}`, { method: "DELETE" }), "não foi possível desconectar a Autentique");
    if (!resposta) return;
    await carregar();
    setJanela(null);
    setAviso(`Autentique da ${EMPRESAS_POR_ID[empresa].nome} desconectada.`);
  }

  const alvo = janela ? EMPRESAS_POR_ID[janela.empresa].nome : "";
  const contaDaJanela = estado?.contas.find((c) => c.empresa === janela?.empresa);

  return (
    <article className={styles.cartao} aria-label="Autentique">
      <div className={styles.topo}>
        <span className={styles.marca} aria-hidden="true"><FileSignature size={20} /></span>
        <div className={styles.titulo}>
          <h3>Autentique</h3>
          <p>Assinatura eletrônica de propostas e contratos, com uma conta por empresa.</p>
        </div>
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

      <ul className={styles.contas}>
        {(estado?.contas ?? []).map((conta) => {
          const s = selo(conta);
          return (
            <li key={conta.empresa} className={styles.conta} aria-label={`Conta da ${EMPRESAS_POR_ID[conta.empresa].nome}`}>
              <div className={styles.contaTopo}>
                <strong>{EMPRESAS_POR_ID[conta.empresa].nome}</strong>
                <Badge tone={s.tom}>{s.texto}</Badge>
              </div>
              {conta.conectada ? (
                <p className={styles.nota}>
                  Token {conta.mascara} · {conta.sandbox ? "modo de testes" : "valendo juridicamente"}
                  {conta.atualizadoEm ? ` · atualizado em ${formatarDataHora(conta.atualizadoEm)}` : ""}
                </p>
              ) : null}
              {conta.origem === "cofre_ilegivel" ? (
                <p className={styles.nota}>A chave-mestra do cofre mudou. Conecte de novo para gravar o token.</p>
              ) : null}
              <div className={styles.acoes}>
                <Button variant={conta.conectada ? "secondary" : "primary"} size="sm" onClick={() => abrir("conectar", conta)}>
                  {conta.conectada ? "Editar" : "Conectar"}
                </Button>
                {conta.conectada ? (
                  <Button variant="secondary" size="sm" onClick={() => testar(conta.empresa)} loading={ocupado === conta.empresa}>Testar conta</Button>
                ) : null}
                {conta.origem === "cofre" || conta.origem === "cofre_ilegivel" ? (
                  <Button variant="danger" size="sm" onClick={() => abrir("desconectar", conta)}>Desconectar</Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {janela?.tipo === "conectar" ? (
        <Dialog
          title={`${contaDaJanela?.conectada ? "Editar" : "Conectar"} a Autentique da ${alvo}`}
          description="O token fica guardado cifrado no cofre da plataforma e não é exibido depois de salvo."
          onClose={fechar}
          size="estreita"
          footer={<Button type="submit" form="form-autentique" loading={ocupado === "janela"}>Salvar conta</Button>}
        >
          <form id="form-autentique" className={styles.formulario} onSubmit={conectar}>
            {erro ? <Alert tone="danger" title={erro} /> : null}
            <TextField
              label="Token da API"
              hint={contaDaJanela?.conectada ? "Cole o token de novo para salvar as alterações." : `Gerado no painel da Autentique da ${alvo}, em Configurações › API.`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Switch
              label="Modo de testes (sandbox)"
              description="Os documentos criados não valem juridicamente nem consomem a franquia. Desligue só quando for assinar de verdade."
              checked={sandbox}
              onChange={(e) => setSandbox(e.target.checked)}
            />
          </form>
        </Dialog>
      ) : null}

      {janela?.tipo === "desconectar" ? (
        <Dialog
          title={`Desconectar a Autentique da ${alvo}?`}
          description={`Os contratos da ${alvo} deixam de poder ser enviados para assinatura até você conectar de novo. A conta da outra empresa não é afetada.`}
          variant="danger"
          onClose={fechar}
          size="estreita"
          footer={<Button variant="danger" onClick={desconectar} loading={ocupado === "janela"}>Desconectar</Button>}
        >
          {erro ? <Alert tone="danger" title={erro} /> : null}
        </Dialog>
      ) : null}
    </article>
  );
}
