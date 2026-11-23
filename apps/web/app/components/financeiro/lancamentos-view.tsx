"use client";

import type { Lancamento, LancamentoResumo, ListarLancamentosResposta, OpcoesDoFinanceiro, QuadroFinanceiro, ResumoDosLancamentos } from "@plugga/shared";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  CloudOff,
  FileText,
  Filter,
  Layers,
  LayoutGrid,
  Link2,
  List,
  Scale,
  Send,
  SquareKanban,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactElement } from "react";

import { ROTULO_DA_EMPRESA, valorEmReais } from "../../lib/compras";
import {
  cardAtivo,
  cardsClicaveis,
  comVisao,
  comSituacao,
  comVencimento,
  filtroAoClicarNoCard,
  hrefDosLancamentos,
  type CardDoResumo,
  OPCOES_DE_VENCIMENTO,
  opcoesDeSituacaoPara,
  quantosFiltros,
  temFiltroNosLancamentos,
  visoesDosLancamentos,
  type FiltrosDosLancamentos,
  type IconeDaSituacao,
  type VisaoDosLancamentos,
} from "../../lib/financeiro";
import { BarraFixa, CampoDaFolha, classeDaPaginaComBarra } from "../barra-fixa";
import estilosClientes from "../clientes/tela-clientes.module.css";
import { BarraRolagemMinimalista } from "../pipelines/quadro-do-pipeline";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { CardDeMetrica } from "../suprimentos/card-de-metrica";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus, IconSearch } from "../ui";
import { CardsDosLancamentos } from "./cards-dos-lancamentos";
import { ContaAPagarForm } from "./conta-a-pagar-form";
import { FichaDoLancamento } from "./ficha-do-lancamento";
import styles from "./lancamentos.module.css";
import { ListaDosLancamentos } from "./lista-dos-lancamentos";
import { QuadroDosLancamentos } from "./quadro-dos-lancamentos";

const VISOES: Record<VisaoDosLancamentos, { rotulo: string; icone: LucideIcon }> = {
  cards: { rotulo: "Cards", icone: LayoutGrid },
  lista: { rotulo: "Lista", icone: List },
  quadro: { rotulo: "Quadro", icone: SquareKanban },
};

const ICONE_DA_SITUACAO: Record<IconeDaSituacao, LucideIcon> = {
  // "Aprovadas" usa um selo, não o check, que no menu é a marca da opção escolhida.
  camadas: Layers, saida: ArrowUpRight, relogio: Clock, check: BadgeCheck, alerta: TriangleAlert, entrada: ArrowDownLeft, arquivo: FileText,
  enviar: Send, concluido: CheckCircle2, carteira: Wallet, link: Link2, cancelado: Ban, nuvem: CloudOff,
};

/** "2026-11-30" → "30/11". */
const diaEMes = (dia: string) => dia.slice(5, 10).split("-").reverse().join("/");

/**
 * Lançamentos (PLU-336): as saídas e as entradas da Plugga e da Waze numa tela
 * só. Metric cards de caixa, filtros de Situação, Empresa e Vencimento, e as
 * visões Cards (padrão), Lista e Quadro. Filtros, visão e ficha vão no endereço.
 */
export function LancamentosView({ filtros, lista, quadro, resumo, alcance, ficha, falhaDaFicha, opcoes, gerente }: {
  filtros: FiltrosDosLancamentos;
  /** Na visão Cards ou Lista. */
  lista: ListarLancamentosResposta | null;
  /** Na visão Quadro. */
  quadro: QuadroFinanceiro | null;
  /** Os metric cards: com a lista, ou do modo só-resumo no Quadro. */
  resumo: ResumoDosLancamentos;
  alcance: ListarLancamentosResposta["alcance"];
  ficha: Lancamento | null;
  falhaDaFicha: "nao_encontrada" | "indisponivel" | null;
  /** Nulas quando a leitura falhou: a lista abre, criar e editar ficam desligados. */
  opcoes: OpcoesDoFinanceiro | null;
  /** Gerente do Financeiro (ou plataforma): edita tudo na conta aprovada. */
  gerente: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [criando, setCriando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 5000); return () => clearTimeout(t); }, [aviso]);
  const abasRef = useRef<HTMLDivElement>(null);
  const colunasRef = useRef<HTMLDivElement>(null);
  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);

  const ir = (parcial: Partial<FiltrosDosLancamentos>, lancamento: string | null = null) =>
    router.push(hrefDosLancamentos({ ...filtros, ...parcial }, lancamento), { scroll: false });
  /** Troca os filtros inteiros (quando um desliga o outro, como Canceladas e Vencimento). */
  const trocar = (novos: FiltrosDosLancamentos) => router.push(hrefDosLancamentos(novos), { scroll: false });
  const hrefDaFicha = (id: string) => hrefDosLancamentos(filtros, id);
  const abrir = (id: string) => router.push(hrefDaFicha(id), { scroll: false });
  const filtrado = temFiltroNosLancamentos(filtros);
  const limpar = () => { setBusca(""); router.push(hrefDosLancamentos({ visao: filtros.visao }), { scroll: false }); };

  function buscar(evento: FormEvent) { evento.preventDefault(); ir({ busca: busca.trim() || undefined }); }

  function navegarAbas(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const i = visoesDosLancamentos.indexOf(filtros.visao);
    const n = visoesDosLancamentos.length;
    const proxima = evento.key === "Home" ? 0 : evento.key === "End" ? n - 1 : (i + (evento.key === "ArrowRight" ? 1 : n - 1)) % n;
    const visao = visoesDosLancamentos[proxima]!;
    trocar(comVisao(filtros, visao));
    abasRef.current?.querySelector<HTMLButtonElement>(`#lancamentos-visao-${visao}`)?.focus();
  }

  const fecharFicha = () => router.push(hrefDosLancamentos(filtros), { scroll: false });
  const ate = diaEMes(resumo.ate);
  // Clicar num card liga o filtro dele (situação e vencimento); clicar de novo desliga.
  // No Quadro, que não tem situação, os cards não são clicáveis.
  const filtroDoCard = (card: CardDoResumo) => (cardsClicaveis(filtros) ? { ativo: cardAtivo(filtros, card), aoClicar: () => trocar(filtroAoClicarNoCard(filtros, card)) } : {});
  const cards = [
    resumo.aReceber ? <CardDeMetrica key="receber" rotulo={`A receber · até ${ate}`} valor={valorEmReais(resumo.aReceber.valor)} icone={<ArrowDownLeft />} {...filtroDoCard("aReceber")}
      nota={resumo.aReceber.quantidade === 1 ? "1 cobrança em aberto" : `${resumo.aReceber.quantidade} cobranças em aberto`} /> : null,
    resumo.aPagar ? <CardDeMetrica key="pagar" rotulo={`A pagar · até ${ate}`} valor={valorEmReais(resumo.aPagar.valor)} icone={<ArrowUpRight />} {...filtroDoCard("aPagar")}
      nota={`${resumo.aPagar.quantidade === 1 ? "1 conta" : `${resumo.aPagar.quantidade} contas`} · ${resumo.aPagar.paraAprovar} para aprovar`} /> : null,
    resumo.saldoProjetado ? <CardDeMetrica key="saldo" rotulo={`Saldo projetado em ${ate}`} valor={valorEmReais(resumo.saldoProjetado.valor)} icone={<Scale />}
      nota={resumo.saldoProjetado.saldoNasContas ? `${valorEmReais(resumo.saldoProjetado.saldoNasContas)} hoje nas contas (OMIE)` : "a receber menos a pagar no período"} /> : null,
    <CardDeMetrica key="vencidos" rotulo="Vencidos" valor={valorEmReais(resumo.vencidos.valor)} icone={<TriangleAlert />} {...filtroDoCard("vencidos")}
      nota={[resumo.vencidos.aReceber ? `${valorEmReais(resumo.vencidos.aReceber, true)} a receber` : null, resumo.vencidos.aPagar ? `${valorEmReais(resumo.vencidos.aPagar, true)} a pagar` : null].filter(Boolean).join(" · ") || "nada vencido"} />,
  ].filter(Boolean);

  // Nova conta a pagar é de quem alcança as saídas; a cobrança chega com a PLU-337.
  const podeCriarConta = alcance.saidas && opcoes !== null;
  const novaConta = podeCriarConta ? <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Nova conta a pagar</Button> : null;
  const novaContaPresa = podeCriarConta ? <Button size="md" iconOnly icon={<IconPlus />} aria-label="Nova conta a pagar" title="Nova conta a pagar" onClick={() => setCriando(true)} /> : null;

  const situacoes = opcoesDeSituacaoPara(alcance).map((o) => {
    const Icone = ICONE_DA_SITUACAO[o.icone];
    return { value: o.valor, label: o.rotulo, icon: <Icone />, ...(o.grupo ? { grupo: o.grupo } : {}) };
  });
  const empresas = [{ value: "", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: ROTULO_DA_EMPRESA.plugga, icon: <Building2 /> }, { value: "waze", label: ROTULO_DA_EMPRESA.waze, icon: <Building2 /> }];
  const vencimentos = OPCOES_DE_VENCIMENTO.map((o) => ({ value: o.valor, label: o.rotulo, icon: <CalendarDays /> }));

  /** A busca vai na barra e, no celular, também na folha de filtros. */
  const campoDeBusca = (onde: "barra" | "folha") => <form className="equipe-busca" onSubmit={buscar} role="search" aria-label="Buscar lançamentos">
    <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar"><IconSearch className="equipe-busca-icon" /></button>
    <input id={`lancamentos-busca-${onde}`} className="equipe-busca-input" type="search" maxLength={120} aria-label="Buscar cliente, fornecedor ou código" value={busca}
      onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, fornecedor ou código…" />
  </form>;
  // Situação não vale no quadro: as colunas já são a situação.
  const filtrosDaTela: [string, ReactElement][] = [
    ...(filtros.visao === "quadro" ? [] : [["Situação", <FiltroComBusca key="situacao" label="Situação" icon={<Layers />} semFiltro="" value={filtros.situacao ?? ""}
      onChange={(v) => trocar(comSituacao(filtros, v ? (v as FiltrosDosLancamentos["situacao"]) : undefined))} options={situacoes} />] as [string, ReactElement]]),
    ["Empresa", <FiltroComBusca key="empresa" label="Empresa" icon={<Building2 />} semFiltro="" value={filtros.empresa ?? ""}
      onChange={(v) => ir({ empresa: v ? (v as FiltrosDosLancamentos["empresa"]) : undefined })} options={empresas} />],
    ["Vencimento", <FiltroComBusca key="vencimento" label="Vencimento" icon={<CalendarDays />} semFiltro="" value={filtros.vencimento ?? ""}
      onChange={(v) => trocar(comVencimento(filtros, v ? (v as FiltrosDosLancamentos["vencimento"]) : undefined))} options={vencimentos} />],
  ];

  const itens: LancamentoResumo[] = lista?.itens ?? [];
  const semNada = filtros.visao === "quadro" ? (quadro?.colunas.every((c) => c.quantidade === 0) ?? true) : itens.length === 0;
  const vazio = semNada ? <div className={`lista-negocios-vazia ${styles.vazio}`} role="status">
    <div className="lista-negocios-vazia-icone" aria-hidden="true">{filtrado ? <Filter size={22} /> : <Wallet size={22} />}</div>
    <h3 className="lista-negocios-vazia-titulo">{filtrado ? "Nenhum lançamento com esses filtros" : "Nenhum lançamento ainda"}</h3>
    <p className="lista-negocios-vazia-desc">{filtrado
      ? filtros.situacao === "erro" ? "Nada com erro no OMIE. Tudo o que foi aprovado ou gerado chegou ao OMIE." : "Experimente outra busca ou limpe os filtros."
      : "As saídas nascem dos pedidos de compra aprovados ou de uma conta avulsa; as entradas, das cobranças de cada cliente."}</p>
    {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : null}
  </div> : null;

  let conteudo;
  if (vazio) conteudo = vazio;
  else if (filtros.visao === "quadro") conteudo = <QuadroDosLancamentos colunas={quadro?.colunas ?? []} colunasRef={colunasRef} aoAbrir={abrir} />;
  else if (filtros.visao === "lista") conteudo = <ListaDosLancamentos itens={itens} total={lista?.total ?? itens.length} aoAbrir={abrir} />;
  else conteudo = <CardsDosLancamentos itens={itens} hrefDaFicha={hrefDaFicha} aoAbrir={abrir} />;

  return <div className={`${estilosClientes.pagina} ${styles.pagina} ${classeDaPaginaComBarra}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Lançamentos</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Entradas e saídas das duas empresas.</h2>
      </div>
      {novaConta ? <div className={estilosPipelines.acoes}>{novaConta}</div> : null}
    </header>

    {cards.length ? <div className={styles.metricas} role="group" aria-label={`Resumo do caixa${filtros.empresa ? ` da ${ROTULO_DA_EMPRESA[filtros.empresa]}` : ""}`}
      style={{ "--colunas": cards.length } as CSSProperties}>{cards}</div> : null}

    <BarraFixa rotulo="Visualização, busca e filtros dos lançamentos"
      abas={<div ref={abasRef} className={`${estilosPipelines.visoes} ${estilosClientes.abas} ${styles.abas}`} role="tablist" aria-label="Visualização dos lançamentos" onKeyDown={navegarAbas}>
        {visoesDosLancamentos.map((id) => {
          const { rotulo, icone: Icone } = VISOES[id];
          return <button key={id} type="button" id={`lancamentos-visao-${id}`} className="ui-tab" role="tab" aria-selected={filtros.visao === id}
            aria-controls="lancamentos-conteudo" tabIndex={filtros.visao === id ? 0 : -1} onClick={() => trocar(comVisao(filtros, id))}><Icone size={15} aria-hidden="true" />{rotulo}</button>;
        })}
      </div>}
      busca={campoDeBusca("barra")}
      filtros={<div className={styles.filtros} role="group" aria-label="Filtros dos lançamentos">
        {filtrosDaTela.map(([rotulo, filtro]) => <div key={rotulo} className={styles.filtro}>{filtro}</div>)}
        {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
      </div>}
      {...(novaContaPresa ? { acoesQuandoPresa: novaContaPresa } : {})}
      movel={{
        visao: { rotulo: "Visualização", opcoes: visoesDosLancamentos.map((id) => { const { rotulo, icone: Icone } = VISOES[id]; return { value: id, label: rotulo, icon: <Icone /> }; }), valor: filtros.visao, aoMudar: (v) => trocar(comVisao(filtros, v as VisaoDosLancamentos)) },
        filtrosAtivos: quantosFiltros(filtros),
        folha: <>{campoDeBusca("folha")}{filtrosDaTela.map(([rotulo, filtro]) => <CampoDaFolha key={rotulo} rotulo={rotulo}>{filtro}</CampoDaFolha>)}</>,
        rotuloDoResultado: filtros.visao === "quadro" ? "Ver o quadro" : `Ver ${lista?.total === 1 ? "1 lançamento" : `${lista?.total ?? 0} lançamentos`}`,
        ...(filtrado ? { aoLimpar: limpar } : {}),
      }} />
    {filtros.visao === "quadro" ? <BarraRolagemMinimalista containerRef={colunasRef} className={estilosPipelines.rolagem} /> : null}

    {/* A lista para em 300 (LIMITE_DA_LISTA_DE_LANCAMENTOS); a Lista diz isso no rodapé, os Cards aqui. */}
    {filtros.visao === "cards" && lista && lista.total > itens.length
      ? <p className={styles.teto} role="status">Mostrando os {itens.length} primeiros de {lista.total} lançamentos. Use os filtros para ver os demais.</p> : null}

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
    {falhaDaFicha === "nao_encontrada" ? <p className="aviso aviso--alerta" role="status">Lançamento não encontrado. O link pode estar errado ou ele não é de um tipo que você alcança.</p> : null}
    {falhaDaFicha === "indisponivel" ? <p className="aviso aviso--erro" role="alert">Não foi possível abrir o lançamento agora. Tente de novo em instantes.</p> : null}
    {opcoes === null && alcance.saidas ? <p className="aviso aviso--alerta" role="status">Não foi possível carregar as categorias e as contas: criar e editar contas ficam desligados até recarregar a página.</p> : null}

    <section id="lancamentos-conteudo" className={`${estilosClientes.conteudo} ${styles.conteudo}`} role="tabpanel" aria-labelledby={`lancamentos-visao-${filtros.visao}`}>{conteudo}</section>

    {ficha ? <FichaDoLancamento key={ficha.id} lancamento={ficha} opcoes={opcoes} gerente={gerente} aoFechar={fecharFicha} aoAtualizar={() => router.refresh()} /> : null}
    {criando && opcoes ? <ContaAPagarForm opcoes={opcoes} gerente={gerente} aoCancelar={() => setCriando(false)}
      aoSalvar={(novo) => { setCriando(false); setAviso(`${novo.codigo} criada: espera a aprovação da Gerente do Financeiro.`); router.push(hrefDosLancamentos(filtros, novo.id), { scroll: false }); router.refresh(); }} /> : null}
  </div>;
}
