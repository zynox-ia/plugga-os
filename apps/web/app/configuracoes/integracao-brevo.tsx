"use client";

import { Mail } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EstadoDoBrevoComCofre } from "@plugga/shared";

import { Button, TextField } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { detalheDoErro } from "./integracao-api";
import { AvisosDaIntegracao, CartaoDeIntegracao, type JanelaDaIntegracao, type SeloDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = "gerenciar" | "conectar" | "teste" | "desconectar";

const DESCRICAO = "E-mails do sistema: convite de acesso e redefinição de senha.";

/**
 * Brevo: o provedor de e-mail do sistema (convite de acesso e redefinição de
 * senha), conectado pela plataforma. A chave é escrita-apenas: nunca volta do
 * servidor, só os quatro últimos caracteres. O campo é limpo ao gravar.
 */
export function IntegracaoBrevo() {
  const [estado, setEstado] = useState<EstadoDoBrevoComCofre | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const [vista, setVista] = useState<Vista>("gerenciar");
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

  function ir(proxima: Vista) {
    setErro(null);
    setAviso(null);
    setChave("");
    if (proxima === "conectar") {
      setRemetenteNome(estado?.remetente?.nome ?? "");
      setRemetenteEmail(estado?.remetente?.email ?? "");
    }
    setVista(proxima);
    setAberta(true);
  }

  function fechar() {
    setChave("");
    setErro(null);
    setAviso(null);
    setAberta(false);
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
    setVista("gerenciar");
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
    setVista("gerenciar");
    setAviso(`E-mail de teste enviado para ${destinatario}.`);
  }

  async function desconectar() {
    const resposta = await enviar(() => fetch("/api/email/brevo", { method: "DELETE" }), "não foi possível desconectar o Brevo");
    if (!resposta) return;
    await carregar();
    fechar();
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
    : estado.conectado && estado.remetente
      ? `Remetente: ${estado.remetente.email}`
      : "Nenhum remetente conectado";

  const avisos = (
    <AvisosDaIntegracao
      falhaAoLer={falhaAoLer}
      aviso={aviso}
      erro={erro}
      cofreConfigurado={estado?.cofreConfigurado}
      ilegivel={estado?.origem === "cofre_ilegivel" ? { titulo: "A configuração guardada não pode mais ser lida", texto: "A chave-mestra do cofre mudou. Conecte de novo para gravar a chave." } : null}
    />
  );

  const doCofre = estado?.origem === "cofre" || estado?.origem === "cofre_ilegivel";
  let janela: JanelaDaIntegracao | null = null;
  if (aberta && vista === "gerenciar") {
    janela = {
      titulo: "Brevo",
      descricao: DESCRICAO,
      aoFechar: fechar,
      conteudo: (
        <>
          {avisos}
          {estado?.conectado && estado.remetente ? (
            <dl className={styles.detalhes}>
              <div><dt>Remetente</dt><dd>{estado.remetente.nome} &lt;{estado.remetente.email}&gt;</dd></div>
              {estado.mascara ? <div><dt>Chave da API</dt><dd>{estado.mascara}</dd></div> : null}
              {estado.atualizadoEm ? <div><dt>Atualizado em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
              {estado.origem === "ambiente" ? <div><dt>Origem</dt><dd>Ambiente do servidor</dd></div> : null}
            </dl>
          ) : null}
          {estado?.origem === "ambiente" ? (
            <p className={styles.nota}>Configurado pelo ambiente do servidor. Conectar pela tela passa a valer no lugar dele, sem reiniciar nada.</p>
          ) : null}
        </>
      ),
      rodape: (
        <>
          {doCofre ? <Button variant="danger" onClick={() => ir("desconectar")}>Desconectar</Button> : null}
          {estado?.conectado ? <Button variant="secondary" onClick={() => ir("teste")}>Enviar e-mail de teste</Button> : null}
          <Button onClick={() => ir("conectar")}>{estado?.origem === "cofre" ? "Editar conexão" : "Conectar pela tela"}</Button>
        </>
      ),
    };
  } else if (aberta && vista === "conectar") {
    janela = {
      titulo: estado?.origem === "cofre" ? "Editar a conexão do Brevo" : "Conectar o Brevo",
      descricao: "A chave fica guardada cifrada no cofre da plataforma e não é exibida depois de salva.",
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button type="submit" form="form-brevo" loading={ocupado}>Salvar conexão</Button>,
      conteudo: (
        <form id="form-brevo" className={styles.formulario} onSubmit={conectar}>
          {avisos}
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
      ),
    };
  } else if (aberta && vista === "teste") {
    janela = {
      titulo: "Enviar e-mail de teste",
      descricao: "Usa a conexão atual para confirmar que o envio funciona.",
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button type="submit" form="form-brevo-teste" loading={ocupado}>Enviar teste</Button>,
      conteudo: (
        <form id="form-brevo-teste" className={styles.formulario} onSubmit={testar}>
          {avisos}
          <TextField label="Enviar para" type="email" required value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
        </form>
      ),
    };
  } else if (aberta && vista === "desconectar") {
    janela = {
      titulo: "Desconectar o Brevo?",
      descricao: "O sistema volta a usar a configuração do ambiente do servidor. Sem ela, nenhum e-mail é enviado: convites e redefinições de senha deixam de chegar.",
      perigo: true,
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button variant="danger" onClick={desconectar} loading={ocupado}>Desconectar</Button>,
      conteudo: avisos,
    };
  }

  return (
    <CartaoDeIntegracao
      nome="Brevo"
      Icone={Mail}
      descricao={DESCRICAO}
      selo={selo}
      resumo={resumo}
      acao={{ rotulo: estado?.conectado ? "Gerenciar" : "Conectar", destaque: !estado?.conectado, desabilitada: !estado, aoClicar: () => ir(estado?.conectado ? "gerenciar" : "conectar") }}
      janela={janela}
    />
  );
}
