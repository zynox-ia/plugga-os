import type { ClientListItem } from "@plugga/shared";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckSquare, Eye, Filter, Mail, Phone, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { PaginacaoDaLista } from "../pipelines/paginacao-da-lista";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { ShellCard, ShellTable } from "../plugga-shell";
import { Button, Checkbox } from "../ui";
import { AvatarDoCliente, ResponsavelDoCliente, SituacaoDoCliente, TipoELocalDoCliente } from "./dados-do-cliente";
import { MenuDoCliente } from "./menu-do-cliente";
import type { PropsVisualizacaoClientes } from "./visualizacoes-clientes";
import styles from "./lista-clientes.module.css";

const ITENS_POR_PAGINA = 7;
const COLUNAS = [
  { campo: "nome", rotulo: "Cliente" },
  { campo: null, rotulo: "Contato principal" },
  { campo: "responsavel", rotulo: "Responsável" },
  { campo: "situacao", rotulo: "Situação" },
] as const;
type Ordem = { campo: "nome" | "responsavel" | "situacao"; direcao: "asc" | "desc" };

export function ListaDeClientes({ itens, aoAbrir, aoMudarSituacao, pendentes, pagina, aoMudarPagina, filtrado, aoLimparFiltros }: PropsVisualizacaoClientes & { pagina: number; aoMudarPagina: (pagina: number) => void; filtrado: boolean; aoLimparFiltros: () => void }) {
  const [selecionando, setSelecionando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<Ordem>({ campo: "nome", direcao: "asc" });
  const botaoSelecao = useRef<HTMLSpanElement>(null);
  const ordenados = useMemo(() => {
    const valor = (cliente: ClientListItem) => ordem.campo === "nome" ? cliente.name : ordem.campo === "responsavel" ? cliente.owner?.name ?? "" : cliente.active ? "Ativo" : "Inativo";
    return [...itens].sort((a, b) => valor(a).localeCompare(valor(b), "pt-BR", { numeric: true, sensitivity: "base" }) * (ordem.direcao === "asc" ? 1 : -1));
  }, [itens, ordem]);
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(itens.length / ITENS_POR_PAGINA)));
  const linhas = ordenados.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);
  const marcados = itens.filter((item) => selecionados.has(item.id));
  const todos = linhas.length > 0 && linhas.every((item) => selecionados.has(item.id));
  const alguns = linhas.some((item) => selecionados.has(item.id));

  function alternar(id: string) {
    setSelecionados((atuais) => {
      const novos = new Set(atuais);
      if (novos.has(id)) novos.delete(id); else novos.add(id);
      return novos;
    });
  }

  function alternarTodos() {
    setSelecionados((atuais) => {
      const novos = new Set(atuais);
      for (const item of linhas) { if (todos) novos.delete(item.id); else novos.add(item.id); }
      return novos;
    });
  }

  return <div className={`lista-negocios ${estilosLista.lista} ${styles.lista}`}>
    {marcados.length > 0 ? <div className="barra-lote" role="region" aria-label="Clientes selecionados">
      <div className="barra-lote-info" role="status"><CheckSquare size={15} aria-hidden="true" /><span>{marcados.length === 1 ? "1 cliente selecionado" : `${marcados.length} clientes selecionados`}</span></div>
      <div className="barra-lote-controles"><Button variant="secondary" size="sm" icon={<X size={14} />} onClick={() => { setSelecionados(new Set()); botaoSelecao.current?.querySelector("button")?.focus(); }}>Limpar seleção</Button></div>
    </div> : null}

    <ShellCard className="table-card lista-negocios-card">
      <div className="card-heading">
        <div><span className="eyebrow">Visão em lista</span><h2>Clientes</h2></div>
        {itens.length > 0 ? <div className={estilosLista.controles}><span ref={botaoSelecao} className={estilosLista.selecao}>
          <Button variant="secondary" size="sm" icon={<CheckSquare size={14} />} aria-pressed={selecionando} onClick={() => { setSelecionando(!selecionando); setSelecionados(new Set()); }}>{selecionando ? "Cancelar seleção" : "Selecionar clientes"}</Button>
        </span></div> : null}
      </div>

      {itens.length === 0 ? <div className="lista-negocios-vazia" role="status">
        <div className="lista-negocios-vazia-icone" aria-hidden="true"><Filter size={22} /></div>
        <h3 className="lista-negocios-vazia-titulo">{filtrado ? "Nenhum cliente encontrado para a busca." : "Nenhum cliente cadastrado ainda."}</h3>
        <p className="lista-negocios-vazia-desc">{filtrado ? "Não encontramos clientes com os filtros ou termo de busca atuais." : "Cadastre o primeiro cliente para começar."}</p>
        {filtrado ? <Button variant="secondary" size="sm" onClick={aoLimparFiltros}>Limpar filtros</Button> : null}
      </div> : <>
        <div className={`${estilosLista.rolagemTabela} ${styles.rolagem}`} role="region" aria-label="Lista de clientes" tabIndex={0}>
          <ShellTable caption="Clientes cadastrados">
            <thead><tr>
              {COLUNAS.map((coluna) => <th key={coluna.rotulo} scope="col" aria-sort={coluna.campo && ordem.campo === coluna.campo ? ordem.direcao === "asc" ? "ascending" : "descending" : undefined}>
                <div className={estilosLista.cabecalhoColuna}>
                  {coluna.campo === "nome" && selecionando ? <Checkbox className={estilosLista.checkbox} label="Selecionar todos os clientes visíveis" checked={todos} indeterminate={alguns && !todos} onChange={alternarTodos} /> : null}
                  {coluna.campo ? <button type="button" className="ordenar" onClick={() => { const campo = coluna.campo; if (!campo) return; setOrdem((atual) => ({ campo, direcao: atual.campo === campo && atual.direcao === "asc" ? "desc" : "asc" })); aoMudarPagina(1); }}>
                    <span>{coluna.rotulo}</span>{ordem.campo === coluna.campo ? ordem.direcao === "desc" ? <ArrowDown size={13} className="ordenar-icone" aria-hidden="true" /> : <ArrowUp size={13} className="ordenar-icone" aria-hidden="true" /> : <ArrowUpDown size={12} className="ordenar-icone ordenar-icone--neutro" aria-hidden="true" />}
                  </button> : <span>{coluna.rotulo}</span>}
                </div>
              </th>)}
              <th scope="col" className="coluna-centro">Ações</th>
            </tr></thead>
            <tbody>{linhas.map((item) => <tr key={item.id} data-selected={selecionados.has(item.id)} className={selecionados.has(item.id) ? "linha-marcada" : undefined}
              onClick={(evento) => { if (!(evento.target as HTMLElement).closest("input, label, button, select, a, [role='menuitem']")) aoAbrir(item.id); }}>
              <td><div className={estilosLista.oportunidade}>
                {selecionando ? <Checkbox className={estilosLista.checkbox} label={`Selecionar ${item.name}`} checked={selecionados.has(item.id)} onChange={() => alternar(item.id)} /> : null}
                <AvatarDoCliente />
                <div className="celula-lead-bloco">
                  <button type="button" className={`lead-nome ${estilosLista.titulo}`} title={item.name} onClick={() => aoAbrir(item.id)}>{item.name}</button>
                  <div className="lead-subtitulo">
                    {item.documentDisplay ? <span className="lead-subtitulo-item" title="Documento do cliente">{item.documentDisplay}</span> : null}
                    {item.phoneDisplay ? <>{item.documentDisplay ? <span className="lead-subtitulo-divisor">•</span> : null}<span className="lead-subtitulo-item"><Phone size={11} aria-hidden="true" /><span>{item.phoneDisplay}</span></span></> : null}
                    {item.email ? <>{item.documentDisplay || item.phoneDisplay ? <span className="lead-subtitulo-divisor">•</span> : null}<span className={`lead-subtitulo-item ${estilosLista.email}`} title={item.email}><Mail size={11} aria-hidden="true" /><span>{item.email}</span></span></> : null}
                  </div>
                </div>
              </div></td>
              <td><div className="celula-empresa-centro"><span className="empresa-nome" title={item.primaryContactName ?? undefined}>{item.primaryContactName ?? (item.personType === "pf" ? "Pessoa Física" : "Não informado")}</span><TipoELocalDoCliente cliente={item} /></div></td>
              <td><div className={estilosLista.etapa}><ResponsavelDoCliente cliente={item} /></div></td>
              <td><div className={estilosLista.valor}><SituacaoDoCliente ativo={item.active} nome={item.name} salvando={pendentes.has(item.id)} aoAlternar={() => aoMudarSituacao(item)} /></div></td>
              <td className="coluna-acoes coluna-centro"><div className="lista-negocios-acoes"><button type="button" className="lista-negocios-btn-ver" aria-label={`Ver ficha de ${item.name}`} title="Ver ficha" onClick={() => aoAbrir(item.id)}><Eye size={14} aria-hidden="true" /></button><MenuDoCliente cliente={item} salvando={pendentes.has(item.id)} aoAbrir={() => aoAbrir(item.id)} aoMudarSituacao={() => aoMudarSituacao(item)} /></div></td>
            </tr>)}</tbody>
          </ShellTable>
        </div>
        <PaginacaoDaLista pagina={paginaAtual} totalItens={itens.length} itensPorPagina={ITENS_POR_PAGINA} aoMudarPagina={aoMudarPagina} entidade="clientes" />
      </>}
    </ShellCard>
  </div>;
}
