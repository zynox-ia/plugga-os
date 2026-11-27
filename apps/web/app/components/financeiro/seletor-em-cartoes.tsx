"use client";

import type { ReactNode } from "react";

import styles from "./notas-fiscais.module.css";

export interface OpcaoEmCartao<V extends string> {
  value: V;
  titulo: string;
  /** Linha de apoio sob o título. */
  descricao?: string;
  icone: ReactNode;
  /** Cor da borda do cartão escolhido; o padrão é o azul primário. */
  cor?: "azul" | "vermelha";
}

/**
 * Escolha de uma opção entre poucas, em cartões (PLU-361, protótipo). Semântica de
 * rádio: o input fica só para o leitor de tela e o teclado (setas); só o cartão
 * ESCOLHIDO tem borda colorida de 2 px e título em 500. Usado no tipo da nota.
 */
export function SeletorEmCartoes<V extends string>({ legenda, nome, opcoes, valor, aoMudar }: {
  legenda: string;
  nome: string;
  opcoes: readonly OpcaoEmCartao<V>[];
  valor: V;
  aoMudar: (valor: V) => void;
}) {
  return <fieldset className={styles.escolha}>
    <legend className="sr-only">{legenda}</legend>
    {opcoes.map((o) => <label key={o.value} className={`${styles.escolhaOpcao} ${o.cor === "vermelha" ? styles.escolhaVermelha : styles.escolhaAzul}`}>
      <input className="sr-only" type="radio" name={nome} value={o.value} checked={valor === o.value} onChange={() => aoMudar(o.value)} />
      <span className={styles.escolhaIcone} aria-hidden="true">{o.icone}</span>
      <span className={styles.escolhaTexto}><strong>{o.titulo}</strong>{o.descricao ? <small>{o.descricao}</small> : null}</span>
    </label>)}
  </fieldset>;
}
