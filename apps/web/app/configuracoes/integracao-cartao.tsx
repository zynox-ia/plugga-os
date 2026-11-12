"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { Badge, Button, Dialog, type Tone } from "../components/ui";
import styles from "./integracoes.module.css";

export type SeloDaIntegracao = { tom: Tone; texto: string };

export type IconeDaIntegracao = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

/**
 * O cartão de toda integração: sempre o mesmo desenho e a mesma altura. O cartão só
 * diz o que ela é, em que estado está e uma linha de resumo; tudo o mais (detalhes,
 * teste, credenciais, formulários, confirmações) mora no modal que o botão abre, com
 * o ícone grande ao lado do título como nos demais modais do sistema.
 *
 * O modal abre sozinho quando `abrirQuando` fica verdadeiro (ex.: a volta do
 * consentimento do Google, cujo resultado precisa ser visto). `aoFechar` deixa a integração limpar o
 * que não pode ficar de uma abertura para a outra, como um token digitado.
 */
export function CartaoDeIntegracao({
  nome,
  Icone,
  descricao,
  selo,
  resumo,
  acao = "Configurar",
  tamanho = "media",
  textoFechar = "Fechar",
  rodape,
  abrirQuando = false,
  aoFechar,
  children,
}: {
  nome: string;
  Icone: IconeDaIntegracao;
  descricao: string;
  selo: SeloDaIntegracao;
  /** Uma linha curta com o essencial do estado. */
  resumo: string;
  acao?: string;
  tamanho?: "estreita" | "media" | "larga";
  textoFechar?: string;
  /** Botões da direita no rodapé do modal (ex.: o salvar do formulário aberto). */
  rodape?: ReactNode;
  abrirQuando?: boolean;
  aoFechar?: () => void;
  /** O conteúdo do modal. */
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (abrirQuando) setAberto(true);
  }, [abrirQuando]);

  function fechar() {
    setAberto(false);
    aoFechar?.();
  }

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

      <p className={styles.resumo}>{resumo}</p>

      <div className={styles.acoes}>
        <Button variant="secondary" size="sm" onClick={() => setAberto(true)}>{acao}</Button>
      </div>

      {aberto ? (
        <Dialog
          title={nome}
          description={descricao}
          icon={<Icone size={20} aria-hidden />}
          size={tamanho}
          cancelText={textoFechar}
          onClose={fechar}
          footer={rodape}
        >
          {children}
        </Dialog>
      ) : null}
    </article>
  );
}
