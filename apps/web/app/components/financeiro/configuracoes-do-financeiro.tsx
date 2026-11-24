"use client";

import type { OpcoesDoFinanceiro } from "@plugga/shared";
import { ArrowDownLeft, ArrowUpRight, Building2, Landmark, Settings, Tag } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { ROTULO_DA_EMPRESA, valorEmReais } from "../../lib/compras";
import { categoriasAgrupadas, contagemDasCategorias, contasDaTela, detalheDaConta, type AbaDasConfiguracoes } from "../../lib/configuracoes-do-financeiro";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Dialog, IconSearch } from "../ui";
import styles from "./configuracoes.module.css";
import { ICONE_DA_NATUREZA } from "./partes";

const ABAS: { id: AbaDasConfiguracoes; rotulo: string; icone: typeof Landmark }[] = [
  { id: "contas", rotulo: "Contas correntes", icone: Landmark },
  { id: "categorias", rotulo: "Categorias", icone: Tag },
];

/**
 * Configurações do Financeiro (PLU-340, W8), aberto pela engrenagem do cabeçalho:
 * as contas correntes e as categorias de cada empresa, as mesmas opções dos menus
 * dos lançamentos. Nesta entrega, só leitura; o cadastro chega com a W8.
 */
export function ConfiguracoesDoFinanceiro({ opcoes, aoFechar }: { opcoes: OpcoesDoFinanceiro; aoFechar: () => void }) {
  const [aba, setAba] = useState<AbaDasConfiguracoes>("contas");
  const [empresa, setEmpresa] = useState<"" | "plugga" | "waze">("");
  const [busca, setBusca] = useState("");
  const abasRef = useRef<HTMLDivElement>(null);
  const filtroDeEmpresa = empresa || null;

  function navegar(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const i = ABAS.findIndex((a) => a.id === aba);
    const j = evento.key === "Home" ? 0 : evento.key === "End" ? ABAS.length - 1 : (i + (evento.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length;
    setAba(ABAS[j]!.id);
    abasRef.current?.querySelector<HTMLButtonElement>(`#config-fin-${ABAS[j]!.id}`)?.focus();
  }

  const empresas = [{ value: "", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: ROTULO_DA_EMPRESA.plugga, icon: <Building2 /> }, { value: "waze", label: ROTULO_DA_EMPRESA.waze, icon: <Building2 /> }];

  return <Dialog title="Configurações do Financeiro" size="larga" className={styles.telaCheia} icon={<Settings size={20} />} onClose={aoFechar} cancelText="Fechar"
    description="As contas correntes e as categorias de cada empresa, as mesmas opções dos menus dos lançamentos.">
    <div className={styles.corpo}>
      <div className={styles.barra}>
        <div ref={abasRef} className={`${estilosClientes.abas} ${styles.abas}`} role="tablist" aria-label="Seções das configurações" onKeyDown={navegar}>
          {ABAS.map(({ id, rotulo, icone: Icone }) => <button key={id} type="button" id={`config-fin-${id}`} className="ui-tab" role="tab" aria-selected={aba === id}
            aria-controls="config-fin-painel" tabIndex={aba === id ? 0 : -1} onClick={() => setAba(id)}><Icone size={15} aria-hidden="true" />{rotulo}</button>)}
        </div>
        <div className={styles.filtro}><FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="" value={empresa} onChange={(v) => setEmpresa(v as typeof empresa)} options={empresas} /></div>
      </div>
      <section id="config-fin-painel" role="tabpanel" aria-labelledby={`config-fin-${aba}`} className={styles.painel}>
        {aba === "contas" ? <ContasCorrentes opcoes={opcoes} empresa={filtroDeEmpresa} /> : <Categorias opcoes={opcoes} empresa={filtroDeEmpresa} busca={busca} aoBuscar={setBusca} />}
      </section>
    </div>
  </Dialog>;
}

function ContasCorrentes({ opcoes, empresa }: { opcoes: OpcoesDoFinanceiro; empresa: "plugga" | "waze" | null }) {
  const contas = contasDaTela(opcoes, empresa);
  return <div className={styles.tabela}>
    <div className={styles.cabecalhoDaTabela}><h3>{contas.length === 1 ? "1 conta corrente" : `${contas.length} contas correntes`}</h3><p>Por empresa · somente leitura</p></div>
    {contas.length === 0 ? <p className={styles.vazio} role="status">Nenhuma conta corrente {empresa ? `da ${ROTULO_DA_EMPRESA[empresa]}` : ""} cadastrada ainda.</p>
      : <div className={styles.rolagem} role="region" aria-label="Contas correntes" tabIndex={0}>
        <table>
          <caption className="sr-only">Contas correntes</caption>
          <thead><tr><th scope="col">Conta corrente</th><th scope="col">Empresa</th><th scope="col">Saldo</th><th scope="col">Situação</th></tr></thead>
          <tbody>{contas.map((c) => <tr key={c.id}>
            <td data-l="Conta corrente"><div className={estilosLista.oportunidade}>
              {/* Ícone neutro: sem logotipo de banco por enquanto (decisão do André). */}
              <span className={estilosLista.iconeOportunidade} aria-hidden="true"><Landmark size={16} /></span>
              <div className="celula-lead-bloco"><span className={`lead-nome ${estilosLista.titulo}`}>{c.nome}</span>{detalheDaConta(c) ? <span className={estilosLista.codigo}>{detalheDaConta(c)}</span> : null}</div>
            </div></td>
            <td data-l="Empresa"><EmpresaComPonto empresa={c.empresa} /></td>
            <td data-l="Saldo"><div className={estilosLista.valor}><strong>{c.saldoCalculado ? valorEmReais(c.saldoCalculado) : "—"}</strong><small>{c.saldoCalculado ? "saldo inicial mais o pago e o recebido" : "sem saldo inicial"}</small></div></td>
            <td data-l="Situação"><span className={`ui-badge ${c.ativa ? "ui-tone--neutral" : "ui-tone--warning"}`}>{c.ativa ? "Ativa" : "Inativa"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
  </div>;
}

function Categorias({ opcoes, empresa, busca, aoBuscar }: { opcoes: OpcoesDoFinanceiro; empresa: "plugga" | "waze" | null; busca: string; aoBuscar: (v: string) => void }) {
  const grupos = categoriasAgrupadas(opcoes, empresa, busca);
  return <>
    <div className={styles.buscaCategorias}>
      <div className="equipe-busca" role="search">
        <IconSearch className="equipe-busca-icon" />
        <input className="equipe-busca-input" type="search" maxLength={80} aria-label="Buscar categoria por nome, código ou grupo" placeholder="Buscar por nome, código ou grupo…" value={busca} onChange={(e) => aoBuscar(e.target.value)} />
      </div>
      <span className={styles.contagem} role="status">{contagemDasCategorias(grupos)}</span>
    </div>
    <div className={styles.tabela}>
      {grupos.length === 0 ? <p className={styles.vazio} role="status">{busca ? "Nenhuma categoria com essa busca." : "Nenhuma categoria cadastrada ainda."}</p>
        : <div className={styles.rolagem} role="region" aria-label="Categorias" tabIndex={0}>
          <table>
            <caption className="sr-only">Categorias, por grupo</caption>
            <thead><tr><th scope="col">Categoria</th><th scope="col">Tipo</th><th scope="col">Empresa</th><th scope="col">Situação</th></tr></thead>
            {grupos.map((g) => <tbody key={g.chave}>
              <tr className={styles.linhaDoGrupo}><th scope="rowgroup" colSpan={4}><span>{g.codigo}</span>{g.nome}<small>{g.categorias.length === 1 ? "1 categoria" : `${g.categorias.length} categorias`}</small></th></tr>
              {g.categorias.map((c) => {
                const Icone = ICONE_DA_NATUREZA[c.natureza];
                return <tr key={c.id}>
                  <td data-l="Categoria"><div className={estilosLista.oportunidade}>
                    <span className={estilosLista.iconeOportunidade} aria-hidden="true"><Icone size={16} /></span>
                    <div className="celula-lead-bloco"><span className={`lead-nome ${estilosLista.titulo}`}>{c.nome}</span><span className={estilosLista.codigo}>{c.codigo}</span></div>
                  </div></td>
                  <td data-l="Tipo"><span className={styles.tipo}>{c.tipo === "receita" ? <ArrowDownLeft size={13} aria-hidden="true" /> : <ArrowUpRight size={13} aria-hidden="true" />}{c.tipo === "receita" ? "Receita" : "Despesa"}</span></td>
                  <td data-l="Empresa"><EmpresaComPonto empresa={c.empresa} /></td>
                  <td data-l="Situação"><span className={`ui-badge ${c.ativa ? "ui-tone--neutral" : "ui-tone--warning"}`}>{c.ativa ? "Ativa" : "Inativa"}</span></td>
                </tr>;
              })}
            </tbody>)}
          </table>
        </div>}
    </div>
  </>;
}
