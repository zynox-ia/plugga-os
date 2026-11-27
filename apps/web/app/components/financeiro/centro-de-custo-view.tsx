"use client";

import { ArrowDownLeft, ArrowUpRight, Building2, Eye, Filter, FolderKanban, LayoutGrid, Layers, List, Plus, Scale, User, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactElement } from "react";

import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import {
  comEntradasNovas,
  dataCurta,
  filtrarProjetos,
  hrefDosProjetos,
  projetosPorCliente,
  reais,
  resumoDoProjeto,
  ROTULO_DA_CLASSE,
  ROTULO_DA_SITUACAO,
  temFiltroNosProjetos,
  totaisDosProjetos,
  type FiltrosDosProjetos,
  type Projeto,
  type SituacaoDoProjeto,
  type VisaoDosProjetos,
} from "../../lib/prototipo-centro-de-custo";
import { BarraFixa, CampoDaFolha, classeDaPaginaComBarra } from "../barra-fixa";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { ShellCard, ShellTable } from "../plugga-shell";
import { CardDeMetrica } from "../suprimentos/card-de-metrica";
import { EmpresaComPonto, PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Badge, Button, IconSearch } from "../ui";
import { BarraDoOrcamento, iconeDoProjeto, Orcamento, SeloDoPrototipo, TOM_DA_SITUACAO } from "./centro-de-custo-partes";
import styles from "./centro-de-custo.module.css";
import { FichaDoProjeto } from "./ficha-do-projeto";
import estilosCards from "./lancamentos.module.css";
import { entradasNovasDe, NovaEntradaDoProjeto, useEntradasNovas } from "./nova-entrada-do-projeto";
import type { TelasDeOrigem } from "./projeto-do-centro-de-custo";

const VISOES: Record<VisaoDosProjetos, { rotulo: string; icone: LucideIcon }> = {
  cards: { rotulo: "Cards", icone: LayoutGrid },
  lista: { rotulo: "Lista", icone: List },
  clientes: { rotulo: "Por cliente", icone: Users },
};
const ORDEM_DAS_VISOES: VisaoDosProjetos[] = ["cards", "lista", "clientes"];

type AcoesDoProjeto = { hrefDaFicha: (id: string) => string; aoAbrir: (id: string) => void };

/**
 * Centro de custo (PLU-362), PROTÓTIPO: a lista dos projetos com o que cada um
 * recebeu, gastou e deu de resultado. Só leitura; os números vêm dos dados de
 * exemplo, que o servidor manda por props. Visões Cards (padrão), Lista e Por
 * cliente; filtros, visão e a ficha aberta (`?projeto=`) vão no endereço.
 */
export function CentroDeCustoView({ filtros, projetos: doServidor, clientes, projetoAberto, abre }: {
  filtros: FiltrosDosProjetos;
  projetos: readonly Projeto[];
  clientes: readonly Projeto["cliente"][];
  /** O id do projeto com a ficha aberta em modal, ou nulo. */
  projetoAberto: string | null;
  abre: TelasDeOrigem;
}) {
  const router = useRouter();
  // As entradas criadas nesta sessão (em memória) entram nos números de cada projeto.
  const novas = useEntradasNovas();
  const projetos = doServidor.map((p) => comEntradasNovas(p, entradasNovasDe(novas, p.id)));
  const [criandoPara, setCriandoPara] = useState<Projeto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 8000); return () => clearTimeout(t); }, [aviso]);
  const hrefDaFicha = (id: string) => hrefDosProjetos(filtros, id);
  const abrir = (id: string) => router.push(hrefDaFicha(id), { scroll: false });
  const aberto = projetoAberto ? projetos.find((p) => p.id === projetoAberto) ?? null : null;
  const [busca, setBusca] = useState(filtros.busca ?? "");
  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);
  const abasRef = useRef<HTMLDivElement>(null);

  const ir = (parcial: Partial<FiltrosDosProjetos>) => {
    const novos = { ...filtros, ...parcial };
    for (const chave of Object.keys(novos) as (keyof FiltrosDosProjetos)[]) if (novos[chave] === undefined) delete novos[chave];
    router.push(hrefDosProjetos(novos), { scroll: false });
  };
  const filtrado = temFiltroNosProjetos(filtros);
  const limpar = () => { setBusca(""); router.push(hrefDosProjetos({ visao: filtros.visao }), { scroll: false }); };
  const buscar = (evento: FormEvent) => { evento.preventDefault(); ir({ busca: busca.trim() || undefined }); };

  function navegarAbas(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const i = ORDEM_DAS_VISOES.indexOf(filtros.visao);
    const n = ORDEM_DAS_VISOES.length;
    const proxima = evento.key === "Home" ? 0 : evento.key === "End" ? n - 1 : (i + (evento.key === "ArrowRight" ? 1 : n - 1)) % n;
    const visao = ORDEM_DAS_VISOES[proxima]!;
    ir({ visao });
    abasRef.current?.querySelector<HTMLButtonElement>(`#centro-visao-${visao}`)?.focus();
  }

  const visiveis = filtrarProjetos(projetos, filtros);
  const totais = totaisDosProjetos(visiveis);

  const empresas = [{ value: "", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: ROTULO_DA_EMPRESA.plugga, icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: ROTULO_DA_EMPRESA.waze, icon: <PontoDaEmpresa empresa="waze" /> }];
  const opcoesDeCliente = [{ value: "", label: "Todos os clientes", icon: <Users /> }, ...clientes.map((c) => ({ value: c.id, label: c.nome, icon: <User /> }))];
  const situacoes = [{ value: "", label: "Todas as situações", icon: <Layers /> }, ...(Object.keys(ROTULO_DA_SITUACAO) as SituacaoDoProjeto[]).map((s) => ({ value: s, label: ROTULO_DA_SITUACAO[s], icon: <Layers /> }))];

  const campoDeBusca = (onde: "barra" | "folha") => <form className="equipe-busca" onSubmit={buscar} role="search" aria-label="Buscar projetos">
    <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar"><IconSearch className="equipe-busca-icon" /></button>
    <input id={`centro-busca-${onde}`} className="equipe-busca-input" type="search" maxLength={120} aria-label="Buscar projeto, cliente ou código" value={busca}
      onChange={(e) => setBusca(e.target.value)} placeholder="Buscar projeto, cliente ou código…" />
  </form>;
  const filtrosDaTela: [string, ReactElement][] = [
    ["Empresa", <FiltroComBusca key="empresa" label="Empresa" icon={<Building2 />} semFiltro="" value={filtros.empresa ?? ""} onChange={(v) => ir({ empresa: v ? (v as FiltrosDosProjetos["empresa"]) : undefined })} options={empresas} />],
    ["Cliente", <FiltroComBusca key="cliente" label="Cliente" icon={<Users />} semFiltro="" value={filtros.cliente ?? ""} onChange={(v) => ir({ cliente: v || undefined })} options={opcoesDeCliente} />],
    ["Situação", <FiltroComBusca key="situacao" label="Situação" icon={<Layers />} semFiltro="" value={filtros.situacao ?? ""} onChange={(v) => ir({ situacao: v ? (v as SituacaoDoProjeto) : undefined })} options={situacoes} />],
  ];
  const quantosFiltros = [filtros.empresa, filtros.cliente, filtros.situacao, filtros.busca].filter(Boolean).length;
  const rotuloDoResultado = visiveis.length === 1 ? "Ver 1 projeto" : `Ver ${visiveis.length} projetos`;

  const subtitulo = filtros.empresa ? `O que entrou e saiu de cada projeto da ${ROTULO_DA_EMPRESA[filtros.empresa]}.` : "O que entrou e saiu de cada projeto, das duas empresas.";

  let conteudo;
  if (!visiveis.length) {
    conteudo = <div className="lista-negocios-vazia" role="status">
      <div className="lista-negocios-vazia-icone" aria-hidden="true">{filtrado ? <Filter size={22} /> : <FolderKanban size={22} />}</div>
      <h3 className="lista-negocios-vazia-titulo">{filtrado ? "Nenhum projeto com esses filtros" : "Nenhum projeto ainda"}</h3>
      <p className="lista-negocios-vazia-desc">{filtrado ? "Experimente outra busca ou limpe os filtros." : "Cada projeto cadastrado tem o seu centro de custo, que aparece aqui com o que for vinculado a ele."}</p>
      {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : null}
    </div>;
  } else if (filtros.visao === "clientes") {
    conteudo = <PorCliente projetos={visiveis} hrefDaFicha={hrefDaFicha} aoAbrir={abrir} />;
  } else if (filtros.visao === "lista") {
    conteudo = <ListaDosProjetos projetos={visiveis} hrefDaFicha={hrefDaFicha} aoAbrir={abrir} />;
  } else {
    conteudo = <CardsDosProjetos projetos={visiveis} hrefDaFicha={hrefDaFicha} aoAbrir={abrir} aoCriarEntrada={setCriandoPara} />;
  }

  return <div className={`${estilosClientes.pagina} ${styles.pagina} ${classeDaPaginaComBarra}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Centro de custo</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>{subtitulo}</h2>
      </div>
      <div className={estilosPipelines.acoes}><SeloDoPrototipo /></div>
    </header>

    <div className={styles.metricas} role="group" aria-label="Resumo dos projetos mostrados" style={{ "--colunas": 4 } as CSSProperties}>
      <CardDeMetrica rotulo="Recebido" valor={reais(totais.recebido)} icone={<ArrowDownLeft />} nota={totais.aReceber ? `+ ${reais(totais.aReceber)} a receber` : "nada a receber"} />
      <CardDeMetrica rotulo="Gasto" valor={reais(totais.gasto)} icone={<ArrowUpRight />} nota={totais.aPagar ? `pago e material · + ${reais(totais.aPagar)} a pagar` : "pago e material do estoque"} />
      <CardDeMetrica rotulo="Resultado" valor={<span className={totais.resultado < 0 ? styles.negativo : undefined}>{reais(totais.resultado)}</span>} icone={<Scale />} nota="recebido menos gasto" />
      <CardDeMetrica rotulo="Projetos" valor={String(visiveis.length)} icone={<FolderKanban />}
        nota={totais.acimaDoOrcamento ? `${totais.acimaDoOrcamento === 1 ? "1 acima" : `${totais.acimaDoOrcamento} acima`} do orçamento` : "nenhum acima do orçamento"} />
    </div>

    <BarraFixa rotulo="Visualização, busca e filtros dos projetos"
      abas={<div ref={abasRef} className={`${estilosPipelines.visoes} ${estilosClientes.abas}`} role="tablist" aria-label="Visualização dos projetos" onKeyDown={navegarAbas}>
        {ORDEM_DAS_VISOES.map((id) => {
          const { rotulo, icone: Icone } = VISOES[id];
          return <button key={id} type="button" id={`centro-visao-${id}`} className="ui-tab" role="tab" aria-selected={filtros.visao === id}
            aria-controls="centro-conteudo" tabIndex={filtros.visao === id ? 0 : -1} onClick={() => ir({ visao: id })}><Icone size={15} aria-hidden="true" />{rotulo}</button>;
        })}
      </div>}
      busca={campoDeBusca("barra")}
      filtros={<div className={styles.filtros} role="group" aria-label="Filtros dos projetos">
        {filtrosDaTela.map(([rotulo, filtro]) => <div key={rotulo} className={styles.filtro}>{filtro}</div>)}
        {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
      </div>}
      movel={{
        visao: { rotulo: "Visualização", opcoes: ORDEM_DAS_VISOES.map((id) => { const { rotulo, icone: Icone } = VISOES[id]; return { value: id, label: rotulo, icon: <Icone /> }; }), valor: filtros.visao, aoMudar: (v) => ir({ visao: v as VisaoDosProjetos }) },
        filtrosAtivos: quantosFiltros,
        folha: <>{campoDeBusca("folha")}{filtrosDaTela.map(([rotulo, filtro]) => <CampoDaFolha key={rotulo} rotulo={rotulo}>{filtro}</CampoDaFolha>)}</>,
        rotuloDoResultado,
        ...(filtrado ? { aoLimpar: limpar } : {}),
      }} />

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}

    <section id="centro-conteudo" className={`${estilosClientes.conteudo} ${styles.conteudo}`} role="tabpanel" aria-labelledby={`centro-visao-${filtros.visao}`}>{conteudo}</section>

    {aberto ? <FichaDoProjeto key={aberto.id} projeto={aberto} outros={projetos.filter((p) => p.cliente.id === aberto.cliente.id && p.id !== aberto.id)} abre={abre}
      hrefDe={hrefDaFicha} aoFechar={() => router.push(hrefDosProjetos(filtros), { scroll: false })} /> : null}
    {criandoPara ? <NovaEntradaDoProjeto projeto={criandoPara} aoFechar={() => setCriandoPara(null)}
      aoCriar={() => { setAviso(`Entrada criada em Lançamentos, vinculada a ${criandoPara.nome}. Protótipo: some ao recarregar a página.`); setCriandoPara(null); }} /> : null}
  </div>;
}

/**
 * Alternativa do card para o André decidir (v3): o nome do projeto numa linha
 * pequena sob o cliente. DESLIGADA: o pedido foi tirar o nome do projeto do
 * card, mas dois projetos do mesmo cliente e do mesmo tipo ficam iguais sem ele
 * (o João tem dois "Energia solar · Plugga"). O nome segue no `title` e no nome
 * acessível do card e dos botões.
 */
const NOME_DO_PROJETO_NO_CARD = false;

/**
 * A visão padrão: o card de projeto na grade e nas classes dos Cards de
 * Lançamentos, numa variante compacta (v3, pedido do André em 27/11/2026): o
 * cliente ao lado do ícone, como título; tipo e empresa no canto; recebido e
 * gasto; o orçamento numa linha; responsável, situação e ações no rodapé.
 */
function CardsDosProjetos({ projetos, hrefDaFicha, aoAbrir, aoCriarEntrada, mostrarProjeto = NOME_DO_PROJETO_NO_CARD }: { projetos: readonly Projeto[]; aoCriarEntrada: (p: Projeto) => void; mostrarProjeto?: boolean } & AcoesDoProjeto) {
  return <div className={estilosCards.areaCards}><div className={estilosCards.grade}>
    {projetos.map((p, indice) => {
      const r = resumoDoProjeto(p);
      const Icone = iconeDoProjeto(p);
      return <article key={p.id} className={`${estilosClientes.card} ${estilosCards.card} ${styles.cardCompacto} ${estilosCards.entra}`} style={{ "--i": indice } as CSSProperties}
        aria-label={`${p.cliente.nome}: ${p.nome}`}>
        <div className={styles.topoDoCard}>
          <span className={`${estilosCards.caixa} ${styles.caixaCompacta}`} aria-hidden="true" title={`${ROTULO_DA_CLASSE[p.classe]} · ${p.tipo}`}><Icone size={18} /></span>
          <div className={styles.quemDoCard}>
            <h3><Link href={hrefDaFicha(p.id)} scroll={false} title={`${p.cliente.nome} · ${p.nome}`} aria-label={`${p.cliente.nome}: ${p.nome}`}>{p.cliente.nome}</Link></h3>
            {mostrarProjeto ? <p title={p.nome}>{p.nome}</p> : null}
          </div>
          <div className={`${estilosCards.canto} ${styles.cantoDoCard}`} title={`${p.tipo} · ${ROTULO_DA_EMPRESA[p.empresa]}`}><span className={styles.tipoDoCard}>{p.tipo}</span><span aria-hidden="true">·</span><EmpresaComPonto empresa={p.empresa} curto /></div>
        </div>
        <dl className={styles.numerosDoCard}>
          <div><dt>Recebido</dt><dd>{reais(r.recebido)}</dd>{r.aReceber ? <dd className={styles.notaDoNumero}>+ {reais(r.aReceber)} a receber</dd> : null}</div>
          <div><dt>Gasto</dt><dd>{reais(r.gasto)}</dd>{r.aPagar ? <dd className={styles.notaDoNumero}>+ {reais(r.aPagar)} a pagar</dd> : null}</div>
        </dl>
        <BarraDoOrcamento projeto={p} />
        <footer className={`${estilosCards.rodape} ${styles.rodapeCompacto}`}>
          <span className={estilosCards.prazo}><span>{p.responsavel ?? "Sem responsável"}</span><small>{p.inicio ? `desde ${dataCurta(p.inicio)}` : "sem início"}</small></span>
          <Badge tone={TOM_DA_SITUACAO[p.situacao]}>{ROTULO_DA_SITUACAO[p.situacao]}</Badge>
          <Button variant="secondary" size="sm" className={styles.botaoDoRodape} iconOnly icon={<Plus size={13} />} aria-label={`Nova entrada em ${p.nome}, de ${p.cliente.nome}`} title={`Nova entrada em ${p.nome}`} onClick={() => aoCriarEntrada(p)} />
          <Button variant="secondary" size="sm" className={styles.botaoDoRodape} iconOnly icon={<Eye size={13} />} aria-label={`Abrir o centro de custo de ${p.nome}`} title={`Abrir o centro de custo de ${p.nome}`} onClick={() => aoAbrir(p.id)} />
        </footer>
      </article>;
    })}
  </div></div>;
}

function Valor({ centavos, nota, sinal = false }: { centavos: number; nota?: string | null; sinal?: boolean }) {
  return <div className={estilosLista.valor}>
    <strong className={sinal && centavos < 0 ? styles.negativo : undefined}>{reais(centavos)}</strong>
    {nota ? <small>{nota}</small> : null}
  </div>;
}

function ListaDosProjetos({ projetos, hrefDaFicha, aoAbrir }: { projetos: readonly Projeto[] } & AcoesDoProjeto) {
  return <div className={`lista-negocios ${estilosLista.lista} ${styles.lista}`}>
    <ShellCard className="table-card lista-negocios-card">
      <div className="card-heading"><div className={estilosLista.cabecalhoTabela}>
        <div><h2>{projetos.length === 1 ? "1 projeto" : `${projetos.length} projetos`}</h2><span>Cada projeto é um centro de custo. Abra um para ver de onde vem cada valor.</span></div>
      </div></div>
      <div className={estilosLista.rolagemTabela} role="region" aria-label="Projetos" tabIndex={0}>
        <ShellTable caption="Projetos e os seus centros de custo">
          <thead><tr><th scope="col">Projeto</th><th scope="col">Situação</th><th scope="col">Recebido</th><th scope="col">Gasto</th><th scope="col">Resultado</th><th scope="col">Orçamento</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{projetos.map((p, indice) => {
            const r = resumoDoProjeto(p);
            const Icone = iconeDoProjeto(p);
            return <tr key={p.id} className={`${styles.linhaDoProjeto} ${styles.entra}`} style={{ "--i": indice } as CSSProperties}
              onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) aoAbrir(p.id); }}>
              <td data-l="Projeto"><div className={estilosLista.oportunidade}>
                <span className={estilosLista.iconeOportunidade} aria-hidden="true"><Icone size={16} /></span>
                <div className="celula-lead-bloco">
                  <Link href={hrefDaFicha(p.id)} scroll={false} className={`lead-nome ${estilosLista.titulo} ${styles.nomeDoProjeto}`} title={p.nome}>{p.nome}</Link>
                  <span className={styles.subLinha}><span title={`${p.cliente.nome} · ${ROTULO_DA_CLASSE[p.classe]} · ${p.tipo}`}>{p.cliente.nome} · {p.tipo}</span><EmpresaComPonto empresa={p.empresa} curto /></span>
                </div>
              </div></td>
              <td data-l="Situação"><div className={estilosLista.etapa}><Badge tone={TOM_DA_SITUACAO[p.situacao]}>{ROTULO_DA_SITUACAO[p.situacao]}</Badge></div></td>
              <td data-l="Recebido"><Valor centavos={r.recebido} nota={r.aReceber ? `+ ${reais(r.aReceber)} a receber` : null} /></td>
              <td data-l="Gasto"><Valor centavos={r.gasto} nota={r.aPagar ? `+ ${reais(r.aPagar)} a pagar` : null} /></td>
              <td data-l="Resultado"><Valor centavos={r.resultado} sinal nota={r.aReceber || r.aPagar ? `previsto ${reais(r.resultadoPrevisto)}` : null} /></td>
              <td data-l="Orçamento"><div className={estilosLista.valor}><Orcamento projeto={p} /></div></td>
              <td><div className={estilosLista.acoesLinha}><Button variant="secondary" size="sm" iconOnly icon={<Eye size={14} />} aria-label={`Abrir o centro de custo de ${p.nome}`} title="Abrir o centro de custo" onClick={() => aoAbrir(p.id)} /></div></td>
            </tr>;
          })}</tbody>
        </ShellTable>
      </div>
      <nav className="lista-paginacao" aria-label="Paginação dos projetos">
        <span className="lista-paginacao-info" role="status">Mostrando <strong>{projetos.length}</strong> {projetos.length === 1 ? "projeto" : "projetos"}</span>
      </nav>
    </ShellCard>
  </div>;
}

/** Um cliente com vários projetos: o grupo mostra a soma e cada projeto com o seu resultado. */
function PorCliente({ projetos, hrefDaFicha }: { projetos: readonly Projeto[] } & AcoesDoProjeto) {
  return <div className={styles.clientes}>{projetosPorCliente(projetos).map((g, indice) => <section key={g.cliente.id} className={`${styles.cliente} ${styles.entra}`} style={{ "--i": indice } as CSSProperties} aria-labelledby={`cliente-${g.cliente.id}`}>
    <header className={styles.clienteTopo}>
      <div>
        <h2 id={`cliente-${g.cliente.id}`}><User size={16} aria-hidden="true" />{g.cliente.nome}</h2>
        <p>{g.projetos.length === 1 ? "1 projeto" : `${g.projetos.length} projetos`} · {g.empresas.map((e) => ROTULO_DA_EMPRESA[e]).join(" e ")}</p>
      </div>
      <dl className={styles.totaisDoCliente}>
        <div><dt>Recebido</dt><dd>{reais(g.recebido)}</dd></div>
        <div><dt>Gasto</dt><dd>{reais(g.gasto)}</dd></div>
        <div><dt>Resultado</dt><dd className={g.resultado < 0 ? styles.negativo : undefined}>{reais(g.resultado)}</dd></div>
      </dl>
    </header>
    <ul className={styles.linhas}>{g.projetos.map((p) => {
      const r = resumoDoProjeto(p);
      const Icone = iconeDoProjeto(p);
      return <li key={p.id}><Link href={hrefDaFicha(p.id)} scroll={false} className={styles.linha}>
        <span className={styles.marca} aria-hidden="true"><Icone size={15} /></span>
        <span className={styles.texto}>
          <strong>{p.nome}</strong>
          <small>{ROTULO_DA_CLASSE[p.classe]} · {p.tipo} · <EmpresaComPonto empresa={p.empresa} curto /> · {ROTULO_DA_SITUACAO[p.situacao]}</small>
        </span>
        <span className={styles.lado}>
          <strong className={r.resultado < 0 ? styles.negativo : undefined}>{reais(r.resultado)}</strong>
          <small>{reais(r.recebido)} recebido · {reais(r.gasto)} gasto</small>
        </span>
      </Link></li>;
    })}</ul>
  </section>)}</div>;
}
