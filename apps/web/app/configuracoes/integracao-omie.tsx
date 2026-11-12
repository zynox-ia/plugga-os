"use client";

import { Landmark } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EmpresaDoOmie, EstadoDoOmieComCofre } from "@plugga/shared";

import { Button, TextField } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { detalheDoErro } from "./integracao-api";
import { AvisosDaIntegracao, CartaoDeIntegracao, type JanelaDaIntegracao, type SeloDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = "gerenciar" | "conectar" | "desconectar";

const DESCRICAO = "Financeiro e notas fiscais (NF-e e NFS-e), com uma conta só para a plataforma.";

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
  const [aberta, setAberta] = useState(false);
  const [vista, setVista] = useState<Vista>("gerenciar");
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
    setAberta(true);
  }

  function fechar() {
    setAppKey("");
    setAppSecret("");
    setErro(null);
    setAviso(null);
    setAberta(false);
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
    setVista("gerenciar");
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
    fechar();
  }

  const selo: SeloDaIntegracao = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.origem === "cofre_ilegivel"
      ? { tom: "warning", texto: "Requer atenção" }
      : estado.conectado
        ? { tom: "success", texto: "Conectado" }
        : { tom: "neutral", texto: "Não conectado" };

  const resumo = !estado ? "Consultando o estado…" : estado.conectado ? `Chave do app ${estado.mascara}` : "Nenhuma conta conectada";

  const avisos = (
    <AvisosDaIntegracao
      falhaAoLer={falhaAoLer}
      aviso={aviso}
      erro={erro}
      cofreConfigurado={estado?.cofreConfigurado}
      ilegivel={estado?.origem === "cofre_ilegivel" ? { titulo: "A configuração guardada não pode mais ser lida", texto: "A chave-mestra do cofre mudou. Conecte de novo para gravar a chave e o segredo." } : null}
    />
  );

  let janela: JanelaDaIntegracao | null = null;
  if (aberta && vista === "gerenciar") {
    janela = {
      titulo: "OMIE",
      descricao: DESCRICAO,
      aoFechar: fechar,
      conteudo: (
        <>
          {avisos}
          {estado?.conectado ? (
            <dl className={styles.detalhes}>
              <div><dt>Chave do app</dt><dd>{estado.mascara}</dd></div>
              {estado.atualizadoEm ? <div><dt>Atualizado em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
              {empresa?.razaoSocial ? <div><dt>Empresa</dt><dd>{empresa.razaoSocial}</dd></div> : null}
              {empresa?.cnpj ? <div><dt>CNPJ</dt><dd>{cnpjComMascara(empresa.cnpj)}</dd></div> : null}
            </dl>
          ) : null}
        </>
      ),
      rodape: (
        <>
          <Button variant="danger" onClick={() => ir("desconectar")}>Desconectar</Button>
          {estado?.conectado ? <Button variant="secondary" onClick={testar} loading={ocupado === "teste"}>Testar conta</Button> : null}
          <Button onClick={() => ir("conectar")}>Editar conexão</Button>
        </>
      ),
    };
  } else if (aberta && vista === "conectar") {
    janela = {
      titulo: estado?.conectado ? "Editar a conexão do OMIE" : "Conectar o OMIE",
      descricao: "A chave e o segredo ficam guardados cifrados no cofre da plataforma e não são exibidos depois de salvos.",
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button type="submit" form="form-omie" loading={ocupado === "formulario"}>Salvar conexão</Button>,
      conteudo: (
        <form id="form-omie" className={styles.formulario} onSubmit={conectar}>
          {avisos}
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
      ),
    };
  } else if (aberta && vista === "desconectar") {
    janela = {
      titulo: "Desconectar o OMIE?",
      descricao: "O sistema deixa de enviar clientes, pedidos e notas ao OMIE até você conectar de novo.",
      perigo: true,
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button variant="danger" onClick={desconectar} loading={ocupado === "formulario"}>Desconectar</Button>,
      conteudo: avisos,
    };
  }

  return (
    <CartaoDeIntegracao
      nome="OMIE"
      Icone={Landmark}
      descricao={DESCRICAO}
      selo={selo}
      resumo={resumo}
      acao={{ rotulo: estado?.conectado ? "Gerenciar" : "Conectar", destaque: !estado?.conectado, desabilitada: !estado, aoClicar: () => ir(estado?.conectado ? "gerenciar" : "conectar") }}
      janela={janela}
    />
  );
}
