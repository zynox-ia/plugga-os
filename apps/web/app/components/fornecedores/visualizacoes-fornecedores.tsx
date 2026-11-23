import { rotulosDaCategoriaDeFornecedor, type FornecedorNaLista } from "@plugga/shared";
import { Building2, Check, Eye, FileText, MapPin, Paperclip, Tag, UserRound, Wallet, X } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import {
  documentoFormatado,
  formasResumidas,
  localDoFornecedor,
  nomeDoFornecedor,
  telefoneFormatado,
  textoDeCotacoes,
} from "../../lib/fornecedores";
import estilosCartao from "../pipelines/cartao-de-negocio.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { PaginacaoDaLista } from "../pipelines/paginacao-da-lista";
import { ShellCard, ShellTable } from "../plugga-shell";
import { Button } from "../ui";
import estilosClientes from "../clientes/tela-clientes.module.css";
import styles from "./fornecedores.module.css";

export type PropsDasVisualizacoes = {
  itens: FornecedorNaLista[];
  aoAbrir: (id: string) => void;
  aoMudarSituacao: (fornecedor: FornecedorNaLista) => void;
  pendentes: ReadonlySet<string>;
};

const ehPessoaFisica = (f: FornecedorNaLista) => f.documento?.length === 11;

export function SituacaoDoFornecedor({ fornecedor, salvando, aoAlternar }: { fornecedor: FornecedorNaLista; salvando: boolean; aoAlternar: () => void }) {
  const nome = nomeDoFornecedor(fornecedor);
  return <button type="button" className={`${estilosCartao.status} ${estilosClientes.situacao}`} data-status={fornecedor.ativo ? "won" : "lost"}
    aria-label={`${fornecedor.ativo ? "Inativar" : "Reativar"} ${nome}`} aria-pressed={fornecedor.ativo} aria-busy={salvando || undefined} disabled={salvando}
    title={salvando ? "Salvando situação…" : `Clique para ${fornecedor.ativo ? "inativar" : "reativar"} o fornecedor`}
    onClick={(evento) => { evento.stopPropagation(); aoAlternar(); }}>
    {fornecedor.ativo ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}{fornecedor.ativo ? "Ativo" : "Inativo"}
  </button>;
}

export function CardsDeFornecedores({ itens, aoAbrir, aoMudarSituacao, pendentes, hrefDaFicha }: PropsDasVisualizacoes & { hrefDaFicha: (id: string) => string }) {
  return <div className={estilosClientes.areaCards}><div className={styles.grade}>
    {itens.map((f, indice) => {
      const nome = nomeDoFornecedor(f);
      const local = localDoFornecedor(f) ?? "Local não informado";
      const contato = [f.contatoNome, telefoneFormatado(f.telefone)].filter(Boolean).join(" · ") || "Não informado";
      const pagamento = formasResumidas(f.formasDePagamento) ?? "Não informado";
      const Icone = ehPessoaFisica(f) ? UserRound : Building2;
      return <article key={f.id} className={`${estilosClientes.card} ${styles.cardFornecedor} ${styles.entra}`} style={{ "--i": indice } as CSSProperties} aria-label={`Fornecedor ${nome}`}>
        <header className={estilosClientes.cardTopo}>
          <span className={estilosClientes.avatar} aria-hidden="true"><Icone size={18} /></span>
          <div className={estilosClientes.identidade}>
            <div className={estilosClientes.nomeLinha}>
              <h3><Link href={hrefDaFicha(f.id)} scroll={false}>{nome}</Link></h3>
              <SituacaoDoFornecedor fornecedor={f} salvando={pendentes.has(f.id)} aoAlternar={() => aoMudarSituacao(f)} />
            </div>
            <div className={estilosClientes.tipoLocal}>
              <span className={estilosClientes.tipo}><Tag size={12} aria-hidden="true" />{rotulosDaCategoriaDeFornecedor[f.categoria]}</span>
              <span aria-hidden="true">·</span>
              <span className={estilosClientes.local} title={local}><MapPin size={12} aria-hidden="true" /><span>{local}</span></span>
            </div>
          </div>
        </header>
        <dl className={estilosClientes.metadados}>
          <div><dt><UserRound size={12} aria-hidden="true" />Contato</dt><dd title={contato}>{contato}</dd></div>
          <div><dt><Wallet size={12} aria-hidden="true" />Pagamento</dt><dd title={formasResumidas(f.formasDePagamento, false) ?? "Não informado"}>{pagamento}</dd></div>
        </dl>
        <div className={estilosClientes.contatos}>
          <span title={f.nome}><FileText size={13} aria-hidden="true" /><span>{[documentoFormatado(f.documento) ?? "Sem documento", f.nomeFantasia ? f.nome : null].filter(Boolean).join(" · ")}</span></span>
        </div>
        <footer className={estilosClientes.cardRodape}>
          <div className={`${estilosCartao.responsavel} ${estilosClientes.responsavel}`}><Paperclip size={13} aria-hidden="true" /><span>{textoDeCotacoes(f.cotacoes)}</span></div>
          <Button size="sm" icon={<Eye size={14} />} aria-label={`Ver ficha de ${nome}`} onClick={() => aoAbrir(f.id)}>Ver ficha</Button>
        </footer>
      </article>;
    })}
  </div></div>;
}

export const ITENS_POR_PAGINA = 10;

export function ListaDeFornecedores({ itens, aoAbrir, aoMudarSituacao, pendentes, pagina, aoMudarPagina, ativos }: PropsDasVisualizacoes & { pagina: number; aoMudarPagina: (pagina: number) => void; ativos: number }) {
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(itens.length / ITENS_POR_PAGINA)));
  const linhas = itens.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);
  return <div className={`lista-negocios ${estilosLista.lista} ${styles.lista}`}>
    <ShellCard className="table-card lista-negocios-card">
      <div className="card-heading"><div className={estilosLista.cabecalhoTabela}><div>
        <h2>{itens.length === 1 ? "1 fornecedor" : `${itens.length} fornecedores`}</h2>
        <span>{ativos === 1 ? "1 ativo" : `${ativos} ativos`} · cadastro único da Plugga e da Waze</span>
      </div></div></div>
      <div className={estilosLista.rolagemTabela} role="region" aria-label="Lista de fornecedores" tabIndex={0}>
        <ShellTable caption="Fornecedores cadastrados">
          <thead><tr>
            <th scope="col">Fornecedor</th><th scope="col">Categoria</th><th scope="col">Contato</th><th scope="col">Pagamento</th><th scope="col">Situação</th><th scope="col" className="coluna-centro">Ações</th>
          </tr></thead>
          <tbody>{linhas.map((f, indice) => {
            const nome = nomeDoFornecedor(f);
            return <tr key={f.id} className={styles.entra} style={{ "--i": indice } as CSSProperties}
              onClick={(evento) => { if (!(evento.target as HTMLElement).closest("button, a")) aoAbrir(f.id); }}>
              <td data-l="Fornecedor"><div className={estilosLista.oportunidade}>
                <span className={estilosLista.iconeOportunidade} aria-hidden="true">{ehPessoaFisica(f) ? <UserRound size={16} /> : <Building2 size={16} />}</span>
                <div className="celula-lead-bloco">
                  <button type="button" className={`lead-nome ${estilosLista.titulo}`} title={f.nome} onClick={() => aoAbrir(f.id)}>{nome}</button>
                  <span className={estilosLista.codigo}>{[documentoFormatado(f.documento) ?? "Sem documento", localDoFornecedor(f)?.replace(" / ", "/")].filter(Boolean).join(" · ")}</span>
                </div>
              </div></td>
              <td data-l="Categoria">{rotulosDaCategoriaDeFornecedor[f.categoria]}</td>
              <td data-l="Contato"><div className={estilosLista.valor}><strong>{f.contatoNome ?? "Não informado"}</strong><small>{telefoneFormatado(f.telefone) ?? f.email ?? ""}</small></div></td>
              <td data-l="Pagamento">{formasResumidas(f.formasDePagamento, false) ?? "Não informado"}</td>
              <td data-l="Situação"><SituacaoDoFornecedor fornecedor={f} salvando={pendentes.has(f.id)} aoAlternar={() => aoMudarSituacao(f)} /></td>
              <td className="coluna-centro"><div className={estilosLista.acoesLinha}>
                <Button variant="secondary" size="sm" iconOnly icon={<Eye size={14} />} aria-label={`Ver ficha de ${nome}`} onClick={() => aoAbrir(f.id)} />
              </div></td>
            </tr>;
          })}</tbody>
        </ShellTable>
      </div>
      <PaginacaoDaLista pagina={paginaAtual} totalItens={itens.length} itensPorPagina={ITENS_POR_PAGINA} aoMudarPagina={aoMudarPagina} entidade="fornecedores" />
    </ShellCard>
  </div>;
}
