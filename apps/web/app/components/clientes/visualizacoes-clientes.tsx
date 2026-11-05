import type { ClientListItem } from "@plugga/shared";
import { Eye, Phone, UserRound } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { hrefDaFicha } from "../../lib/clientes";
import { Button } from "../ui";
import { AvatarDoCliente, ContatoDoCliente, ResponsavelDoCliente, SituacaoDoCliente, TipoELocalDoCliente } from "./dados-do-cliente";
import styles from "./tela-clientes.module.css";

export type PropsVisualizacaoClientes = { itens: ClientListItem[]; filtros: { q?: string; active?: string }; aoAbrir: (id: string) => void; aoMudarSituacao: (cliente: ClientListItem) => void; pendentes: ReadonlySet<string> };
const LARGURA_MINIMA_CARD = 360;
const LARGURA_MAXIMA_CARD = 440;
const ESPACO_CARDS = 12;

export function CardsDeClientes({ itens, filtros, aoAbrir, aoMudarSituacao, pendentes }: PropsVisualizacaoClientes) {
  const gradeRef = useRef<HTMLDivElement>(null);
  const [larguraCard, setLarguraCard] = useState(LARGURA_MAXIMA_CARD);

  useLayoutEffect(() => {
    const grade = gradeRef.current;
    if (!grade) return;
    const observer = new ResizeObserver(([entrada]) => {
      if (!entrada) return;
      const largura = entrada.contentRect.width;
      const colunas = Math.max(1, Math.min(itens.length, Math.floor(
        (largura + ESPACO_CARDS) / (LARGURA_MINIMA_CARD + ESPACO_CARDS),
      )));
      setLarguraCard(Math.min(LARGURA_MAXIMA_CARD, (largura - (colunas - 1) * ESPACO_CARDS) / colunas));
    });
    observer.observe(grade);
    return () => observer.disconnect();
  }, [itens.length]);

  return <div className={styles.areaCards}><div ref={gradeRef} className={styles.grade} style={{
    "--largura-card": `${larguraCard}px`,
    gap: ESPACO_CARDS,
  } as CSSProperties}>
    {itens.map((item) => <article key={item.id} className={styles.card} aria-label={`Cliente ${item.name}`}>
      <header className={styles.cardTopo}>
        <AvatarDoCliente />
        <div className={styles.identidade}><div className={styles.nomeLinha}><h3><Link href={hrefDaFicha(item.id, filtros)} scroll={false}>{item.name}</Link></h3><SituacaoDoCliente ativo={item.active} nome={item.name} salvando={pendentes.has(item.id)} aoAlternar={() => aoMudarSituacao(item)} /></div><TipoELocalDoCliente cliente={item} /></div>
      </header>
      <dl className={styles.metadados}>
        <div><dt><Phone size={12} aria-hidden="true" />Telefone de contato</dt><dd title={item.phoneDisplay ?? "Não informado"}>{item.phoneDisplay ?? "Não informado"}</dd></div>
        <div><dt><UserRound size={12} aria-hidden="true" />{item.personType === "pj" ? "Contato principal" : "Tipo de cadastro"}</dt><dd title={item.personType === "pj" ? item.primaryContactName ?? "Não informado" : "Pessoa Física"}>{item.personType === "pj" ? item.primaryContactName ?? "Não informado" : "Pessoa Física"}</dd></div>
      </dl>
      <ContatoDoCliente cliente={item} mostrarTelefone={false} />
      <footer className={styles.cardRodape}><ResponsavelDoCliente cliente={item} /><Button size="sm" icon={<Eye size={14} />} aria-label={`Ver ficha de ${item.name}`} onClick={() => aoAbrir(item.id)}>Ver ficha</Button></footer>
    </article>)}
  </div></div>;
}
