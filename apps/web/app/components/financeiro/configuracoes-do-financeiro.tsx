"use client";

import type { CategoriaEditada, CategoriaFinanceira, CompanyKey, ContaCorrente, OpcoesDoFinanceiro } from "@plugga/shared";
import { ArrowDownLeft, ArrowUpRight, Building2, Landmark, Pencil, Plus, Save, Settings, SlidersHorizontal, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  categoriaDasTarifas, comCategoriaSalva, comContaSalva, escolhasDasTarifas, mudancasDasTarifas, opcoesDasTarifas, podeCadastrarNoFinanceiro, rascunhoSemAsSalvas,
} from "../../lib/cadastros-do-financeiro";
import { enviar } from "../../lib/clientes";
import { ROTULO_DA_EMPRESA, valorEmReais } from "../../lib/compras";
import { categoriasAgrupadas, contagemDasCategorias, contasDaTela, detalheDaConta, saldoDaConta, type AbaDasConfiguracoes } from "../../lib/configuracoes-do-financeiro";
import { useSessionUser } from "../../lib/use-session-user";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { CampoDeMenu, FiltroComBusca, type OpcaoDoMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, Dialog, IconSearch } from "../ui";
import { CategoriaForm, ContaCorrenteForm } from "./cadastros-do-financeiro-forms";
import styles from "./configuracoes.module.css";
import { ICONE_DA_NATUREZA } from "./partes";

const ABAS: { id: AbaDasConfiguracoes; rotulo: string; icone: typeof Landmark }[] = [
  { id: "contas", rotulo: "Contas correntes", icone: Landmark },
  { id: "categorias", rotulo: "Categorias", icone: Tag },
  { id: "preferencias", rotulo: "Preferências", icone: SlidersHorizontal },
];

const EMPRESAS: readonly CompanyKey[] = ["plugga", "waze"];

type Cadastros = Pick<OpcoesDoFinanceiro, "contasCorrentes" | "categorias">;

/**
 * Configurações do Financeiro (PLU-340, W8), aberto pela engrenagem do cabeçalho:
 * as contas correntes, as categorias e as preferências de cada empresa, as mesmas
 * opções dos menus dos lançamentos. A gerência do Financeiro cadastra e edita (a API
 * confere de novo); quem não é da gerência vê tudo em leitura, sem botão.
 */
export function ConfiguracoesDoFinanceiro({ opcoes, aoFechar }: { opcoes: OpcoesDoFinanceiro; aoFechar: () => void }) {
  const router = useRouter();
  const { usuario } = useSessionUser();
  const pode = podeCadastrarNoFinanceiro(usuario?.acesso);
  const [aba, setAba] = useState<AbaDasConfiguracoes>("contas");
  const [empresa, setEmpresa] = useState<"" | CompanyKey>("");
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState<Cadastros>(opcoes);
  const [aviso, setAviso] = useState<string | null>(null);
  const abasRef = useRef<HTMLDivElement>(null);
  const filtroDeEmpresa = empresa || null;

  // A tela atrás recarrega as opções depois de salvar: o modal segue com as novas.
  useEffect(() => { setDados(opcoes); }, [opcoes]);

  /** Depois de salvar: a lista já mostra o salvo e relê as opções (o saldo calculado vem delas); a tela atrás também relê. */
  async function salvo(atualizar: (d: Cadastros) => Cadastros, texto: string) {
    setDados(atualizar);
    setAviso(texto);
    const lidas = await enviar<OpcoesDoFinanceiro>("/api/financeiro/opcoes", "GET");
    if (lidas.ok) setDados(lidas.dados);
    router.refresh();
  }

  /** O aviso do último salvo é da aba em que se salvou. */
  function trocarDeAba(id: AbaDasConfiguracoes) { setAba(id); setAviso(null); }

  function navegar(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const i = ABAS.findIndex((a) => a.id === aba);
    const j = evento.key === "Home" ? 0 : evento.key === "End" ? ABAS.length - 1 : (i + (evento.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length;
    trocarDeAba(ABAS[j]!.id);
    abasRef.current?.querySelector<HTMLButtonElement>(`#config-fin-${ABAS[j]!.id}`)?.focus();
  }

  const empresas = [{ value: "", label: "Todas as empresas", icon: <Building2 /> }, ...EMPRESAS.map((e) => ({ value: e, label: ROTULO_DA_EMPRESA[e], icon: <Building2 /> }))];

  return <Dialog title="Configurações do Financeiro" size="larga" className={styles.telaCheia} icon={<Settings size={20} />} onClose={aoFechar} cancelText="Fechar"
    description="As contas correntes, as categorias e as preferências de cada empresa, as mesmas opções dos menus dos lançamentos.">
    <div className={styles.corpo}>
      <div className={styles.barra}>
        <div ref={abasRef} className={`${estilosClientes.abas} ${styles.abas}`} role="tablist" aria-label="Seções das configurações" onKeyDown={navegar}>
          {ABAS.map(({ id, rotulo, icone: Icone }) => <button key={id} type="button" id={`config-fin-${id}`} className="ui-tab" role="tab" aria-selected={aba === id}
            aria-controls="config-fin-painel" tabIndex={aba === id ? 0 : -1} onClick={() => trocarDeAba(id)}><Icone size={15} aria-hidden="true" />{rotulo}</button>)}
        </div>
        <div className={styles.filtro}><FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="" value={empresa} onChange={(v) => setEmpresa(v as typeof empresa)} options={empresas} /></div>
      </div>
      {aviso ? <Alert tone="success" title={aviso} /> : null}
      <section id="config-fin-painel" role="tabpanel" aria-labelledby={`config-fin-${aba}`} className={styles.painel}>
        {aba === "contas" ? <ContasCorrentes dados={dados} empresa={filtroDeEmpresa} pode={pode}
          aoSalvar={(salva, texto) => void salvo((d) => ({ ...d, contasCorrentes: comContaSalva(d.contasCorrentes, salva) }), texto)} />
          : aba === "categorias" ? <Categorias dados={dados} empresa={filtroDeEmpresa} busca={busca} aoBuscar={setBusca} pode={pode}
            aoSalvar={(salva, texto) => void salvo((d) => ({ ...d, categorias: comCategoriaSalva(d.categorias, salva) }), texto)} />
          : <Preferencias dados={dados} empresa={filtroDeEmpresa} pode={pode}
            aoSalvar={(salvas, texto) => void salvo((d) => ({ ...d, categorias: salvas.reduce(comCategoriaSalva, d.categorias) }), texto)} />}
      </section>
    </div>
  </Dialog>;
}

const SITUACAO = (ativa: boolean) => <span className={`ui-badge ${ativa ? "ui-tone--neutral" : "ui-tone--warning"}`}>{ativa ? "Ativa" : "Inativa"}</span>;

function ContasCorrentes({ dados, empresa, pode, aoSalvar }: { dados: Cadastros; empresa: CompanyKey | null; pode: boolean; aoSalvar: (c: ContaCorrente, aviso: string) => void }) {
  const [editando, setEditando] = useState<ContaCorrente | "nova" | null>(null);
  const contas = contasDaTela(dados, empresa);
  return <>
    <div className={styles.tabela}>
      <div className={`${styles.cabecalhoDaTabela} ${styles.cabecalhoComAcao}`}>
        <div><h3>{contas.length === 1 ? "1 conta corrente" : `${contas.length} contas correntes`}</h3><p>{pode ? "Por empresa" : "Por empresa · só a gerência do Financeiro cadastra e edita"}</p></div>
        {pode ? <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditando("nova")}>Nova conta corrente</Button> : null}
      </div>
      {contas.length === 0 ? <p className={styles.vazio} role="status">Nenhuma conta corrente {empresa ? `da ${ROTULO_DA_EMPRESA[empresa]}` : ""} cadastrada ainda.</p>
        : <div className={styles.rolagem} role="region" aria-label="Contas correntes" tabIndex={0}>
          <table>
            <caption className="sr-only">Contas correntes</caption>
            <thead><tr><th scope="col">Conta corrente</th><th scope="col">Empresa</th><th scope="col">Saldo</th><th scope="col">Situação</th>{pode ? <th scope="col"><span className="sr-only">Editar</span></th> : null}</tr></thead>
            <tbody>{contas.map((c) => <tr key={c.id}>
              <td data-l="Conta corrente"><div className={estilosLista.oportunidade}>
                {/* Ícone neutro: sem logotipo de banco por enquanto (decisão do André). */}
                <span className={estilosLista.iconeOportunidade} aria-hidden="true"><Landmark size={16} /></span>
                <div className="celula-lead-bloco"><span className={`lead-nome ${estilosLista.titulo}`}>{c.nome}</span>{detalheDaConta(c) ? <span className={estilosLista.codigo}>{detalheDaConta(c)}</span> : null}</div>
              </div></td>
              <td data-l="Empresa"><EmpresaComPonto empresa={c.empresa} /></td>
              <td data-l="Saldo">{((s) => <div className={estilosLista.valor}><strong>{s.valor ? valorEmReais(s.valor) : "—"}</strong><small>{s.nota}</small></div>)(saldoDaConta(c))}</td>
              <td data-l="Situação">{SITUACAO(c.ativa)}</td>
              {pode ? <td className={styles.colunaDaAcao}><Button variant="secondary" size="sm" iconOnly icon={<Pencil size={14} />} aria-label={`Editar ${c.nome}`} title="Editar" onClick={() => setEditando(c)} /></td> : null}
            </tr>)}</tbody>
          </table>
        </div>}
    </div>
    {editando ? <ContaCorrenteForm conta={editando === "nova" ? undefined : editando} empresa={empresa} aoCancelar={() => setEditando(null)}
      aoSalvar={(salva, texto) => { setEditando(null); aoSalvar(salva, texto); }} /> : null}
  </>;
}

function Categorias({ dados, empresa, busca, aoBuscar, pode, aoSalvar }: {
  dados: Cadastros; empresa: CompanyKey | null; busca: string; aoBuscar: (v: string) => void; pode: boolean; aoSalvar: (c: CategoriaEditada, aviso: string) => void;
}) {
  const [editando, setEditando] = useState<CategoriaFinanceira | "nova" | null>(null);
  const grupos = categoriasAgrupadas(dados, empresa, busca);
  const colunas = pode ? 5 : 4;
  return <>
    <div className={styles.buscaCategorias}>
      <div className="equipe-busca" role="search">
        <IconSearch className="equipe-busca-icon" />
        <input className="equipe-busca-input" type="search" maxLength={80} aria-label="Buscar categoria por nome, código ou grupo" placeholder="Buscar por nome, código ou grupo…" value={busca} onChange={(e) => aoBuscar(e.target.value)} />
      </div>
      <span className={styles.contagem} role="status">{contagemDasCategorias(grupos)}</span>
      {pode ? <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditando("nova")}>Nova categoria</Button> : null}
    </div>
    {pode ? null : <p className={styles.nota}>Só a gerência do Financeiro cadastra e edita as categorias.</p>}
    <div className={styles.tabela}>
      {grupos.length === 0 ? <p className={styles.vazio} role="status">{busca ? "Nenhuma categoria com essa busca." : "Nenhuma categoria cadastrada ainda."}</p>
        : <div className={styles.rolagem} role="region" aria-label="Categorias" tabIndex={0}>
          <table>
            <caption className="sr-only">Categorias, por grupo</caption>
            <thead><tr><th scope="col">Categoria</th><th scope="col">Tipo</th><th scope="col">Empresa</th><th scope="col">Situação</th>{pode ? <th scope="col"><span className="sr-only">Editar</span></th> : null}</tr></thead>
            {grupos.map((g) => <tbody key={g.chave}>
              <tr className={styles.linhaDoGrupo}><th scope="rowgroup" colSpan={colunas}><span>{g.codigo}</span>{g.nome}<small>{g.categorias.length === 1 ? "1 categoria" : `${g.categorias.length} categorias`}</small></th></tr>
              {g.categorias.map((c) => {
                const Icone = ICONE_DA_NATUREZA[c.natureza];
                return <tr key={c.id}>
                  <td data-l="Categoria"><div className={estilosLista.oportunidade}>
                    <span className={estilosLista.iconeOportunidade} aria-hidden="true"><Icone size={16} /></span>
                    <div className="celula-lead-bloco"><span className={`lead-nome ${estilosLista.titulo}`}>{c.nome}</span>
                      <span className={estilosLista.codigo}>{c.codigo}{c.tarifaBancaria ? <span className={styles.marcaDeTarifas}>Tarifas bancárias</span> : null}</span></div>
                  </div></td>
                  <td data-l="Tipo"><span className={styles.tipo}>{c.tipo === "receita" ? <ArrowDownLeft size={13} aria-hidden="true" /> : <ArrowUpRight size={13} aria-hidden="true" />}{c.tipo === "receita" ? "Receita" : "Despesa"}</span></td>
                  <td data-l="Empresa"><EmpresaComPonto empresa={c.empresa} /></td>
                  <td data-l="Situação">{SITUACAO(c.ativa)}</td>
                  {pode ? <td className={styles.colunaDaAcao}><Button variant="secondary" size="sm" iconOnly icon={<Pencil size={14} />} aria-label={`Editar ${c.codigo} ${c.nome}`} title="Editar" onClick={() => setEditando(c)} /></td> : null}
                </tr>;
              })}
            </tbody>)}
          </table>
        </div>}
    </div>
    {editando ? <CategoriaForm categoria={editando === "nova" ? undefined : editando} categorias={dados.categorias} empresa={empresa} aoCancelar={() => setEditando(null)}
      aoSalvar={(salva, texto) => { setEditando(null); aoSalvar(salva, texto); }} /> : null}
  </>;
}

/**
 * Preferências por empresa. Nesta entrega, a categoria das tarifas bancárias (a do "Criar
 * tarifa" da Conciliação). O rascunho guarda só o que ainda não foi confirmado: se uma empresa
 * salva e a outra falha, o erro e a escolha pendente ficam na tela para tentar de novo.
 */
function Preferencias({ dados, empresa, pode, aoSalvar }: { dados: Cadastros; empresa: CompanyKey | null; pode: boolean; aoSalvar: (salvas: CategoriaEditada[], aviso: string) => void }) {
  const visiveis = EMPRESAS.filter((e) => !empresa || e === empresa);
  const [rascunho, setRascunho] = useState<Partial<Record<CompanyKey, string>>>({});
  const escolhas = escolhasDasTarifas(dados.categorias, rascunho);
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mudancas = mudancasDasTarifas(dados.categorias, rascunho);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (mudancas.length === 0) return;
    setEnviando(true); setFalha(null);
    const salvas: CategoriaEditada[] = [];
    for (const m of mudancas) {
      const r = await enviar<CategoriaEditada>(`/api/financeiro/categorias/${m.id}`, "PATCH", m.corpo);
      if (!r.ok) { setFalha(r.erro.mensagem); break; }
      salvas.push(r.dados);
    }
    setEnviando(false);
    setRascunho((r) => rascunhoSemAsSalvas(r, salvas));
    if (salvas.length > 0) aoSalvar(salvas, salvas.length === mudancas.length ? "Preferências salvas." : "Parte das preferências foi salva.");
  }

  return <form className={styles.preferencias} onSubmit={salvar} noValidate aria-label="Preferências por empresa">
    {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
    <div className={styles.gradeDePreferencias}>
      {visiveis.map((e) => {
        const atual = categoriaDasTarifas(dados.categorias, e);
        const opcoes: OpcaoDoMenu[] = [
          { value: "", label: "Nenhuma", description: "O \"Criar tarifa\" pede a categoria" },
          ...opcoesDasTarifas(dados.categorias, e).map((c) => { const Icone = ICONE_DA_NATUREZA[c.natureza]; return { value: c.id, label: c.nome, description: `${c.codigo} · ${c.grupo.nome}`, icon: <Icone /> }; }),
        ];
        return <section key={e} className={styles.cartaoDaEmpresa} aria-labelledby={`pref-${e}`}>
          <h3 id={`pref-${e}`}><EmpresaComPonto empresa={e} /></h3>
          {pode ? <CampoDeMenu label="Categoria das tarifas bancárias" options={opcoes} value={escolhas[e]} icon={<Tag />} placeholder="Nenhuma"
            hint={'Usada no "Criar tarifa" da Conciliação. Só despesas ativas.'} onChange={(v) => { setRascunho((x) => ({ ...x, [e]: v })); setFalha(null); }} />
            : <div className={styles.leitura}><span>Categoria das tarifas bancárias</span><strong>{atual ? `${atual.codigo} · ${atual.nome}` : "Nenhuma"}</strong><small>Usada no &quot;Criar tarifa&quot; da Conciliação.</small></div>}
        </section>;
      })}
    </div>
    <div className={styles.rodapeDasPreferencias}>
      {pode ? null : <p>Só a gerência do Financeiro muda as preferências.</p>}
      {pode ? <Button type="submit" size="sm" icon={<Save size={14} />} disabled={enviando || mudancas.length === 0}>{enviando ? "Salvando…" : "Salvar preferências"}</Button> : null}
    </div>
  </form>;
}
