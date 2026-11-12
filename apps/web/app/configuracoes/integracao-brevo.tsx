"use client";

import { Mail } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EstadoDoBrevoComCofre } from "@plugga/shared";

import { Alert, Badge, Button, Dialog, TextField, type Tone } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import styles from "./integracoes.module.css";

type Janela = "conectar" | "teste" | "desconectar" | null;

async function detalheDoErro(resposta: Response, padrao: string): Promise<string> {
  // `ok` antes do parse: um erro sem JSON (proxy fora do ar) não pode estourar aqui.
  const corpo = (await resposta.json().catch(() => null)) as { message?: unknown } | null;
  return typeof corpo?.message === "string" ? corpo.message : padrao;
}

/**
 * Brevo: o provedor de e-mail do sistema (convite de acesso e redefinição de
 * senha), conectado pela empresa. A chave é escrita-apenas: nunca volta do
 * servidor, só os quatro últimos caracteres. O campo é limpo ao gravar.
 */
export function IntegracaoBrevo() {
  const [estado, setEstado] = useState<EstadoDoBrevoComCofre | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [janela, setJanela] = useState<Janela>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [chave, setChave] = useState("");
  const [remetenteNome, setRemetenteNome] = useState("");
  const [remetenteEmail, setRemetenteEmail] = useState("");
  const [destinatario, setDestinatario] = useState("");

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/email/brevo", { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler o estado do Brevo"));
      setEstado((await resposta.json()) as EstadoDoBrevoComCofre);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar o Brevo");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(proxima: Exclude<Janela, null>) {
    setErro(null);
    setAviso(null);
    setChave("");
    if (proxima === "conectar") {
      setRemetenteNome(estado?.remetente?.nome ?? "");
      setRemetenteEmail(estado?.remetente?.email ?? "");
    }
    setJanela(proxima);
  }

  function fechar() {
    if (ocupado) return;
    setChave("");
    setJanela(null);
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
      () => fetch("/api/email/brevo", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chave, remetenteNome, remetenteEmail }),
      }),
      "não foi possível conectar o Brevo",
    );
    // A chave sai da tela antes de qualquer outra coisa.
    setChave("");
    if (!resposta) return;
    await carregar();
    setJanela(null);
    setAviso("Brevo conectado. Os próximos e-mails do sistema saem por ele.");
  }

  async function testar(evento: FormEvent) {
    evento.preventDefault();
    const resposta = await enviar(
      () => fetch("/api/email/brevo/teste", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destinatario }),
      }),
      "não foi possível enviar o e-mail de teste",
    );
    if (!resposta) return;
    setJanela(null);
    setAviso(`E-mail de teste enviado para ${destinatario}.`);
  }

  async function desconectar() {
    const resposta = await enviar(() => fetch("/api/email/brevo", { method: "DELETE" }), "não foi possível desconectar o Brevo");
    if (!resposta) return;
    await carregar();
    setJanela(null);
    setAviso("Brevo desconectado da tela. O sistema voltou à configuração do ambiente.");
  }

  const selo: { tom: Tone; texto: string } = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.origem === "cofre_ilegivel"
      ? { tom: "warning", texto: "Requer atenção" }
      : estado.conectado
        ? { tom: "success", texto: "Conectado" }
        : { tom: "neutral", texto: "Não conectado" };

  return (
    <article className={styles.cartao} aria-label="Brevo">
      <div className={styles.topo}>
        <span className={styles.marca} aria-hidden="true"><Mail size={20} /></span>
        <div className={styles.titulo}>
          <h3>Brevo</h3>
          <p>E-mails do sistema: convite de acesso e redefinição de senha.</p>
        </div>
        <Badge tone={selo.tom}>{selo.texto}</Badge>
      </div>

      {falhaAoLer ? <Alert tone="danger" title={falhaAoLer} /> : null}
      {aviso ? <Alert tone="success" title={aviso} /> : null}
      {estado?.cofreConfigurado === false ? (
        <Alert tone="warning" title="O cofre não está pronto">
          Falta a variável <code>SECRETS_ENCRYPTION_KEY</code> no ambiente da API. Gere com{" "}
          <code>openssl rand -base64 32</code> e reinicie a API antes de conectar.
        </Alert>
      ) : null}
      {estado?.origem === "cofre_ilegivel" ? (
        <Alert tone="warning" title="A configuração guardada não pode mais ser lida">
          A chave-mestra do cofre mudou. Conecte de novo para gravar a chave.
        </Alert>
      ) : null}

      {estado?.conectado && estado.remetente ? (
        <dl className={styles.detalhes}>
          <div><dt>Remetente</dt><dd>{estado.remetente.nome} &lt;{estado.remetente.email}&gt;</dd></div>
          {estado.mascara ? <div><dt>Chave da API</dt><dd>{estado.mascara}</dd></div> : null}
          {estado.atualizadoEm ? <div><dt>Atualizado em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
          {estado.origem === "ambiente" ? (
            <div><dt>Origem</dt><dd>Ambiente do servidor</dd></div>
          ) : null}
        </dl>
      ) : null}
      {estado?.origem === "ambiente" ? (
        <p className={styles.nota}>
          Configurado pelo ambiente do servidor. Conectar aqui passa a valer no lugar dele, sem reiniciar nada.
        </p>
      ) : null}

      <div className={styles.acoes}>
        <Button variant={estado?.conectado ? "secondary" : "primary"} size="sm" onClick={() => abrir("conectar")} disabled={!estado}>
          {estado?.origem === "cofre" ? "Editar conexão" : "Conectar"}
        </Button>
        {estado?.conectado ? (
          <Button variant="secondary" size="sm" onClick={() => abrir("teste")}>Enviar e-mail de teste</Button>
        ) : null}
        {estado?.origem === "cofre" || estado?.origem === "cofre_ilegivel" ? (
          <Button variant="danger" size="sm" onClick={() => abrir("desconectar")}>Desconectar</Button>
        ) : null}
      </div>

      {janela === "conectar" ? (
        <Dialog
          title={estado?.origem === "cofre" ? "Editar conexão do Brevo" : "Conectar o Brevo"}
          description="A chave fica guardada cifrada no cofre da plataforma e não é exibida depois de salva."
          onClose={fechar}
          size="estreita"
          footer={<Button type="submit" form="form-brevo" loading={ocupado}>Salvar conexão</Button>}
        >
          <form id="form-brevo" className={styles.formulario} onSubmit={conectar}>
            {erro ? <Alert tone="danger" title={erro} /> : null}
            <TextField
              label="Chave da API"
              hint={estado?.origem === "cofre" ? "Cole a chave de novo para salvar as alterações." : "Gerada no painel do Brevo, em SMTP e API."}
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              value={chave}
              onChange={(e) => setChave(e.target.value)}
            />
            <TextField label="Nome do remetente" required value={remetenteNome} onChange={(e) => setRemetenteNome(e.target.value)} />
            <TextField
              label="E-mail do remetente"
              hint="Precisa estar validado como remetente no Brevo."
              type="email"
              required
              value={remetenteEmail}
              onChange={(e) => setRemetenteEmail(e.target.value)}
            />
          </form>
        </Dialog>
      ) : null}

      {janela === "teste" ? (
        <Dialog
          title="Enviar e-mail de teste"
          description="Usa a conexão atual para confirmar que o envio funciona."
          onClose={fechar}
          size="estreita"
          footer={<Button type="submit" form="form-brevo-teste" loading={ocupado}>Enviar teste</Button>}
        >
          <form id="form-brevo-teste" className={styles.formulario} onSubmit={testar}>
            {erro ? <Alert tone="danger" title={erro} /> : null}
            <TextField label="Enviar para" type="email" required value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
          </form>
        </Dialog>
      ) : null}

      {janela === "desconectar" ? (
        <Dialog
          title="Desconectar o Brevo?"
          description="O sistema volta a usar a configuração do ambiente do servidor. Sem ela, nenhum e-mail é enviado: convites e redefinições de senha deixam de chegar."
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
