"use client";

import { Landmark } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EmpresaDoOmie, EstadoDoOmieComCofre } from "@plugga/shared";

import { Alert, Badge, Button, Dialog, TextField, type Tone } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { detalheDoErro } from "./integracao-api";
import styles from "./integracoes.module.css";

type Janela = "conectar" | "desconectar" | null;

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
  const [janela, setJanela] = useState<Janela>(null);
  const [ocupado, setOcupado] = useState(false);
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

  function abrir(proxima: Exclude<Janela, null>) {
    setErro(null);
    setAviso(null);
    setAppKey("");
    setAppSecret("");
    setJanela(proxima);
  }

  function fechar() {
    if (ocupado) return;
    setAppKey("");
    setAppSecret("");
    setJanela(null);
  }

  async function chamar(chamada: () => Promise<Response>, padrao: string): Promise<Response | null> {
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
    const resposta = await chamar(() => fetch("/api/integracoes/omie", {
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
    setJanela(null);
    setAviso("OMIE conectado. Use “Testar conta” para conferir de qual empresa é.");
  }

  async function testar() {
    setAviso(null);
    setEmpresa(null);
    const resposta = await chamar(() => fetch("/api/integracoes/omie/teste", { method: "POST" }), "não foi possível testar a conta");
    if (!resposta) return;
    setEmpresa((await resposta.json().catch(() => null)) as EmpresaDoOmie | null);
    setAviso("Conta do OMIE confirmada.");
  }

  async function desconectar() {
    const resposta = await chamar(() => fetch("/api/integracoes/omie", { method: "DELETE" }), "não foi possível desconectar o OMIE");
    if (!resposta) return;
    setEmpresa(null);
    await carregar();
    setJanela(null);
    setAviso("OMIE desconectado. Nada mais é enviado ao financeiro até conectar de novo.");
  }

  const selo: { tom: Tone; texto: string } = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.origem === "cofre_ilegivel"
      ? { tom: "warning", texto: "Requer atenção" }
      : estado.conectado
        ? { tom: "success", texto: "Conectado" }
        : { tom: "neutral", texto: "Não conectado" };

  return (
    <article className={styles.cartao} aria-label="OMIE">
      <div className={styles.topo}>
        <span className={styles.marca} aria-hidden="true"><Landmark size={20} /></span>
        <div className={styles.titulo}>
          <h3>OMIE</h3>
          <p>Financeiro e notas fiscais (NF-e e NFS-e), com uma conta só para a plataforma.</p>
        </div>
        <Badge tone={selo.tom}>{selo.texto}</Badge>
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
      {estado?.origem === "cofre_ilegivel" ? (
        <Alert tone="warning" title="A configuração guardada não pode mais ser lida">
          A chave-mestra do cofre mudou. Conecte de novo para gravar a chave e o segredo.
        </Alert>
      ) : null}

      {estado?.conectado ? (
        <dl className={styles.detalhes}>
          <div><dt>Chave do app</dt><dd>{estado.mascara}</dd></div>
          {estado.atualizadoEm ? <div><dt>Atualizado em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
          {empresa ? (
            <>
              {empresa.razaoSocial ? <div><dt>Empresa</dt><dd>{empresa.razaoSocial}</dd></div> : null}
              {empresa.cnpj ? <div><dt>CNPJ</dt><dd>{cnpjComMascara(empresa.cnpj)}</dd></div> : null}
            </>
          ) : null}
        </dl>
      ) : null}

      <div className={styles.acoes}>
        <Button variant={estado?.conectado ? "secondary" : "primary"} size="sm" onClick={() => abrir("conectar")} disabled={!estado}>
          {estado?.conectado ? "Editar conexão" : "Conectar"}
        </Button>
        {estado?.conectado ? (
          <Button variant="secondary" size="sm" onClick={testar} loading={ocupado && janela === null}>Testar conta</Button>
        ) : null}
        {estado?.origem === "cofre" || estado?.origem === "cofre_ilegivel" ? (
          <Button variant="danger" size="sm" onClick={() => abrir("desconectar")}>Desconectar</Button>
        ) : null}
      </div>

      {janela === "conectar" ? (
        <Dialog
          title={estado?.conectado ? "Editar conexão do OMIE" : "Conectar o OMIE"}
          description="A chave e o segredo ficam guardados cifrados no cofre da plataforma e não são exibidos depois de salvos."
          onClose={fechar}
          size="estreita"
          footer={<Button type="submit" form="form-omie" loading={ocupado}>Salvar conexão</Button>}
        >
          <form id="form-omie" className={styles.formulario} onSubmit={conectar}>
            {erro ? <Alert tone="danger" title={erro} /> : null}
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
        </Dialog>
      ) : null}

      {janela === "desconectar" ? (
        <Dialog
          title="Desconectar o OMIE?"
          description="O sistema deixa de enviar clientes, pedidos e notas ao OMIE até você conectar de novo."
          variant="danger"
          onClose={fechar}
          size="estreita"
          footer={<Button variant="danger" onClick={desconectar} loading={ocupado}>Desconectar</Button>}
        >
          {erro ? <Alert tone="danger" title={erro} /> : null}
        </Dialog>
      ) : null}
    </article>
  );
}
