"use client";

import { KeyRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EstadoDoGoogleOAuthComCofre } from "@plugga/shared";

import { Alert, Button, IconCopy, TextField } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { detalheDoErro } from "./integracao-api";
import { CartaoDeIntegracao, type SeloDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = "inicio" | "conectar" | "desconectar";

const ROTULO_DO_ESCOPO: Record<string, string> = {
  openid: "Identificar a conta (openid)",
  email: "Ver o e-mail da conta (email)",
  "https://www.googleapis.com/auth/calendar.events": "Ver e editar eventos da agenda (calendar.events)",
};

/**
 * Google (OAuth): as credenciais do app criado no Google Cloud. É infraestrutura
 * da plataforma (só o desenvolvedor vê): sem elas ninguém conecta a própria
 * agenda. O client secret é escrita-apenas: nunca volta do servidor, só os
 * quatro últimos caracteres. O campo é limpo ao gravar. A URI de redirecionamento
 * a cadastrar no Google Cloud fica no modal.
 */
export function IntegracaoGoogleOAuth() {
  const [estado, setEstado] = useState<EstadoDoGoogleOAuthComCofre | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("inicio");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/google/oauth", { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler as credenciais do Google"));
      setEstado((await resposta.json()) as EstadoDoGoogleOAuthComCofre);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar o Google");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function ir(proxima: Vista) {
    setErro(null);
    setAviso(null);
    setClientSecret("");
    if (proxima === "conectar") setClientId(estado?.clientId ?? "");
    setVista(proxima);
  }

  function aoFechar() {
    setClientSecret("");
    setErro(null);
    setAviso(null);
    setVista("inicio");
  }

  async function enviar(chamada: () => Promise<Response>, padrao: string): Promise<Response | null> {
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
    const resposta = await enviar(
      () => fetch("/api/google/oauth", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      }),
      "não foi possível guardar as credenciais do Google",
    );
    // O secret sai da tela antes de qualquer outra coisa.
    setClientSecret("");
    if (!resposta) return;
    await carregar();
    setVista("inicio");
    setAviso("Credenciais do Google guardadas. As pessoas já podem conectar a própria agenda.");
  }

  async function desconectar() {
    const resposta = await enviar(() => fetch("/api/google/oauth", { method: "DELETE" }), "não foi possível remover as credenciais do Google");
    if (!resposta) return;
    await carregar();
    setVista("inicio");
    setAviso("Credenciais removidas. Ninguém consegue conectar uma agenda nova até cadastrar de novo.");
  }

  async function copiarUri() {
    if (!estado) return;
    try {
      await navigator.clipboard.writeText(estado.urlDeRetorno);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2_000);
    } catch {
      // Sem permissão de área de transferência o texto continua selecionável na tela.
    }
  }

  const selo: SeloDaIntegracao = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.origem === "cofre_ilegivel"
      ? { tom: "warning", texto: "Requer atenção" }
      : estado.conectado
        ? { tom: "success", texto: "Conectado" }
        : { tom: "neutral", texto: "Não conectado" };

  const resumo = !estado
    ? "Consultando o estado…"
    : estado.conectado && estado.clientId
      ? `Cliente ${estado.clientId}`
      : "Credenciais não cadastradas";

  const rodape =
    vista === "conectar" ? <Button type="submit" form="form-google-oauth" loading={ocupado}>Salvar credenciais</Button>
    : vista === "desconectar" ? <Button variant="danger" onClick={desconectar} loading={ocupado}>Remover</Button>
    : undefined;

  return (
    <CartaoDeIntegracao
      nome="Google (OAuth)"
      Icone={KeyRound}
      descricao="Credenciais do app do Google Cloud que permitem a cada pessoa conectar a própria agenda."
      selo={selo}
      resumo={resumo}
      rodape={rodape}
      aoFechar={aoFechar}
    >
      {falhaAoLer ? <Alert tone="danger" title={falhaAoLer} /> : null}
      {aviso ? <Alert tone="success" title={aviso} /> : null}
      {erro ? <Alert tone="danger" title={erro} /> : null}
      {estado?.cofreConfigurado === false ? (
        <Alert tone="warning" title="O cofre não está pronto">
          Falta a variável <code>SECRETS_ENCRYPTION_KEY</code> no ambiente da API. Gere com{" "}
          <code>openssl rand -base64 32</code> e reinicie a API antes de cadastrar.
        </Alert>
      ) : null}
      {estado?.origem === "cofre_ilegivel" ? (
        <Alert tone="warning" title="As credenciais guardadas não podem mais ser lidas">
          A chave-mestra do cofre mudou. Cadastre de novo para gravar as credenciais.
        </Alert>
      ) : null}

      {vista === "inicio" ? (
        <>
          {estado?.conectado && estado.clientId ? (
            <dl className={styles.detalhes}>
              <div><dt>ID do cliente</dt><dd>{estado.clientId}</dd></div>
              {estado.mascara ? <div><dt>Chave secreta</dt><dd>{estado.mascara}</dd></div> : null}
              {estado.atualizadoEm ? <div><dt>Atualizado em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
            </dl>
          ) : null}

          {estado ? (
            <div className={styles.cadastro}>
              <p className={styles.nota}>No Google Cloud, cadastre no cliente OAuth a URI de redirecionamento abaixo, exatamente assim.</p>
              <div className={styles.copiavel}>
                <code className={styles.codigo}>{estado.urlDeRetorno}</code>
                <Button
                  variant="secondary"
                  size="sm"
                  iconOnly
                  icon={<IconCopy />}
                  aria-label={copiado ? "URI copiada" : "Copiar a URI de redirecionamento"}
                  onClick={copiarUri}
                />
              </div>
              <p className={styles.nota}>
                Permissões pedidas a quem conecta: {estado.escopos.map((escopo) => ROTULO_DO_ESCOPO[escopo] ?? escopo).join("; ")}.
              </p>
            </div>
          ) : null}

          <div className={styles.acoes}>
            <Button variant={estado?.conectado ? "secondary" : "primary"} size="sm" onClick={() => ir("conectar")} disabled={!estado}>
              {estado?.origem === "cofre" ? "Editar credenciais" : "Cadastrar credenciais"}
            </Button>
            {estado?.origem === "cofre" || estado?.origem === "cofre_ilegivel" ? (
              <Button variant="danger" size="sm" onClick={() => ir("desconectar")}>Remover</Button>
            ) : null}
          </div>
        </>
      ) : null}

      {vista === "conectar" ? (
        <form id="form-google-oauth" className={styles.formulario} onSubmit={conectar}>
          <p className={styles.nota}>A chave secreta fica guardada cifrada no cofre da plataforma e não é exibida depois de salva.</p>
          <TextField
            label="ID do cliente"
            hint="Gerado no Google Cloud, em APIs e serviços, Credenciais. Termina em .apps.googleusercontent.com."
            autoComplete="off"
            spellCheck={false}
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
          <TextField
            label="Chave secreta do cliente"
            hint={estado?.origem === "cofre" ? "Cole a chave de novo para salvar as alterações." : "Mostrada uma única vez pelo Google ao criar o cliente."}
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
          />
        </form>
      ) : null}

      {vista === "desconectar" ? (
        <p className={styles.nota}>
          Ninguém consegue conectar uma agenda nova, e as já conectadas ficam sem uso, até cadastrar de novo.
        </p>
      ) : null}
    </CartaoDeIntegracao>
  );
}
