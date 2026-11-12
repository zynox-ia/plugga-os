"use client";

import { FileSignature } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CompanyKey, ContaConsultadaDaAutentique, ContaDaAutentique, EstadoDaAutentiqueComCofre } from "@plugga/shared";

import { Badge, Button, Switch, TextField, type Tone } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { EMPRESAS_POR_ID } from "../lib/organizacao";
import { detalheDoErro } from "./integracao-api";
import { AvisosDaIntegracao, CartaoDeIntegracao, type JanelaDaIntegracao, type SeloDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = { tipo: "gerenciar" } | { tipo: "conectar" | "desconectar"; empresa: CompanyKey };

const DESCRICAO = "Assinatura eletrônica de propostas e contratos, com uma conta por empresa.";

function seloDaConta(conta: ContaDaAutentique): { tom: Tone; texto: string } {
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
  const [aberta, setAberta] = useState(false);
  const [vista, setVista] = useState<Vista>({ tipo: "gerenciar" });
  const [ocupado, setOcupado] = useState<CompanyKey | "formulario" | null>(null);
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

  function abrirLista() {
    setErro(null);
    setAviso(null);
    setVista({ tipo: "gerenciar" });
    setAberta(true);
  }

  function ir(tipo: "conectar" | "desconectar", conta: ContaDaAutentique) {
    setErro(null);
    setAviso(null);
    setToken("");
    setSandbox(conta.conectada ? conta.sandbox : true);
    setVista({ tipo, empresa: conta.empresa });
  }

  function fechar() {
    setToken("");
    setErro(null);
    setAviso(null);
    setAberta(false);
  }

  async function chamar(quem: CompanyKey | "formulario", chamada: () => Promise<Response>, padrao: string): Promise<Response | null> {
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
    if (vista.tipo !== "conectar") return;
    const { empresa } = vista;
    const resposta = await chamar("formulario", () => fetch(`/api/integracoes/autentique/${empresa}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, sandbox }),
    }), "não foi possível conectar a Autentique");
    // O token sai da tela antes de qualquer outra coisa.
    setToken("");
    if (!resposta) return;
    await carregar();
    setVista({ tipo: "gerenciar" });
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
    if (vista.tipo !== "desconectar") return;
    const { empresa } = vista;
    const resposta = await chamar("formulario", () => fetch(`/api/integracoes/autentique/${empresa}`, { method: "DELETE" }), "não foi possível desconectar a Autentique");
    if (!resposta) return;
    await carregar();
    setVista({ tipo: "gerenciar" });
    setAviso(`Autentique da ${EMPRESAS_POR_ID[empresa].nome} desconectada.`);
  }

  const contas = estado?.contas ?? [];
  const conectadas = contas.filter((c) => c.conectada).length;
  const selo: SeloDaIntegracao = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : contas.some((c) => c.origem === "cofre_ilegivel")
      ? { tom: "warning", texto: "Requer atenção" }
      : conectadas === contas.length && contas.length > 0
        ? { tom: "success", texto: "Conectada" }
        : conectadas > 0
          ? { tom: "info", texto: "Parcial" }
          : { tom: "neutral", texto: "Não conectada" };
  const resumo = !estado ? "Consultando o estado…" : `${conectadas} de ${contas.length} empresas conectadas`;

  const avisos = <AvisosDaIntegracao falhaAoLer={falhaAoLer} aviso={aviso} erro={erro} cofreConfigurado={estado?.cofreConfigurado} />;

  let janela: JanelaDaIntegracao | null = null;
  if (aberta && vista.tipo === "gerenciar") {
    janela = {
      titulo: "Autentique",
      descricao: DESCRICAO,
      tamanho: "media",
      aoFechar: fechar,
      conteudo: (
        <>
          {avisos}
          <ul className={styles.contas}>
            {contas.map((conta) => {
              const s = seloDaConta(conta);
              return (
                <li key={conta.empresa} className={styles.conta} aria-label={`Conta da ${EMPRESAS_POR_ID[conta.empresa].nome}`}>
                  <div className={styles.contaInfo}>
                    <div className={styles.contaTopo}>
                      <strong>{EMPRESAS_POR_ID[conta.empresa].nome}</strong>
                      <Badge tone={s.tom}>{s.texto}</Badge>
                    </div>
                    <p className={styles.nota}>
                      {conta.conectada
                        ? `Token ${conta.mascara} · ${conta.sandbox ? "modo de testes" : "valendo juridicamente"}${conta.atualizadoEm ? ` · atualizado em ${formatarDataHora(conta.atualizadoEm)}` : ""}`
                        : conta.origem === "cofre_ilegivel"
                          ? "A chave-mestra do cofre mudou. Conecte de novo para gravar o token."
                          : "Nenhum token conectado."}
                    </p>
                  </div>
                  <div className={styles.contaAcoes}>
                    {conta.conectada ? (
                      <Button variant="secondary" size="sm" onClick={() => testar(conta.empresa)} loading={ocupado === conta.empresa}>Testar conta</Button>
                    ) : null}
                    {conta.origem === "cofre" || conta.origem === "cofre_ilegivel" ? (
                      <Button variant="danger" size="sm" onClick={() => ir("desconectar", conta)}>Desconectar</Button>
                    ) : null}
                    <Button variant={conta.conectada ? "secondary" : "primary"} size="sm" onClick={() => ir("conectar", conta)}>
                      {conta.conectada ? "Editar" : "Conectar"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ),
    };
  } else if (aberta && vista.tipo === "conectar") {
    const alvo = EMPRESAS_POR_ID[vista.empresa].nome;
    const conta = contas.find((c) => c.empresa === vista.empresa);
    janela = {
      titulo: `${conta?.conectada ? "Editar" : "Conectar"} a Autentique da ${alvo}`,
      descricao: "O token fica guardado cifrado no cofre da plataforma e não é exibido depois de salvo.",
      tamanho: "estreita",
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button type="submit" form="form-autentique" loading={ocupado === "formulario"}>Salvar conta</Button>,
      conteudo: (
        <form id="form-autentique" className={styles.formulario} onSubmit={conectar}>
          {avisos}
          <TextField
            label="Token da API"
            hint={conta?.conectada ? "Cole o token de novo para salvar as alterações." : `Gerado no painel da Autentique da ${alvo}, em Configurações › API.`}
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
      ),
    };
  } else if (aberta && vista.tipo === "desconectar") {
    const alvo = EMPRESAS_POR_ID[vista.empresa].nome;
    janela = {
      titulo: `Desconectar a Autentique da ${alvo}?`,
      descricao: `Os contratos da ${alvo} deixam de poder ser enviados para assinatura até você conectar de novo. A conta da outra empresa não é afetada.`,
      tamanho: "estreita",
      perigo: true,
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button variant="danger" onClick={desconectar} loading={ocupado === "formulario"}>Desconectar</Button>,
      conteudo: avisos,
    };
  }

  return (
    <CartaoDeIntegracao
      nome="Autentique"
      Icone={FileSignature}
      descricao={DESCRICAO}
      selo={selo}
      resumo={resumo}
      acao={{ rotulo: conectadas > 0 ? "Gerenciar" : "Conectar", destaque: conectadas === 0, desabilitada: !estado, aoClicar: abrirLista }}
      janela={janela}
    />
  );
}
