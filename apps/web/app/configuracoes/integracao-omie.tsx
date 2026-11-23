"use client";

import { Landmark } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Acesso, CompanyKey, ConexaoOmieDaEmpresa, EstadoDasConexoesOmie } from "@plugga/shared";

import { Alert, Badge, Button, TextField } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import {
  acoesDaConexao,
  cnpjComMascara,
  cnpjDigitado,
  empresaDoTeste,
  empresasNoTeste,
  podeDefinirCnpj,
  resumoDoCartao,
  SELO_DA_SITUACAO,
  seloDoCartao,
  textoDoBloqueio,
} from "../lib/integracao-omie";
import { EMPRESAS_POR_ID } from "../lib/organizacao";
import { detalheDoErro } from "./integracao-api";
import { AvisosDaIntegracao, CartaoDeIntegracao, type JanelaDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = { tipo: "gerenciar" } | { tipo: "conectar" | "desconectar" | "cnpj"; empresa: CompanyKey };
type Ocupado = `${CompanyKey}:${"teste" | "confirmar"}` | "formulario" | "mover" | null;

const DESCRICAO = "Financeiro e notas fiscais, com a Plugga e a Waze na mesma conta.";

/**
 * OMIE (PLU-342): uma conta com a Plugga e a Waze dentro, cada uma com o seu par
 * chave e segredo, que só vale depois de conferido pelo CNPJ que o OMIE devolve.
 * A chave e o segredo são escrita-apenas: nunca voltam do servidor, só os quatro
 * últimos caracteres da chave, e os campos são limpos ao gravar. Gerem o cartão
 * Desenvolvedor, Admin e Gerente do Financeiro (D6); o CNPJ do cadastro, que é a
 * referência da conferência, só Admin e Desenvolvedor.
 */
export function IntegracaoOmie({ acesso }: { acesso: Acesso }) {
  const [estado, setEstado] = useState<EstadoDasConexoesOmie | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const [vista, setVista] = useState<Vista>({ tipo: "gerenciar" });
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [cnpj, setCnpj] = useState("");

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/integracoes/omie/empresas", { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler o estado do OMIE"));
      setEstado((await resposta.json()) as EstadoDasConexoesOmie);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar o OMIE");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function limparCampos() {
    setAppKey("");
    setAppSecret("");
    setCnpj("");
  }

  function abrirLista() {
    setErro(null);
    setAviso(null);
    setVista({ tipo: "gerenciar" });
    setAberta(true);
  }

  function ir(tipo: "conectar" | "desconectar" | "cnpj", conexao: ConexaoOmieDaEmpresa) {
    setErro(null);
    setAviso(null);
    limparCampos();
    if (tipo === "cnpj") setCnpj(cnpjComMascara(conexao.cnpjDoCadastro));
    setVista({ tipo, empresa: conexao.empresa });
  }

  function voltar() {
    limparCampos();
    setErro(null);
    setVista({ tipo: "gerenciar" });
  }

  function fechar() {
    limparCampos();
    setErro(null);
    setAviso(null);
    setAberta(false);
  }

  async function chamar(quem: Ocupado, chamada: () => Promise<Response>, padrao: string): Promise<Response | null> {
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

  /** As ações devolvem o estado atualizado da conexão; relê o cartão inteiro para o selo e a conta antiga. */
  async function depois(resposta: Response | null, mensagem: (c: ConexaoOmieDaEmpresa | null) => string): Promise<boolean> {
    if (!resposta) return false;
    const conexao = (await resposta.json().catch(() => null)) as ConexaoOmieDaEmpresa | null;
    await carregar();
    setVista({ tipo: "gerenciar" });
    setAviso(mensagem(conexao));
    return true;
  }

  const nome = (empresa: CompanyKey) => EMPRESAS_POR_ID[empresa].nome;

  async function conectar(evento: FormEvent) {
    evento.preventDefault();
    if (vista.tipo !== "conectar") return;
    const { empresa } = vista;
    const resposta = await chamar("formulario", () => fetch(`/api/integracoes/omie/empresas/${empresa}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appKey, appSecret }),
    }), `não foi possível gravar a chave da ${nome(empresa)}`);
    // A chave e o segredo saem da tela antes de qualquer outra coisa, também na falha.
    limparCampos();
    if (!resposta) { setErro((atual) => `${atual ?? "Não foi possível gravar a chave."} Por segurança, os campos foram limpos: digite a chave e o segredo de novo.`); return; }
    await depois(resposta, () => `Chave da ${nome(empresa)} guardada. Use “Testar” para conferir de qual empresa ela é.`);
  }

  async function testar(empresa: CompanyKey) {
    setAviso(null);
    const resposta = await chamar(`${empresa}:teste`, () => fetch(`/api/integracoes/omie/empresas/${empresa}/teste`, { method: "POST" }), "não foi possível testar a chave");
    await depois(resposta, (c) => c?.situacao === "conectada" ? `${nome(empresa)} conectada: o CNPJ confere com o cadastro.`
      : c?.situacao === "a_confirmar" ? `Teste feito. Confira se é mesmo a ${nome(empresa)} e confirme.`
      : c?.situacao === "bloqueada" && c.bloqueio ? textoDoBloqueio(c.bloqueio, empresa, empresasNoTeste(c))
      : "Teste feito.");
  }

  async function confirmar(conexao: ConexaoOmieDaEmpresa) {
    const doTeste = empresaDoTeste(conexao);
    if (!doTeste?.cnpj) return;
    setAviso(null);
    const resposta = await chamar(`${conexao.empresa}:confirmar`, () => fetch(`/api/integracoes/omie/empresas/${conexao.empresa}/confirmar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cnpj: doTeste.cnpj }),
    }), "não foi possível confirmar a empresa");
    await depois(resposta, () => `${nome(conexao.empresa)} conectada.`);
  }

  async function desconectar() {
    if (vista.tipo !== "desconectar") return;
    const { empresa } = vista;
    const resposta = await chamar("formulario", () => fetch(`/api/integracoes/omie/empresas/${empresa}`, { method: "DELETE" }), "não foi possível desconectar");
    await depois(resposta, () => `OMIE da ${nome(empresa)} desconectado.`);
  }

  async function salvarCnpj(evento: FormEvent) {
    evento.preventDefault();
    if (vista.tipo !== "cnpj") return;
    const { empresa } = vista;
    const digitado = cnpjDigitado(cnpj);
    if (digitado.erro) { setErro(digitado.erro); return; }
    const resposta = await chamar("formulario", () => fetch(`/api/integracoes/omie/empresas/${empresa}/cnpj`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cnpj: digitado.cnpj }),
    }), "não foi possível gravar o CNPJ");
    await depois(resposta, () => digitado.cnpj ? `CNPJ da ${nome(empresa)} gravado. Teste a chave de novo para conferir.` : `CNPJ da ${nome(empresa)} removido do cadastro.`);
  }

  async function moverContaAntiga() {
    setAviso(null);
    const resposta = await chamar("mover", () => fetch("/api/integracoes/omie/empresas/plugga/mover-conta-antiga", { method: "POST" }), "não foi possível mover a conta antiga");
    await depois(resposta, (c) => c?.situacao === "conectada" ? "A conta antiga virou a chave da Plugga, conferida pelo CNPJ."
      : c?.situacao === "a_confirmar" ? "A conta antiga foi testada. Confirme se é a Plugga; até lá ela continua guardada."
      : c?.situacao === "bloqueada" && c.bloqueio ? `${textoDoBloqueio(c.bloqueio, "plugga", empresasNoTeste(c))} A conta antiga continua guardada.`
      : "A conta antiga foi testada e continua guardada até a confirmação.");
  }

  const conexoes = estado?.conexoes ?? [];
  const conectadas = conexoes.filter((c) => c.situacao === "conectada").length;
  const selo = seloDoCartao(estado);
  const definirCnpj = podeDefinirCnpj(acesso);
  const avisos = <AvisosDaIntegracao falhaAoLer={falhaAoLer} aviso={aviso} erro={erro} cofreConfigurado={estado?.cofreConfigurado} />;

  let janela: JanelaDaIntegracao | null = null;
  if (aberta && vista.tipo === "gerenciar") {
    janela = {
      titulo: "OMIE",
      descricao: DESCRICAO,
      aoFechar: fechar,
      conteudo: (
        <>
          {avisos}
          {estado?.contaAntiga ? (
            <Alert tone="info" title="A conta única de antes ainda está guardada">
              Chave {estado.contaAntiga.mascara}, de {formatarDataHora(estado.contaAntiga.atualizadoEm)}. Ela vira a chave da Plugga se o teste conferir o CNPJ; até a confirmação, continua guardada.
              <span className={styles.acaoDoAviso}><Button variant="secondary" size="sm" onClick={moverContaAntiga} loading={ocupado === "mover"}>Mover para a Plugga</Button></span>
            </Alert>
          ) : null}
          <ul className={styles.contas}>
            {conexoes.map((conexao) => <LinhaDaEmpresa key={conexao.empresa} conexao={conexao} ocupado={ocupado} definirCnpj={definirCnpj}
              aoConectar={() => ir("conectar", conexao)} aoTestar={() => void testar(conexao.empresa)} aoConfirmar={() => void confirmar(conexao)}
              aoDesconectar={() => ir("desconectar", conexao)} aoCnpj={() => ir("cnpj", conexao)} />)}
          </ul>
          <p className={styles.nota}>Os lançamentos vão ao OMIE da empresa deles. Os erros de envio aparecem no filtro “Com erro no OMIE” dos Lançamentos.</p>
        </>
      ),
    };
  } else if (aberta && vista.tipo === "conectar") {
    const conexao = conexoes.find((c) => c.empresa === vista.empresa);
    const alvo = nome(vista.empresa);
    janela = {
      titulo: `${conexao?.mascara ? "Trocar a chave" : "Conectar"} do OMIE da ${alvo}`,
      descricao: "A chave e o segredo ficam guardados cifrados no cofre e não são exibidos depois de salvos. Trocar a chave pede um teste novo.",
      textoFechar: "Voltar",
      aoFechar: voltar,
      rodape: <Button type="submit" form="form-omie" loading={ocupado === "formulario"}>Salvar chave</Button>,
      conteudo: (
        <form id="form-omie" className={styles.formulario} onSubmit={conectar}>
          {avisos}
          <TextField label="Chave do app (App Key)" hint={`No OMIE da ${alvo}: Configurações › Meus aplicativos (só administradores).`}
            type="password" autoComplete="off" spellCheck={false} required value={appKey} onChange={(e) => setAppKey(e.target.value)} />
          <TextField label="Segredo do app (App Secret)" type="password" autoComplete="off" spellCheck={false} required value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
        </form>
      ),
    };
  } else if (aberta && vista.tipo === "desconectar") {
    const alvo = nome(vista.empresa);
    janela = {
      titulo: `Desconectar o OMIE da ${alvo}?`,
      descricao: `Os lançamentos da ${alvo} deixam de ir ao OMIE até alguém conectar de novo. A outra empresa não é afetada.`,
      perigo: true,
      textoFechar: "Voltar",
      aoFechar: voltar,
      rodape: <Button variant="danger" onClick={desconectar} loading={ocupado === "formulario"}>Desconectar</Button>,
      conteudo: avisos,
    };
  } else if (aberta && vista.tipo === "cnpj") {
    const alvo = nome(vista.empresa);
    janela = {
      titulo: `CNPJ da ${alvo} no cadastro`,
      descricao: "É contra este CNPJ que o teste confere a chave do OMIE. Com ele preenchido, a conexão fica pronta sem confirmação manual.",
      textoFechar: "Voltar",
      aoFechar: voltar,
      rodape: <Button type="submit" form="form-omie-cnpj" loading={ocupado === "formulario"}>Salvar CNPJ</Button>,
      conteudo: (
        <form id="form-omie-cnpj" className={styles.formulario} onSubmit={salvarCnpj}>
          {avisos}
          <TextField label="CNPJ" inputMode="numeric" autoComplete="off" placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(e.target.value)}
            hint="Deixe em branco para tirar o CNPJ do cadastro." />
        </form>
      ),
    };
  }

  return (
    <CartaoDeIntegracao
      nome="OMIE"
      Icone={Landmark}
      descricao={DESCRICAO}
      selo={selo}
      resumo={resumoDoCartao(estado)}
      acao={{ rotulo: conectadas > 0 || estado?.contaAntiga ? "Gerenciar" : "Conectar", destaque: conectadas === 0 && !estado?.contaAntiga, desabilitada: !estado, aoClicar: abrirLista }}
      janela={janela}
    />
  );
}

function LinhaDaEmpresa({ conexao, ocupado, definirCnpj, aoConectar, aoTestar, aoConfirmar, aoDesconectar, aoCnpj }: {
  conexao: ConexaoOmieDaEmpresa; ocupado: Ocupado; definirCnpj: boolean;
  aoConectar: () => void; aoTestar: () => void; aoConfirmar: () => void; aoDesconectar: () => void; aoCnpj: () => void;
}) {
  const nome = EMPRESAS_POR_ID[conexao.empresa].nome;
  const selo = SELO_DA_SITUACAO[conexao.situacao];
  const acoes = acoesDaConexao(conexao);
  const doTeste = empresaDoTeste(conexao);
  const confirmada = conexao.confirmada;
  return (
    <li className={styles.conta} aria-label={`OMIE da ${nome}`}>
      <div className={styles.contaInfo}>
        <div className={styles.contaTopo}>
          <strong>{nome}</strong>
          <Badge tone={selo.tom}>{selo.texto}</Badge>
        </div>
        <p className={styles.nota}>
          {conexao.situacao === "ilegivel" ? "A chave-mestra do cofre mudou. Conecte de novo para gravar a chave e o segredo."
            : conexao.mascara ? `Chave ${conexao.mascara}${conexao.atualizadoEm ? ` · gravada em ${formatarDataHora(conexao.atualizadoEm)}` : ""}`
            : "Nenhuma chave conectada."}
        </p>
        {confirmada ? <p className={styles.nota}>{confirmada.razaoSocial ?? nome} · CNPJ {cnpjComMascara(confirmada.cnpj)} · confirmada{confirmada.por ? ` por ${confirmada.por}` : ""} em {formatarDataHora(confirmada.em)}</p> : null}
        {conexao.situacao === "bloqueada" && conexao.bloqueio ? <p className={`${styles.nota} ${styles.notaErro}`} role="alert">{textoDoBloqueio(conexao.bloqueio, conexao.empresa, empresasNoTeste(conexao))}</p> : null}
        {/* Sem CNPJ no cadastro, a pessoa é a única barreira: a empresa devolvida vem em destaque antes de confirmar. */}
        {conexao.situacao === "a_confirmar" && doTeste ? <div className={styles.confirmacao} role="group" aria-label={`Empresa devolvida pelo OMIE para a ${nome}`}>
          <span className={styles.nota}>O OMIE devolveu esta empresa. É a {nome}?</span>
          <strong>{doTeste.razaoSocial ?? doTeste.nomeFantasia ?? "Empresa sem nome no OMIE"}</strong>
          <span>CNPJ {doTeste.cnpj ? cnpjComMascara(doTeste.cnpj) : "não informado"}</span>
        </div> : null}
        <p className={styles.nota}>CNPJ no cadastro: {conexao.cnpjDoCadastro ? cnpjComMascara(conexao.cnpjDoCadastro) : "não preenchido"}
          {definirCnpj ? <> · <button type="button" className={styles.link} onClick={aoCnpj}>{conexao.cnpjDoCadastro ? "Alterar" : "Preencher"}</button></> : null}</p>
      </div>
      <div className={styles.contaAcoes}>
        {acoes.confirmar ? <Button size="sm" onClick={aoConfirmar} loading={ocupado === `${conexao.empresa}:confirmar`}>É esta a empresa</Button> : null}
        {acoes.testar ? <Button variant="secondary" size="sm" onClick={aoTestar} loading={ocupado === `${conexao.empresa}:teste`}>Testar</Button> : null}
        {acoes.desconectar ? <Button variant="danger" size="sm" onClick={aoDesconectar}>Desconectar</Button> : null}
        <Button variant={conexao.mascara ? "secondary" : "primary"} size="sm" onClick={aoConectar}>{conexao.mascara ? "Trocar a chave" : "Conectar"}</Button>
      </div>
    </li>
  );
}
