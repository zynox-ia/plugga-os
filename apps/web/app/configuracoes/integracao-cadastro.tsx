"use client";

import { SearchCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EmpresaConsultada, EnderecoConsultado, EstadoDaConsultaCadastralComCofre } from "@plugga/shared";

import { Alert, Badge, Button, TextField } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { detalheDoErro } from "./integracao-api";
import styles from "./integracoes.module.css";

type Resultado = { tipo: "cnpj"; dados: EmpresaConsultada } | { tipo: "cep"; dados: EnderecoConsultado };

function enderecoEmTexto(e: EnderecoConsultado): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const cidade = [e.cidade, e.uf].filter(Boolean).join("/");
  return [rua, e.bairro, cidade].filter(Boolean).join(" · ") || "Sem endereço";
}

/**
 * Consulta de CNPJ e CEP: dados públicos (BrasilAPI), sem credencial. O cartão
 * liga e desliga para o sistema inteiro e deixa o desenvolvedor testar uma
 * consulta antes de as telas passarem a usá-la.
 */
export function IntegracaoCadastro() {
  const [estado, setEstado] = useState<EstadoDaConsultaCadastralComCofre | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [consulta, setConsulta] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/integracoes/cadastro", { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler o estado da consulta"));
      setEstado((await resposta.json()) as EstadoDaConsultaCadastralComCofre);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar o estado");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternar() {
    if (!estado) return;
    const ligar = !estado.ativa;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    setResultado(null);
    try {
      const resposta = await fetch("/api/integracoes/cadastro", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ativa: ligar }),
      });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível alterar a consulta"));
      await carregar();
      setAviso(ligar ? "Consulta ligada. As telas já podem usá-la." : "Consulta desligada para todo o sistema.");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "não foi possível alterar a consulta");
    } finally {
      setOcupado(false);
    }
  }

  async function testar(evento: FormEvent) {
    evento.preventDefault();
    const digitos = consulta.replace(/\D/g, "");
    const tipo = digitos.length === 14 ? "cnpj" : digitos.length === 8 ? "cep" : null;
    setErro(null);
    setAviso(null);
    setResultado(null);
    if (!tipo) {
      setErro("Informe um CNPJ (14 dígitos) ou um CEP (8 dígitos).");
      return;
    }
    setOcupado(true);
    try {
      const resposta = await fetch(`/api/cadastro/${tipo}/${digitos}`, { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível consultar"));
      const dados = (await resposta.json()) as EmpresaConsultada & EnderecoConsultado;
      setResultado(tipo === "cnpj" ? { tipo, dados } : { tipo, dados });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "não foi possível consultar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <article className={styles.cartao} aria-label="Consulta de CNPJ e CEP">
      <div className={styles.topo}>
        <span className={styles.marca} aria-hidden="true"><SearchCheck size={20} /></span>
        <div className={styles.titulo}>
          <h3>Consulta de CNPJ e CEP</h3>
          <p>Preenche o cadastro de clientes e leads a partir do CNPJ e do CEP.</p>
        </div>
        <Badge tone={!estado ? "neutral" : estado.ativa ? "success" : "neutral"}>
          {!estado ? "Consultando" : estado.ativa ? "Ligada" : "Desligada"}
        </Badge>
      </div>

      {falhaAoLer ? <Alert tone="danger" title={falhaAoLer} /> : null}
      {aviso ? <Alert tone="success" title={aviso} /> : null}
      {estado?.cofreConfigurado === false ? (
        <Alert tone="warning" title="O cofre não está pronto">
          Falta a variável <code>SECRETS_ENCRYPTION_KEY</code> no ambiente da API. Gere com{" "}
          <code>openssl rand -base64 32</code> e reinicie a API antes de ligar.
        </Alert>
      ) : null}

      {estado ? (
        <dl className={styles.detalhes}>
          <div><dt>Fonte</dt><dd>{estado.fonte}, dados públicos</dd></div>
          <div><dt>Credencial</dt><dd>Não precisa</dd></div>
          {estado.atualizadoEm ? <div><dt>Alterada em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
        </dl>
      ) : null}

      <div className={styles.acoes}>
        <Button variant={estado?.ativa ? "secondary" : "primary"} size="sm" onClick={alternar} loading={ocupado && !resultado} disabled={!estado}>
          {estado?.ativa ? "Desligar" : "Ligar consulta"}
        </Button>
      </div>

      {estado?.ativa ? (
        <form className={styles.formulario} onSubmit={testar}>
          <TextField
            label="Testar uma consulta"
            hint="Digite um CNPJ ou um CEP, com ou sem pontuação."
            inputMode="numeric"
            autoComplete="off"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
          />
          {erro ? <Alert tone="danger" title={erro} /> : null}
          <div className={styles.acoes}>
            <Button type="submit" variant="secondary" size="sm" loading={ocupado}>Consultar</Button>
          </div>
          {resultado?.tipo === "cnpj" ? (
            <dl className={styles.detalhes}>
              <div><dt>Razão social</dt><dd>{resultado.dados.razaoSocial}</dd></div>
              {resultado.dados.nomeFantasia ? <div><dt>Nome fantasia</dt><dd>{resultado.dados.nomeFantasia}</dd></div> : null}
              {resultado.dados.situacao ? <div><dt>Situação</dt><dd>{resultado.dados.situacao}</dd></div> : null}
              {resultado.dados.atividadePrincipal ? <div><dt>Atividade</dt><dd>{resultado.dados.atividadePrincipal.descricao}</dd></div> : null}
              {resultado.dados.endereco ? <div><dt>Endereço</dt><dd>{enderecoEmTexto(resultado.dados.endereco)}</dd></div> : null}
            </dl>
          ) : null}
          {resultado?.tipo === "cep" ? (
            <dl className={styles.detalhes}>
              <div><dt>Endereço</dt><dd>{enderecoEmTexto(resultado.dados)}</dd></div>
            </dl>
          ) : null}
        </form>
      ) : erro ? (
        <Alert tone="danger" title={erro} />
      ) : null}
    </article>
  );
}
