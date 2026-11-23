"use client";

import {
  categoriasDeItemDeEstoque,
  rotulosDaCategoriaDeItemDeEstoque,
  tiposDeMovimentacao,
  type ItemDeEstoque,
  type ItemDeEstoqueNaLista,
  type ListarItensDeEstoqueResposta,
  type ListarMovimentacoesResposta,
  type Movimentacao,
} from "@plugga/shared";
import { ArrowRight, Ban, Building2, CalendarDays, Clock3, Download, Filter, History, LayoutGrid, List, Package, Pencil, Tag, TriangleAlert, Upload, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { hrefDeCompras, ROTULO_DA_EMPRESA, valorCurto } from "../../lib/compras";
import {
  filtrosDeSaldoDaTela,
  hrefDeEstoque,
  periodosDeMovimentacao,
  ROTULO_DO_FILTRO_DE_SALDO,
  ROTULO_DO_FILTRO_DE_TIPO,
  ROTULO_DO_PERIODO_DE_MOVIMENTACAO,
  temFiltro,
  type FiltrosDeEstoque,
  type TipoRegistravel,
  type VisaoDoEstoque,
} from "../../lib/estoque";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { CardDeMetrica, MetricasDoTopo } from "../suprimentos/card-de-metrica";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus, IconSearch } from "../ui";
import { CardsDoEstoque } from "./cards-do-estoque";
import styles from "./estoque.module.css";
import { FichaDoItem } from "./ficha-do-item";
import { ItemForm } from "./item-form";
import { ListaDoEstoque } from "./lista-do-estoque";
import { DetalheDaMovimentacao, MovimentacoesDoEstoque } from "./movimentacoes-do-estoque";
import { RegistrarMovimentacao } from "./registrar-movimentacao";
import { ReporItem } from "./repor-item";

const VISOES: { id: VisaoDoEstoque; rotulo: string; icone: typeof List }[] = [
  { id: "cards", rotulo: "Cards", icone: LayoutGrid },
  { id: "lista", rotulo: "Lista", icone: List },
  { id: "movimentacoes", rotulo: "Movimentações", icone: History },
];

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);

/**
 * Estoque (PLU-333): saldo dos materiais da Plugga e da Waze em cards ou
 * lista, as movimentações por dia, a ficha do item e o registro de entrada,
 * saída e ajuste. Filtros, visão e ficha vão no endereço.
 */
export function EstoqueView({ filtros, itens, resumo, todosOsItens, movimentacoes, ficha, fichaNaoEncontrada, hoje, podeAbrirPedido }: {
  filtros: FiltrosDeEstoque;
  itens: ItemDeEstoqueNaLista[];
  resumo: ListarItensDeEstoqueResposta["resumo"] | null;
  /** Todos os itens ativos, sem filtro: alimentam os menus de item. */
  todosOsItens: ItemDeEstoqueNaLista[];
  movimentacoes: ListarMovimentacoesResposta | null;
  ficha: ItemDeEstoque | null;
  fichaNaoEncontrada: boolean;
  hoje: string;
  podeAbrirPedido: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [registrando, setRegistrando] = useState<{ item: ItemDeEstoqueNaLista | null; tipo: TipoRegistravel } | null>(null);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [repondo, setRepondo] = useState(false);
  const [detalhe, setDetalhe] = useState<Movimentacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const abasRef = useRef<HTMLDivElement>(null);
  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 5000); return () => clearTimeout(t); }, [aviso]);

  const movimentos = filtros.visao === "movimentacoes";
  const filtrado = temFiltro(filtros);
  const ir = (parcial: Partial<FiltrosDeEstoque>, item: string | null = null) => router.push(hrefDeEstoque({ ...filtros, ...parcial }, item), { scroll: false });
  const hrefDaFicha = (id: string) => hrefDeEstoque(filtros, id);
  const abrirFicha = (id: string) => { setDetalhe(null); router.push(hrefDaFicha(id), { scroll: false }); };
  const fecharFicha = () => router.push(hrefDeEstoque(filtros), { scroll: false });
  const limpar = () => { setBusca(""); router.push(hrefDeEstoque({ visao: filtros.visao }), { scroll: false }); };
  const naLista = (id: string) => todosOsItens.find((i) => i.id === id) ?? itens.find((i) => i.id === id) ?? null;

  function buscar(evento: FormEvent) { evento.preventDefault(); ir({ busca: busca.trim() || undefined }); }

  function navegarAbas(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const i = VISOES.findIndex((v) => v.id === filtros.visao);
    const proxima = evento.key === "Home" ? 0 : evento.key === "End" ? VISOES.length - 1 : (i + (evento.key === "ArrowRight" ? 1 : VISOES.length - 1)) % VISOES.length;
    ir({ visao: VISOES[proxima]!.id });
    abasRef.current?.querySelector<HTMLButtonElement>(`#estoque-visao-${VISOES[proxima]!.id}`)?.focus();
  }

  const periodo = ROTULO_DO_PERIODO_DE_MOVIMENTACAO[filtros.periodo].toLowerCase();
  const metricas = movimentos
    ? movimentacoes ? <MetricasDoTopo rotulo="Resumo das movimentações">
      <CardDeMetrica rotulo="Entradas" valor={movimentacoes.resumo.entradas.quantidade} nota={`${valorCurto(movimentacoes.resumo.entradas.valor)} pelo custo · ${periodo}`} icone={<Download />} />
      <CardDeMetrica rotulo="Saídas" valor={movimentacoes.resumo.saidas.quantidade} nota={`${valorCurto(movimentacoes.resumo.saidas.valor)} pelo custo · ${periodo}`} icone={<Upload />} />
      <CardDeMetrica rotulo="Ajustes" valor={movimentacoes.resumo.ajustes.quantidade} nota="correções de contagem" icone={<Pencil />} />
      <CardDeMetrica rotulo="Reservas" valor={movimentacoes.resumo.reservas.quantidade} nota="para pedidos de compra" icone={<Clock3 />} />
    </MetricasDoTopo> : null
    : resumo ? <MetricasDoTopo rotulo={`Resumo do estoque${filtros.empresa ? ` da ${ROTULO_DA_EMPRESA[filtros.empresa]}` : ""}`}>
      <CardDeMetrica rotulo="Itens" valor={resumo.itens} nota={`${resumo.normais} ${resumo.normais === 1 ? "normal" : "normais"} · ${filtros.empresa ? ROTULO_DA_EMPRESA[filtros.empresa] : "Plugga e Waze"}`} icone={<Package />} barra={pct(resumo.normais, resumo.itens)} />
      <CardDeMetrica rotulo="Abaixo do mínimo" valor={resumo.abaixoDoMinimo} nota="repor em breve" icone={<TriangleAlert />} barra={pct(resumo.abaixoDoMinimo, resumo.itens)} tom="ambar" />
      <CardDeMetrica rotulo="Zerados" valor={resumo.zerados} nota="sem saldo disponível" icone={<Ban />} barra={pct(resumo.zerados, resumo.itens)} tom="ambar" />
      <CardDeMetrica rotulo="Valor em estoque" valor={valorCurto(resumo.valorEmEstoque)} nota={`pelo custo médio · ${resumo.comReserva} com reserva`} icone={<Wallet />} />
    </MetricasDoTopo> : null;

  const vazio = (titulo: string, texto: string) => <div className={`lista-negocios-vazia ${styles.vazio}`} role="status">
    <div className="lista-negocios-vazia-icone" aria-hidden="true"><Package size={22} /></div>
    <h3 className="lista-negocios-vazia-titulo">{titulo}</h3>
    <p className="lista-negocios-vazia-desc">{texto}</p>
    {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : movimentos ? null : <Button size="sm" icon={<IconPlus />} onClick={() => setCriando(true)}>Cadastrar item</Button>}
  </div>;

  let conteudo;
  if (movimentos) {
    conteudo = !movimentacoes || movimentacoes.dias.length === 0
      ? vazio("Nenhuma movimentação encontrada", "Entradas, saídas, ajustes e reservas aparecem aqui, com data e autoria.")
      : <MovimentacoesDoEstoque dias={movimentacoes.dias} hoje={hoje} aoAbrir={setDetalhe} />;
  } else if (itens.length === 0) {
    conteudo = filtrado ? vazio("Nenhum item encontrado", "Não há itens com a busca ou os filtros atuais.") : vazio("Nenhum item no estoque ainda", "Cadastre o primeiro item ou dê entrada pelo recebimento de uma compra.");
  } else {
    const acoes = { aoAbrir: abrirFicha, aoMovimentar: (item: ItemDeEstoqueNaLista) => setRegistrando({ item, tipo: "saida" }) };
    conteudo = filtros.visao === "cards"
      ? <CardsDoEstoque itens={itens} hrefDaFicha={hrefDaFicha} {...acoes} />
      : <ListaDoEstoque itens={itens} valorTotal={String(itens.reduce((s, i) => s + Number(i.saldo.valor), 0))} {...acoes} />;
  }

  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <Building2 /> }, { value: "waze", label: "Waze Energia", icon: <Building2 /> }];

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Estoque</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Saldo dos materiais da Plugga e da Waze, com tudo o que entrou e saiu.</h2>
      </div>
      <div className={estilosPipelines.acoes}>
        <form className="equipe-busca" onSubmit={buscar} role="search" aria-label="Buscar no estoque">
          <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar"><IconSearch className="equipe-busca-icon" /></button>
          <input className="equipe-busca-input" type="search" maxLength={150} aria-label="Buscar item ou código" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item ou código…" />
        </form>
        <Button variant="secondary" icon={<IconPlus />} onClick={() => setCriando(true)}>Novo item</Button>
        <Button icon={<ArrowRight size={16} />} onClick={() => setRegistrando({ item: null, tipo: "entrada" })}>Registrar movimentação</Button>
      </div>
    </header>

    {metricas}

    <div className={`${estilosPipelines.navegacao} ${estilosClientes.navegacao} ${styles.navegacao}`}>
      <div ref={abasRef} className={`${estilosPipelines.visoes} ${estilosClientes.abas} ${styles.abas}`} role="tablist" aria-label="Visão do estoque" onKeyDown={navegarAbas}>
        {VISOES.map(({ id, rotulo, icone: Icone }) => <button key={id} type="button" id={`estoque-visao-${id}`} className="ui-tab" role="tab" aria-selected={filtros.visao === id}
          aria-controls="estoque-conteudo" tabIndex={filtros.visao === id ? 0 : -1} onClick={() => ir({ visao: id })}><Icone size={15} aria-hidden="true" />{rotulo}</button>)}
      </div>
      <span className={styles.espaco} />
      <div className={`${estilosPipelines.navegacaoDireita} ${estilosClientes.filtros} ${styles.filtros}`} role="group" aria-label="Filtros do estoque">
        <div className={styles.filtro}><FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"} onChange={(v) => ir({ empresa: v === "todas" ? undefined : (v as FiltrosDeEstoque["empresa"]) })} options={empresas} /></div>
        {movimentos ? <>
          <div className={styles.filtro}><FiltroComBusca label="Tipo" icon={<History />} semFiltro="todos" value={filtros.tipo ?? "todos"} onChange={(v) => ir({ tipo: v === "todos" ? undefined : (v as FiltrosDeEstoque["tipo"]) })}
            options={[{ value: "todos", label: "Todos os tipos", icon: <History /> }, ...tiposDeMovimentacao.map((t) => ({ value: t, label: ROTULO_DO_FILTRO_DE_TIPO[t], icon: <History /> }))]} /></div>
          <div className={styles.filtro}><FiltroComBusca label="Item" icon={<Package />} semFiltro="todos" value={filtros.itemId ?? "todos"} onChange={(v) => ir({ itemId: v === "todos" ? undefined : v })}
            options={[{ value: "todos", label: "Todos os itens" }, ...todosOsItens.filter((i) => !filtros.empresa || i.empresa === filtros.empresa).map((i) => ({ value: i.id, label: i.nome, description: `${i.codigo} · ${ROTULO_DA_EMPRESA[i.empresa]}` }))]} /></div>
          <div className={styles.filtro}><FiltroComBusca label="Período" icon={<CalendarDays />} semFiltro="30" value={filtros.periodo} onChange={(v) => ir({ periodo: v as FiltrosDeEstoque["periodo"] })}
            options={periodosDeMovimentacao.map((p) => ({ value: p, label: ROTULO_DO_PERIODO_DE_MOVIMENTACAO[p], icon: <CalendarDays /> }))} /></div>
        </> : <>
          <div className={styles.filtro}><FiltroComBusca label="Categoria" icon={<Tag />} semFiltro="todas" value={filtros.categoria ?? "todas"} onChange={(v) => ir({ categoria: v === "todas" ? undefined : (v as FiltrosDeEstoque["categoria"]) })}
            options={[{ value: "todas", label: "Todas as categorias", icon: <Tag /> }, ...categoriasDeItemDeEstoque.map((c) => ({ value: c, label: rotulosDaCategoriaDeItemDeEstoque[c], icon: <Tag /> }))]} /></div>
          <div className={styles.filtro}><FiltroComBusca label="Saldo" icon={<Filter />} semFiltro="qualquer" value={filtros.saldo ?? "qualquer"} onChange={(v) => ir({ saldo: v === "qualquer" ? undefined : (v as FiltrosDeEstoque["saldo"]) })}
            options={[{ value: "qualquer", label: "Qualquer saldo", icon: <Filter /> }, ...filtrosDeSaldoDaTela.map((s) => ({ value: s, label: ROTULO_DO_FILTRO_DE_SALDO[s], icon: <Filter /> }))]} /></div>
        </>}
        {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
      </div>
    </div>

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
    {fichaNaoEncontrada ? <p className="aviso aviso--alerta" role="status">Item não encontrado. O link pode estar errado.</p> : null}
    {movimentacoes && movimentacoes.total > movimentacoes.dias.reduce((s, d) => s + d.movimentacoes.length, 0)
      ? <p className={styles.muted} role="status">Mostrando as {movimentacoes.dias.reduce((s, d) => s + d.movimentacoes.length, 0)} mais recentes de {movimentacoes.total}. Use os filtros para ver as demais.</p> : null}

    <section id="estoque-conteudo" className={`${estilosClientes.conteudo} ${styles.conteudo}`} role="tabpanel" aria-labelledby={`estoque-visao-${filtros.visao}`}>{conteudo}</section>

    {ficha ? <FichaDoItem key={ficha.id} item={ficha} aoFechar={fecharFicha} aoEditar={() => setEditando(true)}
      aoMovimentar={(tipo) => setRegistrando({ item: naLista(ficha.id) ?? ficha, tipo })} aoRepor={podeAbrirPedido ? () => setRepondo(true) : undefined} /> : null}
    {detalhe ? <DetalheDaMovimentacao m={detalhe} aoFechar={() => setDetalhe(null)} aoVerItem={abrirFicha} /> : null}
    {registrando ? <RegistrarMovimentacao itens={todosOsItens} itemInicial={registrando.item} tipoInicial={registrando.tipo} aoCancelar={() => setRegistrando(null)}
      aoCadastrarItem={() => { setRegistrando(null); setCriando(true); }}
      aoRegistrar={(m) => { setRegistrando(null); setAviso(`${m.tipo === "entrada" ? "Entrada registrada" : m.tipo === "saida" ? "Saída registrada" : "Ajuste registrado"}: ${m.item.nome}.`); router.refresh(); }} /> : null}
    {criando ? <ItemForm aoCancelar={() => setCriando(false)} aoSalvar={(item) => { setCriando(false); setAviso(`${item.nome} cadastrado no estoque da ${ROTULO_DA_EMPRESA[item.empresa]}.`); router.push(hrefDeEstoque(filtros, item.id), { scroll: false }); router.refresh(); }} /> : null}
    {editando && ficha ? <ItemForm item={ficha} aoCancelar={() => setEditando(false)} aoSalvar={() => { setEditando(false); setAviso("Item atualizado."); router.refresh(); }} /> : null}
    {repondo && ficha ? <ReporItem item={ficha} aoCancelar={() => setRepondo(false)} aoAbrir={(p) => { setRepondo(false); router.push(hrefDeCompras({ visao: "quadro", cancelados: false, situacao: "em_andamento" }, p.pedidoId)); }} /> : null}
  </div>;
}
