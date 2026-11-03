import type { ClientListItem } from "@plugga/shared";
import { Eye, FileText, UserRound } from "lucide-react";
import Link from "next/link";

import { hrefDaFicha } from "../../lib/clientes";
import { PaginacaoDaLista } from "../pipelines/paginacao-da-lista";
import { ShellCard, ShellTable } from "../plugga-shell";
import { AvatarDoCliente, ContatoDoCliente, ResponsavelDoCliente, SituacaoDoCliente, TipoELocalDoCliente } from "./dados-do-cliente";
import styles from "./tela-clientes.module.css";

type Props = { itens: ClientListItem[]; filtros: { q?: string; active?: string }; aoAbrir: (id: string) => void };
const ITENS_POR_PAGINA = 6;

export function CardsDeClientes({ itens, filtros, aoAbrir }: Props) {
  return <div className={styles.areaCards}><div className={styles.grade}>
    {itens.map((item) => <article key={item.id} className={styles.card} aria-label={`Cliente ${item.name}`}>
      <header className={styles.cardTopo}>
        <AvatarDoCliente />
        <div className={styles.identidade}><div className={styles.nomeLinha}><h3><Link href={hrefDaFicha(item.id, filtros)} scroll={false}>{item.name}</Link></h3><SituacaoDoCliente ativo={item.active} /></div><TipoELocalDoCliente cliente={item} /></div>
      </header>
      <dl className={styles.metadados}>
        <div><dt><FileText size={12} aria-hidden="true" />{item.personType === "pj" ? "CNPJ" : "CPF"}</dt><dd title={item.documentDisplay ?? "Não informado"}>{item.documentDisplay ?? "Não informado"}</dd></div>
        <div><dt><UserRound size={12} aria-hidden="true" />{item.personType === "pj" ? "Contato principal" : "Tipo de cadastro"}</dt><dd title={item.personType === "pj" ? item.primaryContactName ?? "Não informado" : "Pessoa Física"}>{item.personType === "pj" ? item.primaryContactName ?? "Não informado" : "Pessoa Física"}</dd></div>
      </dl>
      <ContatoDoCliente cliente={item} />
      <footer className={styles.cardRodape}><ResponsavelDoCliente cliente={item} comRotulo /><button type="button" className={styles.verFicha} aria-label={`Ver ficha de ${item.name}`} onClick={() => aoAbrir(item.id)}><Eye size={12} aria-hidden="true" />Ver ficha</button></footer>
    </article>)}
  </div></div>;
}

export function ListaDeClientes({ itens, filtros, aoAbrir, pagina, aoMudarPagina }: Props & { pagina: number; aoMudarPagina: (pagina: number) => void }) {
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(itens.length / ITENS_POR_PAGINA)));
  const linhas = itens.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);
  return <ShellCard className={styles.painelLista}>
    <div className={styles.rolagemLista} role="region" aria-label="Lista de clientes" tabIndex={0}>
      <ShellTable caption="Clientes cadastrados">
        <thead><tr><th scope="col">Cliente</th><th scope="col">Contato</th><th scope="col">CNPJ / CPF</th><th scope="col">Responsável</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{linhas.map((item) => <tr key={item.id} onClick={(evento) => { if (!(evento.target as HTMLElement).closest("a, button")) aoAbrir(item.id); }}>
          <td><div className={styles.clienteLista}><AvatarDoCliente /><div className={styles.identidade}><Link className={styles.nomeLista} href={hrefDaFicha(item.id, filtros)} scroll={false} title={item.name}>{item.name}</Link><TipoELocalDoCliente cliente={item} /></div></div></td>
          <td><ContatoDoCliente cliente={item} /></td>
          <td><div className={styles.documentoLista}><span>{item.documentDisplay ?? "Não informado"}</span><small title={item.primaryContactName ?? undefined}><UserRound size={12} aria-hidden="true" /><span>{item.personType === "pj" ? item.primaryContactName ?? "Contato não informado" : "Pessoa Física"}</span></small></div></td>
          <td><ResponsavelDoCliente cliente={item} /></td>
          <td><SituacaoDoCliente ativo={item.active} /></td>
          <td><button type="button" className={styles.verLista} aria-label={`Ver ficha de ${item.name}`} title="Ver ficha" onClick={() => aoAbrir(item.id)}><Eye size={14} aria-hidden="true" /></button></td>
        </tr>)}</tbody>
      </ShellTable>
    </div>
    <PaginacaoDaLista pagina={paginaAtual} totalItens={itens.length} itensPorPagina={ITENS_POR_PAGINA} aoMudarPagina={aoMudarPagina} entidade="clientes" />
  </ShellCard>;
}
