"use client";

import type { CompanyKey, ContaCorrente, Lancamento, LancamentoResumo, ListarLancamentosResposta, ListarTarefasResposta, OpcoesDoFinanceiro, ResumoDosLancamentos } from "@plugga/shared";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, CalendarCheck, CalendarDays, Clock, Landmark, Receipt, Scale, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { hrefDaConciliacao, periodoDoMes, ROTA_CONCILIACAO } from "../../lib/conciliacao";
import { contasDaTela, saldoDaConta } from "../../lib/configuracoes-do-financeiro";
import { ROTULO_DA_EMPRESA, valorCurto, valorEmReais } from "../../lib/compras";
import { FILTRO_DO_CARD, hrefDaVisaoGeralDoFinanceiro, hrefDosLancamentos, competenciaLegivel } from "../../lib/financeiro";
import { horarioEmManaus } from "../../lib/ordens-de-servico";
import { hrefDeTarefas } from "../../lib/tarefas";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { CardDeMetrica, MetricasDoTopo } from "../suprimentos/card-de-metrica";
import { EmpresaComPonto, PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus } from "../ui";
import { NovaCobranca } from "./cobranca-e-comprovantes";
import { ContaAPagarForm } from "./conta-a-pagar-form";
import { EngrenagemDoFinanceiro } from "./engrenagem-do-financeiro";
import styles from "./financeiro-telas.module.css";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"] as const;
const POR_GRUPO = 3;

/** "2026-11-26" → "Quinta, 26 de novembro". O dia chega do servidor, no fuso de Manaus. */
function dataPorExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number) as [number, number, number];
  const semana = DIAS[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()] ?? "";
  return `${semana}, ${dia} de ${MESES[mes - 1]}`;
}

/** "2026-11-30" → "30/11". */
const diaEMes = (dia: string) => dia.slice(5, 10).split("-").reverse().join("/");

function tituloDoItem(l: LancamentoResumo): string {
  const base = l.descricao.trim() || l.favorecido.nome;
  if (l.tipo !== "entrada" || !l.competencia) return base;
  const competencia = competenciaLegivel(l.competencia);
  return base.toLocaleLowerCase("pt-BR").includes(competencia) ? base : `${base} · ${competencia}`;
}

/** O selo do print: feminino, porque a frase fala da conta ou da cobrança. */
function seloDoItem(l: LancamentoResumo): { texto: string; tom: "perigo" | "alerta" | "neutro" } | null {
  if (!l.prazo) return null;
  const n = Math.abs(l.prazo.dias);
  const dias = `${n} ${n === 1 ? "dia" : "dias"}`;
  if (l.prazo.situacao === "vencido") {
    const atraso = `vencida há ${dias}`;
    return { texto: l.emCobranca ? `Em cobrança · ${atraso}` : atraso, tom: "perigo" };
  }
  if (l.prazo.situacao === "vence_hoje") return { texto: "Vence hoje", tom: "alerta" };
  if (l.prazo.dias === 1) return { texto: "Vence amanhã", tom: "neutro" };
  return { texto: `Vence em ${dias}`, tom: "neutro" };
}

function valorComSinal(l: Pick<LancamentoResumo, "tipo" | "valor">): string {
  const valor = valorEmReais(l.valor) ?? "—";
  return l.tipo === "saida" ? `− ${valor}` : `+ ${valor}`;
}

/** Saída: o fornecedor. Cobrança: a quantidade de UCs, como no print ("1 UC"). */
function complementoDoItem(l: LancamentoResumo): string {
  if (l.tipo !== "entrada") return l.favorecido.nome;
  const n = l.quantidadeDeUcs ?? 0;
  return `${n} ${n === 1 ? "UC" : "UCs"}`;
}

function nomeDaConta(conta: ContaCorrente): string {
  const curta = conta.empresa === "waze" ? "Waze" : "Plugga";
  const nome = conta.nome.trim();
  return nome.toLocaleLowerCase("pt-BR").includes(curta.toLocaleLowerCase("pt-BR")) ? nome : `${nome} · ${curta}`;
}

function centavos(valor: string): number {
  const negativo = valor.trim().startsWith("-");
  const [inteiro = "0", fracao = "0"] = valor.trim().replace("-", "").split(".");
  const n = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0").slice(0, 2));
  return negativo ? -n : n;
}

function deCentavos(total: number): string {
  const abs = Math.abs(total);
  return `${total < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

function Bloco({ titulo, icone, sub, link, children }: { titulo: string; icone: ReactNode; sub: string; link?: { href: string; rotulo: string }; children: ReactNode }) {
  return <section className={styles.bloco} aria-label={titulo}>
    <header className={styles.blocoTopo}>
      <div><h2>{icone}{titulo}</h2><p>{sub}</p></div>
      {link ? <Link href={link.href} className={styles.blocoLink}>{link.rotulo}<ArrowRight size={14} aria-hidden="true" /></Link> : null}
    </header>
    {children}
  </section>;
}

function NovoLancamento({ podeConta, podeCobranca, aoConta, aoCobranca }: {
  podeConta: boolean; podeCobranca: boolean; aoConta: () => void; aoCobranca: () => void;
}) {
  const menuId = useId();
  const [aberto, setAberto] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const ambos = podeConta && podeCobranca;
  useEffect(() => {
    if (!aberto) return;
    menu.current?.querySelector("button")?.focus();
    const fora = (evento: PointerEvent) => { if (!root.current?.contains(evento.target as Node)) setAberto(false); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);
  if (!podeConta && !podeCobranca) return null;
  if (!ambos) return <Button icon={<IconPlus />} onClick={podeConta ? aoConta : aoCobranca}>Novo lançamento</Button>;
  const fechar = (acao: () => void) => { setAberto(false); acao(); };
  return <div ref={root} className={styles.novo} onBlur={(evento) => { if (!evento.currentTarget.contains(evento.relatedTarget)) setAberto(false); }}>
    <Button icon={<IconPlus />} aria-haspopup="menu" aria-expanded={aberto} aria-controls={aberto ? menuId : undefined} onClick={() => setAberto((valor) => !valor)}
      onKeyDown={(evento) => { if (evento.key === "ArrowDown" || evento.key === "ArrowUp") { evento.preventDefault(); setAberto(true); } }}>
      Novo lançamento
    </Button>
    {aberto ? <div id={menuId} ref={menu} role="menu" aria-label="Novo lançamento" className={styles.novoMenu}
      onKeyDown={(evento) => {
        const botoes = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const atual = botoes.indexOf(document.activeElement as HTMLButtonElement);
        if (evento.key === "Escape") { evento.preventDefault(); setAberto(false); root.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus(); return; }
        if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp" && evento.key !== "Home" && evento.key !== "End") return;
        evento.preventDefault();
        const proximo = evento.key === "Home" ? 0 : evento.key === "End" ? botoes.length - 1 : evento.key === "ArrowDown" ? (atual + 1) % botoes.length : (atual - 1 + botoes.length) % botoes.length;
        botoes[proximo]?.focus();
      }}>
      <button type="button" role="menuitem" onClick={() => fechar(aoConta)}><ArrowUpRight size={16} aria-hidden="true" />Nova conta a pagar</button>
      <button type="button" role="menuitem" onClick={() => fechar(aoCobranca)}><Receipt size={16} aria-hidden="true" />Nova cobrança</button>
    </div> : null}
  </div>;
}

function LinhaDoVencimento({ lancamento, empresa, vencimento }: { lancamento: LancamentoResumo; empresa?: CompanyKey; vencimento: "vencidos" | "hoje" | "7" }) {
  const selo = seloDoItem(lancamento);
  const vencido = selo?.tom === "perigo";
  const Icone = lancamento.tipo === "saida" ? ArrowUpRight : ArrowDownLeft;
  return <li>
    <Link href={hrefDosLancamentos({ vencimento, ...(empresa ? { empresa } : {}) }, lancamento.id)} className={`${styles.linha} ${vencido ? styles.linhaVencida : ""}`}>
      <span className={`${styles.marca} ${vencido ? styles.marcaPerigo : ""}`} aria-hidden="true"><Icone size={16} /></span>
      <span className={styles.texto}>
        <strong>{tituloDoItem(lancamento)}</strong>
        <small>{lancamento.codigo} · {complementoDoItem(lancamento)} · <EmpresaComPonto empresa={lancamento.empresa} /></small>
      </span>
      <span className={styles.lado}>
        <strong>{valorComSinal(lancamento)}</strong>
        {selo ? <span className={`${styles.selo} ${selo.tom === "perigo" ? styles.seloPerigo : selo.tom === "alerta" ? styles.seloAlerta : styles.seloNeutro}`}>{selo.tom === "perigo" ? <TriangleAlert size={12} aria-hidden="true" /> : <Clock size={12} aria-hidden="true" />}{selo.texto}</span> : null}
      </span>
    </Link>
  </li>;
}

function Grupo({ titulo, total, vazio, children }: { titulo: string; total: number | null; vazio: string; children: ReactNode }) {
  return <section className={styles.grupoSecao} aria-label={titulo}>
    <h3 className={styles.grupo}><span>{titulo}</span>{total !== null ? <span>{total}</span> : null}</h3>
    {children ?? <p className={styles.vazioGrupo}>{vazio}</p>}
  </section>;
}

/**
 * Visão geral do Financeiro no formato aprovado em 23/11: caixa até o fim do mês,
 * vencimentos por urgência, saldo das contas e rotinas de hoje. Os números vêm
 * das mesmas APIs de Lançamentos e Tarefas.
 */
export function VisaoGeralDoFinanceiroView({ hoje, empresa, resumo, alcance, gerente, opcoes, tarefas, vencidos, deHoje, proximos, abreConciliacao }: {
  hoje: string;
  empresa?: CompanyKey;
  resumo: ResumoDosLancamentos;
  alcance: { saidas: boolean; entradas: boolean };
  gerente: boolean;
  opcoes: OpcoesDoFinanceiro | null;
  tarefas: ListarTarefasResposta | null;
  vencidos: ListarLancamentosResposta | null;
  deHoje: ListarLancamentosResposta | null;
  /** Filtro `7`: de hoje até hoje + 7. A tela tira o que vence hoje para o grupo "Próximos 7 dias". */
  proximos: ListarLancamentosResposta | null;
  abreConciliacao: boolean;
}) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 5000); return () => clearTimeout(t); }, [aviso]);

  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];
  const comEmpresa = (parcial: Parameters<typeof hrefDosLancamentos>[0]) => hrefDosLancamentos({ ...parcial, ...(empresa ? { empresa } : {}) });
  const contas = opcoes ? contasDaTela(opcoes, empresa ?? null).filter((conta) => conta.ativa) : [];
  const comSaldo = contas.filter((conta) => conta.saldoCalculado);
  const totalDasContas = comSaldo.length ? deCentavos(comSaldo.reduce((soma, conta) => soma + centavos(conta.saldoCalculado!), 0)) : null;
  const periodo = periodoDoMes(hoje);
  const ate = diaEMes(resumo.ate);
  const itensDeHoje = deHoje?.itens.slice(0, POR_GRUPO) ?? [];
  const itensProximos = proximos?.itens.filter((item) => item.vencimento !== hoje).slice(0, POR_GRUPO) ?? [];
  const totalProximos = proximos && deHoje ? Math.max(0, proximos.total - deHoje.total) : null;
  const rotinas = tarefas?.itens.slice(0, 6) ?? [];
  const progresso = tarefas?.progresso;
  const hrefTarefas = hrefDeTarefas("/financeiro/tarefas", empresa ? { empresa } : {});
  const hrefContas = abreConciliacao ? (empresa ? `${ROTA_CONCILIACAO}?empresa=${empresa}` : ROTA_CONCILIACAO) : comEmpresa({});
  const semSaldoInicial = resumo.saldoProjetado?.contasSemSaldoInicial ?? 0;
  const subtitulo = empresa ? `Caixa, vencimentos e rotinas da ${ROTULO_DA_EMPRESA[empresa]}.` : "Caixa, vencimentos e rotinas das duas empresas.";
  const podeConta = alcance.saidas && opcoes !== null;
  const podeCobranca = alcance.entradas && opcoes !== null;

  const salvo = (novo: Lancamento, texto: string) => { setCriando(false); setCobrando(false); setAviso(texto); router.refresh(); };

  return <div className={`${estilosClientes.pagina} ${styles.pagina} ${styles.visao}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Visão geral</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>{subtitulo}</h2>
      </div>
      <div className={`${estilosPipelines.acoes} ${styles.acoes}`}>
        <time dateTime={hoje} className={styles.data}><CalendarDays size={16} aria-hidden="true" />{dataPorExtenso(hoje)}</time>
        <div className={styles.filtroEmpresa}>
          <FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={empresa ?? "todas"} onChange={(valor) => router.push(hrefDaVisaoGeralDoFinanceiro(valor === "todas" ? undefined : valor as CompanyKey))} options={empresas} />
        </div>
        <NovoLancamento podeConta={podeConta} podeCobranca={podeCobranca} aoConta={() => setCriando(true)} aoCobranca={() => setCobrando(true)} />
        {opcoes ? <EngrenagemDoFinanceiro opcoes={opcoes} /> : null}
      </div>
    </header>

    <MetricasDoTopo rotulo="Caixa do Financeiro">
      {resumo.aReceber ? <CardDeMetrica rotulo={`A receber · até ${ate}`} valor={valorEmReais(resumo.aReceber.valor)} icone={<ArrowDownLeft />} aoClicar={() => router.push(comEmpresa(FILTRO_DO_CARD.aReceber))}
        nota={resumo.aReceber.quantidade === 1 ? "1 cobrança em aberto" : `${resumo.aReceber.quantidade} cobranças em aberto`} /> : null}
      {resumo.aPagar ? <CardDeMetrica rotulo={`A pagar · até ${ate}`} valor={valorEmReais(resumo.aPagar.valor)} icone={<ArrowUpRight />} aoClicar={() => router.push(comEmpresa(FILTRO_DO_CARD.aPagar))}
        nota={`${resumo.aPagar.quantidade === 1 ? "1 conta" : `${resumo.aPagar.quantidade} contas`} · ${resumo.aPagar.paraAprovar} para aprovar`} /> : null}
      {resumo.saldoProjetado ? <CardDeMetrica rotulo={`Saldo projetado em ${ate}`} valor={valorEmReais(resumo.saldoProjetado.valor)} icone={<Scale />} barra={100}
        nota={resumo.saldoProjetado.saldoNasContas ? `${valorCurto(resumo.saldoProjetado.saldoNasContas)} hoje nas contas` : "a receber menos a pagar no período"}
        aoClicar={abreConciliacao ? () => router.push(hrefDaConciliacao({ ...periodo, aba: "sugeridos", ...(empresa ? { empresa } : {}) })) : undefined} /> : null}
      <CardDeMetrica rotulo="Vencidos" valor={valorEmReais(resumo.vencidos.valor)} icone={<TriangleAlert />} aoClicar={() => router.push(comEmpresa(FILTRO_DO_CARD.vencidos))}
        nota={[resumo.vencidos.aReceber ? `${valorEmReais(resumo.vencidos.aReceber, true)} a receber` : null, resumo.vencidos.aPagar ? `${valorEmReais(resumo.vencidos.aPagar, true)} a pagar` : null].filter(Boolean).join(" · ") || "nada vencido"} />
    </MetricasDoTopo>

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
    {opcoes === null && (alcance.saidas || alcance.entradas) ? <p className="aviso aviso--alerta" role="status">Não foi possível carregar as categorias e as contas: criar lançamento fica desligado até recarregar a página.</p> : null}

    <div className={styles.blocos}>
      <Bloco titulo="Vencimentos" icone={<CalendarDays size={16} aria-hidden="true" />} sub="Em aberto, do mais urgente para o mais distante." link={{ href: comEmpresa({ visao: "lista" }), rotulo: "Ver todos" }}>
        <div className={styles.grupos}>
          <Grupo titulo="Vencidos" total={vencidos?.total ?? null} vazio={vencidos ? "Nada vencido." : "Não foi possível ler os vencidos."}>
            {vencidos && vencidos.itens.length ? <ul className={styles.lista}>{vencidos.itens.slice(0, POR_GRUPO).map((lancamento) => <LinhaDoVencimento key={lancamento.id} lancamento={lancamento} empresa={empresa} vencimento="vencidos" />)}</ul> : null}
          </Grupo>
          <Grupo titulo="Hoje" total={deHoje?.total ?? null} vazio={deHoje ? "Nada vence hoje." : "Não foi possível ler o que vence hoje."}>
            {itensDeHoje.length ? <ul className={styles.lista}>{itensDeHoje.map((lancamento) => <LinhaDoVencimento key={lancamento.id} lancamento={lancamento} empresa={empresa} vencimento="hoje" />)}</ul> : null}
          </Grupo>
          <Grupo titulo="Próximos 7 dias" total={totalProximos} vazio={proximos ? "Nada nos próximos 7 dias." : "Não foi possível ler os próximos dias."}>
            {itensProximos.length ? <ul className={styles.lista}>{itensProximos.map((lancamento) => <LinhaDoVencimento key={lancamento.id} lancamento={lancamento} empresa={empresa} vencimento="7" />)}</ul>
              : totalProximos ? <p className={styles.vazioGrupo}>Há vencimentos neste prazo. Use Ver todos para abrir a lista.</p> : null}
          </Grupo>
        </div>
      </Bloco>

      <div className={styles.coluna}>
        <Bloco titulo="Saldo nas contas" icone={<Landmark size={16} aria-hidden="true" />}
          sub={semSaldoInicial ? `Saldo calculado no Plugga OS. ${semSaldoInicial === 1 ? "1 conta ativa ainda sem saldo inicial." : `${semSaldoInicial} contas ativas ainda sem saldo inicial.`}` : "Saldo calculado no Plugga OS."}
          link={{ href: hrefContas, rotulo: "Contas" }}>
          {opcoes === null ? <p className={styles.vazioGrupo}>Não foi possível ler as contas.</p> : contas.length === 0 ? <p className={styles.vazioGrupo}>Nenhuma conta ativa.</p> : <ul className={styles.lista}>{contas.map((conta) => {
            const saldo = saldoDaConta(conta);
            const href = abreConciliacao ? hrefDaConciliacao({ ...periodo, aba: "sugeridos", empresa: conta.empresa, conta: conta.id }) : undefined;
            const corpo = <>
              <span className={styles.marca} aria-hidden="true"><Landmark size={15} /></span>
              <span className={styles.texto}><strong>{nomeDaConta(conta)}</strong>{saldo.valor ? null : <small>{saldo.nota}</small>}</span>
              <span className={styles.lado}><strong>{saldo.valor ? valorEmReais(saldo.valor) : "—"}</strong></span>
            </>;
            return <li key={conta.id}>{href ? <Link href={href} className={`${styles.linha} ${styles.linhaSimples}`}>{corpo}</Link> : <div className={`${styles.linha} ${styles.linhaSimples}`}>{corpo}</div>}</li>;
          })}</ul>}
          {contas.length ? <p className={styles.total}><span>Total{totalDasContas && comSaldo.length < contas.length ? <small>só as contas com saldo calculado</small> : null}</span><strong>{totalDasContas ? valorEmReais(totalDasContas) : "—"}</strong></p> : null}
        </Bloco>

        <Bloco titulo="Rotinas de hoje" icone={<CalendarCheck size={16} aria-hidden="true" />}
          sub={tarefas ? (progresso && progresso.total ? `${progresso.concluidas} de ${progresso.total} concluídas` : "Nenhuma rotina para hoje.") : "Não foi possível ler as rotinas."}
          link={{ href: hrefTarefas, rotulo: "Abrir" }}>
          {progresso && progresso.total ? <div className={styles.progresso}>
            <span className={styles.trilho} aria-hidden="true"><span style={{ inlineSize: `${Math.round((progresso.concluidas / progresso.total) * 100)}%` }} /></span>
          </div> : null}
          {rotinas.length ? <ul className={styles.lista}>{rotinas.map((tarefa) => <li key={tarefa.id}>
            <Link href={hrefTarefas} className={`${styles.linha} ${styles.linhaSimples}`}>
              <span className={styles.marca} aria-hidden="true"><Clock size={15} /></span>
              <span className={styles.texto}><strong>{tarefa.titulo}</strong></span>
              <span className={styles.lado}><small>{primeiroNome(tarefa.responsavel.nome)} · {horarioEmManaus(tarefa.prazoEm)}</small></span>
            </Link>
          </li>)}</ul> : null}
        </Bloco>
      </div>
    </div>

    {criando && opcoes ? <ContaAPagarForm opcoes={opcoes} gerente={gerente} aoCancelar={() => setCriando(false)}
      aoSalvar={(novo) => salvo(novo, `${novo.codigo} criada: espera a aprovação da Gerente do Financeiro.`)} /> : null}
    {cobrando && opcoes ? <NovaCobranca opcoes={opcoes} aoCancelar={() => setCobrando(false)}
      aoSalvar={(novo) => salvo(novo, `${novo.codigo} criada.`)}
      aoAbrirExistente={(id) => { setCobrando(false); router.push(hrefDosLancamentos(empresa ? { empresa } : {}, id)); }} /> : null}
  </div>;
}
