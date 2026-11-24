"use client";

import type { ComponentType, ReactNode } from "react";

import { Alert, Badge, Button, Dialog, type Tone } from "../components/ui";
import styles from "./integracoes.module.css";

export type SeloDaIntegracao = { tom: Tone; texto: string };

export type IconeDaIntegracao = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

/** O que o botão do cartão faz: sempre a ação mais provável do estado atual, direto. */
export type AcaoDoCartao = {
  rotulo: string;
  /** Verdadeiro para a ação principal (conectar, ligar); falso para gerenciar o que já existe. */
  destaque?: boolean;
  carregando?: boolean;
  desabilitada?: boolean;
  aoClicar: () => void;
};

/** O modal aberto no momento, já montado pela integração para o estado em que ela está. */
export type JanelaDaIntegracao = {
  titulo: string;
  descricao: string;
  /** Confirmação de algo destrutivo (cabeçalho vermelho). */
  perigo?: boolean;
  /** Texto do botão da esquerda: "Fechar" quando só se olha, "Cancelar" quando há o que descartar. */
  textoFechar?: string;
  /** Os botões da direita: a ação do formulário ou as ações de quem gerencia. */
  rodape?: ReactNode;
  aoFechar: () => void;
  conteudo: ReactNode;
};

/**
 * O cartão de toda integração: sempre o mesmo desenho e a mesma altura. Diz o que ela
 * é, em que estado está e uma linha de resumo, e tem UM botão que faz direto a ação do
 * momento: "Conectar" abre o formulário de conexão (sem tela no meio); "Gerenciar"
 * abre os dados com as ações no rodapé. Quando a ação não precisa de tela (ligar uma
 * consulta, ir ao Google), o botão a executa e o resultado aparece na própria linha do
 * cartão, em `alerta`.
 *
 * O modal leva o ícone grande ao lado do título, como os demais modais do sistema, e tem
 * SEMPRE a mesma largura (estreita): conteúdo que passa da altura rola por dentro, com o
 * cabeçalho e o rodapé fixos.
 */
export function CartaoDeIntegracao({
  nome,
  Icone,
  descricao,
  selo,
  resumo,
  alerta,
  acao,
  janela,
}: {
  nome: string;
  Icone: IconeDaIntegracao;
  descricao: string;
  selo: SeloDaIntegracao;
  /** Uma linha curta com o essencial do estado. */
  resumo: string;
  /** Falha de uma ação sem modal: substitui o resumo, em destaque. */
  alerta?: string | null;
  acao: AcaoDoCartao;
  janela?: JanelaDaIntegracao | null;
}) {
  return (
    <article className={styles.cartao} aria-label={nome}>
      <div className={styles.topo}>
        <span className={styles.marca} aria-hidden="true"><Icone size={20} /></span>
        <div className={styles.titulo}>
          <h3>{nome}</h3>
          <p>{descricao}</p>
        </div>
        <Badge tone={selo.tom}>{selo.texto}</Badge>
      </div>

      <p className={alerta ? `${styles.resumo} ${styles.resumoErro}` : styles.resumo} role={alerta ? "alert" : undefined}>
        {alerta ?? resumo}
      </p>

      <div className={styles.acoes}>
        <Button
          variant={acao.destaque ? "primary" : "secondary"}
          size="sm"
          onClick={acao.aoClicar}
          loading={acao.carregando}
          disabled={acao.desabilitada}
        >
          {acao.rotulo}
        </Button>
      </div>

      {janela ? (
        <Dialog
          title={janela.titulo}
          description={janela.descricao}
          icon={<Icone size={20} aria-hidden />}
          variant={janela.perigo ? "danger" : "default"}
          size="estreita"
          cancelText={janela.textoFechar ?? "Fechar"}
          onClose={janela.aoFechar}
          footer={janela.rodape}
        >
          {janela.conteudo}
        </Dialog>
      ) : null}
    </article>
  );
}

/**
 * Os avisos que toda integração repete no topo do modal: falha ao ler, resultado da
 * última ação, erro da ação em curso e as duas condições do cofre.
 */
export function AvisosDaIntegracao({
  falhaAoLer,
  aviso,
  erro,
  cofreConfigurado,
  ilegivel,
}: {
  falhaAoLer?: string | null;
  aviso?: string | null;
  erro?: string | null;
  cofreConfigurado?: boolean;
  /** Título e texto do aviso de "guardado e não lê mais", quando a linha do cofre ficou ilegível. */
  ilegivel?: { titulo: string; texto: string } | null;
}) {
  return (
    <>
      {falhaAoLer ? <Alert tone="danger" title={falhaAoLer} /> : null}
      {aviso ? <Alert tone="success" title={aviso} /> : null}
      {erro ? <Alert tone="danger" title={erro} /> : null}
      {cofreConfigurado === false ? (
        <Alert tone="warning" title="O cofre não está pronto">
          Falta a variável <code>SECRETS_ENCRYPTION_KEY</code> no ambiente da API. Gere com{" "}
          <code>openssl rand -base64 32</code> e reinicie a API antes de conectar.
        </Alert>
      ) : null}
      {ilegivel ? <Alert tone="warning" title={ilegivel.titulo}>{ilegivel.texto}</Alert> : null}
    </>
  );
}
