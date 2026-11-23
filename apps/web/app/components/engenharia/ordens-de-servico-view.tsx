"use client";

import {
  tiposDeOrdemDeServico,
  type ListarOrdensDeServicoResposta,
  type OpcoesDaEngenhariaResposta,
  type OrdemDeServico,
  type OrdemDeServicoResumo,
  type QuadroDeOrdensResposta,
} from "@plugga/shared";
import {
  Building2,
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  Filter,
  HardHat,
  LayoutGrid,
  Layers,
  List,
  MapPin,
  Signature,
  SquareKanban,
  TriangleAlert,
  Undo2,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from "react";

import { hojeEmManaus } from "../../lib/compras";
import {
  contagemDoFiltro,
  diasEntre,
  filtrosAtivosNasOrdens,
  GRUPOS_DO_FILTRO_DE_SITUACAO,
  hrefDasOrdens,
  primeiroNome,
  ROTULO_DO_FILTRO_DE_SITUACAO,
  ROTULO_DO_TIPO,
  temFiltroNasOrdens,
  type FiltroDeSituacaoDaTela,
  type FiltrosDasOrdens,
  type VisaoDasOrdens,
} from "../../lib/ordens-de-servico";
import { BarraFixa, CampoDaFolha, classeDaPaginaComBarra } from "../barra-fixa";
import estilosClientes from "../clientes/tela-clientes.module.css";
import { BarraRolagemMinimalista } from "../pipelines/quadro-do-pipeline";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { CardDeMetrica, MetricasDoTopo } from "../suprimentos/card-de-metrica";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus, IconSearch } from "../ui";
import { CardsDeOrdens } from "./cards-de-ordens";
import { FichaDaOrdem } from "./ficha-da-ordem";
import styles from "./engenharia.module.css";
import { ListaDeOrdens } from "./lista-de-ordens";
import { OrdemForm } from "./ordem-form";
import { ICONE_DO_TIPO } from "./partes";
import { QuadroDeOrdens } from "./quadro-de-ordens";

const VISOES: Record<VisaoDasOrdens, { rotulo: string; icone: LucideIcon }> = {
  cards: { rotulo: "Cards", icone: LayoutGrid },
  lista: { rotulo: "Lista", icone: List },
  quadro: { rotulo: "Quadro", icone: SquareKanban },
};
const ORDEM_DAS_VISOES: VisaoDasOrdens[] = ["cards", "lista", "quadro"];

const ICONE_DO_FILTRO: Record<FiltroDeSituacaoDaTela, LucideIcon> = {
  em_andamento: Clock,
  aberta: CalendarClock,
  agendada: CalendarCheck,
  em_campo: MapPin,
  laudo: Signature,
  atrasadas: TriangleAlert,
  em_campo_hoje: HardHat,
  adiada: Undo2,
  concluida: CircleCheck,
  cancelada: CircleX,
};

/**
 * Ordens de serviço (PLU-345): todo serviço técnico da Plugga e da Waze, do
 * pedido ao termo assinado, em cards, lista ou quadro. Filtros, visão e ficha
 * vão no endereço. Esta é a única barra presa da Engenharia.
 */
export function OrdensDeServicoView({ filtros, lista, quadro, opcoes, hoje, ficha, falhaDaFicha, podeAbrirCompras }: {
  filtros: FiltrosDasOrdens;
  /** A lista traz também as contagens dos metric cards e do filtro (no quadro, sem o filtro de situação). */
  lista: ListarOrdensDeServicoResposta;
  quadro: QuadroDeOrdensResposta | null;
  /** Nulas quando a leitura falhou: o filtro de técnico fica de fora. */
  opcoes: OpcoesDaEngenhariaResposta | null;
  hoje: string;
  ficha: OrdemDeServico | null;
  falhaDaFicha: "nao_encontrada" | "indisponivel" | null;
  /** Os pedidos de material abrem a ficha em Compras para quem alcança a tela. */
  podeAbrirCompras: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [criando, setCriando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 5000); return () => clearTimeout(t); }, [aviso]);
  const abasRef = useRef<HTMLDivElement>(null);
  const colunasRef = useRef<HTMLDivElement>(null);
  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);

  const ehQuadro = filtros.visao === "quadro";
  const filtrado = temFiltroNasOrdens(filtros);
  const c = lista.contagens;
  const ir = (parcial: Partial<FiltrosDasOrdens>, ordem: string | null = null) => router.push(hrefDasOrdens({ ...filtros, ...parcial }, ordem), { scroll: false });
  const hrefDaFicha = (id: string) => hrefDasOrdens(filtros, id);
  const abrir = (id: string) => router.push(hrefDaFicha(id), { scroll: false });
  const fecharFicha = () => router.push(hrefDasOrdens(filtros), { scroll: false });
  const limpar = () => { setBusca(""); router.push(hrefDasOrdens({ visao: filtros.visao }), { scroll: false }); };

  function buscar(evento: FormEvent) { evento.preventDefault(); ir({ busca: busca.trim() || undefined }); }

  function navegarAbas(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const i = ORDEM_DAS_VISOES.indexOf(filtros.visao);
    const n = ORDEM_DAS_VISOES.length;
    const proxima = ORDEM_DAS_VISOES[evento.key === "Home" ? 0 : evento.key === "End" ? n - 1 : (i + (evento.key === "ArrowRight" ? 1 : n - 1)) % n]!;
    ir({ visao: proxima });
    abasRef.current?.querySelector<HTMLButtonElement>(`#os-visao-${proxima}`)?.focus();
  }

  // Clicar num card liga o filtro de situação dele; clicar de novo desliga. No quadro (sem situação), não clicam.
  const doCard = (valor: FiltroDeSituacaoDaTela) => (ehQuadro ? {} : {
    ativo: filtros.situacao === valor,
    aoClicar: () => ir({ situacao: filtros.situacao === valor ? undefined : valor }),
  });
  const emAberto = contagemDoFiltro("em_andamento", c);
  const notaEmAberto = [c.para_agendar ? `${c.para_agendar} para agendar` : null, c.adiadas ? `${c.adiadas} ${c.adiadas === 1 ? "adiada" : "adiadas"}` : null].filter(Boolean).join(" · ") || "nada esperando agenda";
  const diasDaMaisAntiga = lista.atrasadaMaisAntigaEm ? diasEntre(lista.atrasadaMaisAntigaEm, hoje) : null;
  const notaAtrasadas = c.atrasadas === 0 ? "nenhuma atrasada"
    : diasDaMaisAntiga && diasDaMaisAntiga > 0 ? `a mais antiga há ${diasDaMaisAntiga} ${diasDaMaisAntiga === 1 ? "dia" : "dias"}` : "vencem hoje";
  const tecnicosHoje = [...new Set(lista.itens.filter((o) => emCampoHoje(o, hoje)).flatMap((o) => (o.tecnico ? [primeiroNome(o.tecnico.nome)] : [])))];
  const notaHoje = c.em_campo_hoje === 0 ? "ninguém em campo" : tecnicosHoje.length ? tecnicosHoje.join(", ") : "com técnico em campo ou agendadas";

  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];
  const situacoes = [
    { value: "todas", label: "Todas as situações", icon: <Layers />, aside: String(contagemDoFiltro("todas", c)) },
    ...GRUPOS_DO_FILTRO_DE_SITUACAO.flatMap(({ rotulo, valores }) => valores.map((v) => {
      const Icone = ICONE_DO_FILTRO[v];
      return { value: v, label: ROTULO_DO_FILTRO_DE_SITUACAO[v], icon: <Icone />, aside: String(contagemDoFiltro(v, c)), grupo: rotulo };
    })),
  ];
  const tipos = [{ value: "todos", label: "Todos os tipos", icon: <Wrench /> }, ...tiposDeOrdemDeServico.map((t) => { const Icone = ICONE_DO_TIPO[t]; return { value: t, label: ROTULO_DO_TIPO[t], icon: <Icone /> }; })];
  const tecnicos = opcoes ? [{ value: "todos", label: "Todos os técnicos", icon: <UserRound /> }, ...opcoes.tecnicos.map((p) => ({ value: p.id, label: p.nome, icon: <UserRound /> }))] : null;

  const filtrosDaTela: [string, ReactElement][] = [
    ...(ehQuadro ? [] : [["Situação", <FiltroComBusca key="situacao" label="Situação" icon={<Layers />} semFiltro="todas" value={filtros.situacao ?? "todas"}
      onChange={(v) => ir({ situacao: v === "todas" ? undefined : (v as FiltroDeSituacaoDaTela) })} options={situacoes} />] as [string, ReactElement]]),
    ["Tipo", <FiltroComBusca key="tipo" label="Tipo" icon={<Wrench />} semFiltro="todos" value={filtros.tipo ?? "todos"}
      onChange={(v) => ir({ tipo: v === "todos" ? undefined : (v as FiltrosDasOrdens["tipo"]) })} options={tipos} />],
    ...(tecnicos ? [["Técnico", <FiltroComBusca key="tecnico" label="Técnico" icon={<UserRound />} semFiltro="todos" value={filtros.tecnicoId ?? "todos"}
      onChange={(v) => ir({ tecnicoId: v === "todos" ? undefined : v })} options={tecnicos} />] as [string, ReactElement]] : []),
    ["Empresa", <FiltroComBusca key="empresa" label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"}
      onChange={(v) => ir({ empresa: v === "todas" ? undefined : (v as FiltrosDasOrdens["empresa"]) })} options={empresas} />],
  ];

  const campoDeBusca = (onde: "barra" | "folha") => <form className="equipe-busca" onSubmit={buscar} role="search" aria-label="Buscar ordens de serviço">
    <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar"><IconSearch className="equipe-busca-icon" /></button>
    <input id={`os-busca-${onde}`} className="equipe-busca-input" type="search" maxLength={150} aria-label="Buscar cliente, local ou código" value={busca}
      onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, local ou código…" />
  </form>;

  const semNada = ehQuadro ? (quadro?.colunas.every((col) => col.quantidade === 0) ?? true) : lista.itens.length === 0;
  const vazio = semNada ? <div className={`lista-negocios-vazia ${styles.vazio}`} role="status">
    <div className="lista-negocios-vazia-icone" aria-hidden="true">{filtrado ? <Filter size={22} /> : <ClipboardList size={22} />}</div>
    <h3 className="lista-negocios-vazia-titulo">{filtrado ? "Nenhuma O.S. com esses filtros" : "Nenhuma ordem de serviço ainda"}</h3>
    <p className="lista-negocios-vazia-desc">{filtrado ? "Experimente outra busca ou limpe os filtros." : "Manutenções, limpezas, visitas e instalações aparecem aqui, do pedido ao termo assinado."}</p>
    {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : null}
  </div> : null;

  const resumoDaLista = [c.atrasadas ? `${c.atrasadas} ${c.atrasadas === 1 ? "atrasada" : "atrasadas"}` : null, c.para_agendar ? `${c.para_agendar} para agendar` : null].filter(Boolean).join(" · ");
  let conteudo;
  if (vazio) conteudo = vazio;
  else if (ehQuadro) conteudo = <QuadroDeOrdens colunas={quadro?.colunas ?? []} hoje={hoje} colunasRef={colunasRef} aoAbrir={abrir} />;
  else if (filtros.visao === "lista") conteudo = <ListaDeOrdens ordens={lista.itens} total={lista.total} resumo={resumoDaLista} hoje={hoje} aoAbrir={abrir} />;
  else conteudo = <CardsDeOrdens ordens={lista.itens} hoje={hoje} hrefDaFicha={hrefDaFicha} aoAbrir={abrir} />;

  return <div className={`${estilosClientes.pagina} ${styles.pagina} ${classeDaPaginaComBarra}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Ordens de serviço</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Todo serviço técnico, do pedido ao termo assinado.</h2>
      </div>
      <div className={estilosPipelines.acoes}>
        <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Nova O.S.</Button>
      </div>
    </header>

    <MetricasDoTopo rotulo="Resumo das ordens de serviço">
      <CardDeMetrica rotulo="O.S. em aberto" valor={emAberto} icone={<Wrench />} nota={notaEmAberto} {...doCard("em_andamento")} />
      <CardDeMetrica rotulo="Atrasadas" valor={c.atrasadas} icone={<TriangleAlert />} nota={notaAtrasadas} {...doCard("atrasadas")} />
      <CardDeMetrica rotulo="Em campo hoje" valor={c.em_campo_hoje} icone={<HardHat />} nota={notaHoje} {...doCard("em_campo_hoje")} />
      <CardDeMetrica rotulo="Para colher assinatura" valor={c.colher_assinatura} icone={<Signature />} nota={c.colher_assinatura ? "laudo pronto, falta o termo" : "nenhum termo pendente"} {...doCard("laudo")} />
    </MetricasDoTopo>

    <BarraFixa rotulo="Visualização, busca e filtros das ordens de serviço"
      abas={<div ref={abasRef} className={`${estilosPipelines.visoes} ${estilosClientes.abas} ${styles.abas}`} role="tablist" aria-label="Visualização das ordens de serviço" onKeyDown={navegarAbas}>
        {ORDEM_DAS_VISOES.map((id) => {
          const { rotulo, icone: Icone } = VISOES[id];
          return <button key={id} type="button" id={`os-visao-${id}`} className="ui-tab" role="tab" aria-selected={filtros.visao === id}
            aria-controls="os-conteudo" tabIndex={filtros.visao === id ? 0 : -1} onClick={() => ir({ visao: id })}><Icone size={15} aria-hidden="true" />{rotulo}</button>;
        })}
      </div>}
      busca={campoDeBusca("barra")}
      filtros={<div className={styles.filtros} role="group" aria-label="Filtros das ordens de serviço">
        {filtrosDaTela.map(([rotulo, filtro]) => <div key={rotulo} className={styles.filtro}>{filtro}</div>)}
        {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
      </div>}
      acoesQuandoPresa={<Button size="md" iconOnly icon={<IconPlus />} aria-label="Nova O.S." title="Nova O.S." onClick={() => setCriando(true)} />}
      movel={{
        visao: { rotulo: "Visualização", opcoes: ORDEM_DAS_VISOES.map((id) => { const { rotulo, icone: Icone } = VISOES[id]; return { value: id, label: rotulo, icon: <Icone /> }; }), valor: filtros.visao, aoMudar: (v) => ir({ visao: v as VisaoDasOrdens }) },
        filtrosAtivos: filtrosAtivosNasOrdens(filtros),
        folha: <>{campoDeBusca("folha")}{filtrosDaTela.map(([rotulo, filtro]) => <CampoDaFolha key={rotulo} rotulo={rotulo}>{filtro}</CampoDaFolha>)}</>,
        rotuloDoResultado: ehQuadro ? "Ver o quadro" : `Ver ${lista.total === 1 ? "1 O.S." : `${lista.total} O.S.`}`,
        ...(filtrado ? { aoLimpar: limpar } : {}),
      }} />
    {ehQuadro && !semNada ? <BarraRolagemMinimalista containerRef={colunasRef} className={`${estilosPipelines.rolagem} ${styles.rolagemQuadro}`} /> : null}

    {/* A lista para em 200 (LIMITE_DA_LISTA_DE_ORDENS). */}
    {!ehQuadro && lista.total > lista.itens.length
      ? <p className={styles.teto} role="status">Mostrando as {lista.itens.length} mais recentes de {lista.total} O.S. Use os filtros para ver as demais.</p> : null}
    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
    {falhaDaFicha === "nao_encontrada" ? <p className="aviso aviso--alerta" role="status">O.S. não encontrada. O link pode estar errado ou ela não é de uma tela que você alcança.</p> : null}
    {falhaDaFicha === "indisponivel" ? <p className="aviso aviso--erro" role="alert">Não foi possível abrir a O.S. agora. Tente de novo em instantes.</p> : null}
    {opcoes === null ? <p className="aviso aviso--alerta" role="status">Não foi possível carregar os técnicos: o filtro de técnico fica de fora até recarregar a página.</p> : null}

    <section id="os-conteudo" className={`${estilosClientes.conteudo} ${styles.conteudo}`} role="tabpanel" aria-labelledby={`os-visao-${filtros.visao}`}>{conteudo}</section>

    {ficha ? <FichaDaOrdem key={ficha.id} ordem={ficha} opcoes={opcoes} podeAbrirCompras={podeAbrirCompras} aoFechar={fecharFicha} aoAtualizar={() => router.refresh()} /> : null}
    {criando ? <OrdemForm empresaInicial={filtros.empresa} hoje={hoje} aoCancelar={() => setCriando(false)}
      aoSalvar={(o) => { setCriando(false); setAviso(`${o.codigo} criada: falta agendar.`); router.push(hrefDasOrdens(filtros, o.id), { scroll: false }); router.refresh(); }} /> : null}
  </div>;
}

/** Em campo agora ou agendada para hoje (a mesma regra do card da API, para os nomes da nota). */
function emCampoHoje(o: OrdemDeServicoResumo, hoje: string): boolean {
  if (o.situacao === "em_campo") return true;
  return o.situacao === "agendada" && o.agendadaPara !== null && hojeEmManaus(new Date(o.agendadaPara)) === hoje;
}
