"use client";

import { Landmark } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EmpresaDoOmie, EstadoDoOmieComCofre } from "@plugga/shared";

import { Alert, Button, TextField } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { detalheDoErro } from "./integracao-api";
import { CartaoDeIntegracao, type SeloDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = "inicio" | "conectar" | "desconectar";

function cnpjComMascara(cnpj: string): string {
  return cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cnpj;
}

/**
 * OMIE: financeiro e nota fiscal, com uma conta só para a plataforma. A chave e o
 * segredo do app são escrita-apenas: nunca voltam do servidor, só os quatro
 * últimos caracteres da chave, e os campos são limpos ao gravar.
 */
export function IntegracaoOmie() {
  const [estado, setEstado] = useState<EstadoDoOmieComCofre | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("inicio");
  const [ocupado, setOcupado] = useState<"teste" | "formulario" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaDoOmie | null>(null);
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/integracoes/omie", { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler o estado do OMIE"));
      setEstado((await resposta.json()) as EstadoDoOmieComCofre);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar o OMIE");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function ir(proxima: Vista) {
    setErro(null);
    setAviso(null);
    setAppKey("");
    setAppSecret("");
    setVista(proxima);
  }

  function aoFechar() {
    setAppKey("");
    setAppSecret("");
    setErro(null);
    setAviso(null);
    setVista("inicio");
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
    const resposta = await chamar("formulario", () => fetch("/api/integracoes/omie", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appKey, appSecret }),
    }), "não foi possível conectar o OMIE");
    // A chave e o segredo saem da tela antes de qualquer outra coisa.
    setAppKey("");
    setAppSecret("");
    if (!resposta) return;
    setEmpresa(null);
    await carregar();
    setVista("inicio");
    setAviso("OMIE conectado. Use “Testar conta” para conferir de qual empresa é.");
  }

  async function testar() {
    setAviso(null);
    setEmpresa(null);
    const resposta = await chamar("teste", () => fetch("/api/integracoes/omie/teste", { method: "POST" }), "não foi possível testar a conta");
    if (!resposta) return;
    setEmpresa((await resposta.json().catch(() => null)) as EmpresaDoOmie | null);
    setAviso("Conta do OMIE confirmada.");
  }

  async function desconectar() {
    const resposta = await chamar("formulario", () => fetch("/api/integracoes/omie", { method: "DELETE" }), "não foi possível desconectar o OMIE");
    if (!resposta) return;
    setEmpresa(null);
    await carregar();
    setVista("inicio");
    setAviso("OMIE desconectado. Nada mais é enviado ao financeiro até conectar de novo.");
  }

  const selo: SeloDaIntegracao = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.origem === "cofre_ilegivel"
      ? { tom: "warning", texto: "Requer atenção" }
      : estado.conectado
        ? { tom: "success", texto: "Conectado" }
        : { tom: "neutral", texto: "Não conectado" };

  const resumo = !estado ? "Consultando o estado…" : estado.conectado ? `Chave do app ${estado.mascara}` : "Nenhuma conta conectada";

  const rodape =
    vista === "conectar" ? <Button type="submit" form="form-omie" loading={ocupado === "formulario"}>Salvar conexão</Button>
    : vista === "desconectar" ? <Button variant="danger" onClick={desconectar} loading={ocupado === "formulario"}>Desconectar</Button>
    : undefined;

  return (
    <CartaoDeIntegracao
      nome="OMIE"
      Icone={Landmark}
      descricao="Financeiro e notas fiscais (NF-e e NFS-e), com uma conta só para a plataforma."
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
          <code>openssl rand -base64 32</code> e reinicie a API antes de conectar.
        </Alert>
      ) : null}
      {estado?.origem === "cofre_ilegivel" ? (
        <Alert tone="warning" title="A configuração guardada não pode mais ser lida">
          A chave-mestra do cofre mudou. Conecte de novo para gravar a chave e o segredo.
        </Alert>
      ) : null}

      {vista === "inicio" ? (
        <>
          {estado?.conectado ? (
            <dl className={styles.detalhes}>
              <div><dt>Chave do app</dt><dd>{estado.mascara}</dd></div>
              {estado.atualizadoEm ? <div><dt>Atualizado em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
              {empresa?.razaoSocial ? <div><dt>Empresa</dt><dd>{empresa.razaoSocial}</dd></div> : null}
              {empresa?.cnpj ? <div><dt>CNPJ</dt><dd>{cnpjComMascara(empresa.cnpj)}</dd></div> : null}
            </dl>
          ) : null}
          <div className={styles.acoes}>
            <Button variant={estado?.conectado ? "secondary" : "primary"} size="sm" onClick={() => ir("conectar")} disabled={!estado}>
              {estado?.conectado ? "Editar conexão" : "Conectar"}
            </Button>
            {estado?.conectado ? (
              <Button variant="secondary" size="sm" onClick={testar} loading={ocupado === "teste"}>Testar conta</Button>
            ) : null}
            {estado?.origem === "cofre" || estado?.origem === "cofre_ilegivel" ? (
              <Button variant="danger" size="sm" onClick={() => ir("desconectar")}>Desconectar</Button>
            ) : null}
          </div>
        </>
      ) : null}

      {vista === "conectar" ? (
        <form id="form-omie" className={styles.formulario} onSubmit={conectar}>
          <p className={styles.nota}>A chave e o segredo ficam guardados cifrados no cofre da plataforma e não são exibidos depois de salvos.</p>
          <TextField
            label="Chave do app (App Key)"
            hint={estado?.conectado ? "Cole a chave e o segredo de novo para salvar as alterações." : "No OMIE: Configurações › Meus aplicativos (só administradores)."}
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
          />
          <TextField
            label="Segredo do app (App Secret)"
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
          />
        </form>
      ) : null}

      {vista === "desconectar" ? (
        <p className={styles.nota}>O sistema deixa de enviar clientes, pedidos e notas ao OMIE até você conectar de novo.</p>
      ) : null}
    </CartaoDeIntegracao>
  );
}
