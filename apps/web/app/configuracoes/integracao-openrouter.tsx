"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EstadoDaChaveComCofre } from "@plugga/shared";

import { Button, TextField } from "../components/ui";
import { formatarDataHora } from "../lib/format";
import { detalheDoErro } from "./integracao-api";
import { AvisosDaIntegracao, CartaoDeIntegracao, type JanelaDaIntegracao, type SeloDaIntegracao } from "./integracao-cartao";
import styles from "./integracoes.module.css";

type Vista = "gerenciar" | "conectar" | "remover";

const DESCRICAO = "Modelos de IA por API, com a chave da plataforma. Todo consumo é registrado por processo, com tokens e custo.";

/**
 * OpenRouter: a porta da plataforma para modelo de linguagem (leitura de fatura e
 * agentes), por chave de API. A chave vem do cofre (que vence o ambiente) e nunca
 * volta do servidor: só os quatro últimos caracteres. O campo é limpo ao gravar.
 */
export function IntegracaoOpenRouter() {
  const [estado, setEstado] = useState<EstadoDaChaveComCofre | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const [vista, setVista] = useState<Vista>("gerenciar");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [chave, setChave] = useState("");

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/llm/chave", { cache: "no-store" });
      if (!resposta.ok) throw new Error(await detalheDoErro(resposta, "não foi possível ler o estado da chave"));
      setEstado((await resposta.json()) as EstadoDaChaveComCofre);
      setFalhaAoLer(null);
    } catch (falha) {
      setFalhaAoLer(falha instanceof Error ? falha.message : "falha ao consultar a chave");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function ir(proxima: Vista) {
    setErro(null);
    setAviso(null);
    setChave("");
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

  async function gravar(evento: FormEvent) {
    evento.preventDefault();
    const resposta = await enviar(
      () => fetch("/api/llm/chave", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chave }),
      }),
      "não foi possível gravar a chave",
    );
    // A chave sai da tela antes de qualquer outra coisa.
    setChave("");
    if (!resposta) return;
    await carregar();
    setVista("gerenciar");
    setAviso("Chave gravada. Ela passa a valer nas próximas chamadas.");
  }

  async function remover() {
    const resposta = await enviar(() => fetch("/api/llm/chave", { method: "DELETE" }), "não foi possível apagar a chave");
    if (!resposta) return;
    await carregar();
    fechar();
  }

  const selo: SeloDaIntegracao = !estado
    ? { tom: "neutral", texto: "Consultando" }
    : estado.origem === "banco_ilegivel"
      ? { tom: "warning", texto: "Requer atenção" }
      : estado.configurada
        ? { tom: "success", texto: "Conectado" }
        : { tom: "neutral", texto: "Não conectado" };

  const resumo = !estado
    ? "Consultando o estado…"
    : estado.configurada
      ? `Chave ${estado.mascara}${estado.origem === "ambiente" ? " · do ambiente" : ""}`
      : "Nenhuma chave configurada";

  const avisos = (
    <AvisosDaIntegracao
      falhaAoLer={falhaAoLer}
      aviso={aviso}
      erro={erro}
      cofreConfigurado={estado?.cofreConfigurado}
      ilegivel={estado?.origem === "banco_ilegivel" ? { titulo: "A chave gravada não pode mais ser lida", texto: `A chave-mestra do cofre mudou. Grave a chave de novo. Em uso agora: ${estado.mascara ?? "nenhuma"}.` } : null}
    />
  );

  let janela: JanelaDaIntegracao | null = null;
  if (aberta && vista === "gerenciar") {
    janela = {
      titulo: "OpenRouter",
      descricao: DESCRICAO,
      aoFechar: fechar,
      conteudo: (
        <>
          {avisos}
          {estado?.configurada ? (
            <dl className={styles.detalhes}>
              <div><dt>Chave em uso</dt><dd>{estado.mascara}</dd></div>
              <div><dt>Origem</dt><dd>{estado.origem === "ambiente" ? "Ambiente do servidor" : "Cofre da plataforma"}</dd></div>
              {estado.atualizadoEm ? <div><dt>Atualizada em</dt><dd>{formatarDataHora(estado.atualizadoEm)}</dd></div> : null}
            </dl>
          ) : (
            <p className={styles.nota}>Sem chave, as funcionalidades que dependem de IA seguem desligadas: a leitura de fatura, por exemplo, fica só nas regras.</p>
          )}
          {estado?.origem === "ambiente" ? (
            <p className={styles.nota}>A chave vem do arquivo de ambiente. Gravar uma aqui passa a valer no lugar dela, sem reiniciar nada.</p>
          ) : null}
        </>
      ),
      rodape: (
        <>
          {estado?.origem === "banco" || estado?.origem === "banco_ilegivel" ? <Button variant="danger" onClick={() => ir("remover")}>Apagar chave guardada</Button> : null}
          <Button onClick={() => ir("conectar")}>{estado?.origem === "banco" ? "Trocar chave" : "Gravar chave"}</Button>
        </>
      ),
    };
  } else if (aberta && vista === "conectar") {
    janela = {
      titulo: estado?.origem === "banco" ? "Trocar a chave do OpenRouter" : "Conectar o OpenRouter",
      descricao: "A chave fica guardada cifrada no cofre da plataforma e não é exibida depois de salva.",
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button type="submit" form="form-openrouter" loading={ocupado} disabled={chave.trim().length < 8}>Gravar chave</Button>,
      conteudo: (
        <form id="form-openrouter" className={styles.formulario} onSubmit={gravar}>
          {avisos}
          <TextField
            label="Chave da API"
            hint="Gerada em openrouter.ai, em Keys. Começa com sk-or-v1-."
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-or-v1-…"
            required
            value={chave}
            onChange={(e) => setChave(e.target.value)}
          />
        </form>
      ),
    };
  } else if (aberta && vista === "remover") {
    janela = {
      titulo: "Apagar a chave guardada?",
      descricao: estado?.origem === "banco" && estado.mascara
        ? "O sistema volta a usar a chave do ambiente, se houver. Sem ela, as funcionalidades que dependem de IA ficam desligadas."
        : "As funcionalidades que dependem de IA ficam desligadas até gravar uma chave nova.",
      perigo: true,
      textoFechar: "Cancelar",
      aoFechar: fechar,
      rodape: <Button variant="danger" onClick={remover} loading={ocupado}>Apagar chave</Button>,
      conteudo: avisos,
    };
  }

  return (
    <CartaoDeIntegracao
      nome="OpenRouter"
      Icone={Sparkles}
      descricao={DESCRICAO}
      selo={selo}
      resumo={resumo}
      acao={{ rotulo: estado?.configurada ? "Gerenciar" : "Conectar", destaque: !estado?.configurada, desabilitada: !estado, aoClicar: () => ir(estado?.configurada ? "gerenciar" : "conectar") }}
      janela={janela}
    />
  );
}
