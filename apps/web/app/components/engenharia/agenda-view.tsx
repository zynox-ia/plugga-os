"use client";

import type { AgendaDeCampo, CompanyKey, OpcoesDaEngenhariaResposta, OrdemDeServicoResumo } from "@plugga/shared";
import { Building2, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

import { diaCurtoDaAgenda, diasVisiveis, hrefDaAgenda, iniciaisDoNome, nomeDoDia, osNaSemana, rotuloDaSemana, type FiltrosDaAgenda } from "../../lib/agenda";
import { diaLegivel } from "../../lib/compras";
import { horarioEmManaus, hrefDasOrdens, primeiroNome, ROTULO_DA_SITUACAO, ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { EmpresaComPonto, PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus } from "../ui";
import { AgendarOrdem } from "./agendar-ordem";
import styles from "./agenda.module.css";
import { ConfiguracoesDaEngenharia } from "./configuracoes-da-engenharia";
import { OrdemForm } from "./ordem-form";
import { IconeDoTipo } from "./partes";

/** Um bloco da O.S. na grade: horário, cliente e o tipo (ou "em campo"); atrasada em vermelho. Abre a ficha nas O.S. */
function BlocoDaOrdem({ ordem: o, comTecnico = false }: { ordem: OrdemDeServicoResumo; comTecnico?: boolean }) {
  const segunda = o.situacao === "em_campo" ? "em campo" : ROTULO_DO_TIPO[o.tipo];
  return <Link href={hrefDasOrdens({ visao: "cards" }, o.id)} className={`${styles.bloco} ${o.atrasada ? styles.atrasada : ""}`}
    aria-label={`${o.codigo}: ${o.cliente.nome}, ${o.agendadaPara ? horarioEmManaus(o.agendadaPara) : ""}${o.atrasada ? ", atrasada" : ""}, ${ROTULO_DA_SITUACAO[o.situacao]}`}>
    <span className={styles.hora}><IconeDoTipo tipo={o.tipo} tamanho={13} />{o.agendadaPara ? horarioEmManaus(o.agendadaPara) : "—"}{o.atrasada ? <span className={styles.selo}>atrasada</span> : null}</span>
    <strong>{o.cliente.nome}</strong>
    <small>{comTecnico && o.tecnico ? `${primeiroNome(o.tecnico.nome)} · ` : ""}{segunda}</small>
  </Link>;
}

/**
 * Agenda de campo (PLU-346): a semana dos técnicos, de segunda a sexta (sábado
 * e domingo só com O.S.), e o bloco "Para agendar" com as abertas e as adiadas.
 * Reagendar uma O.S. já agendada é na ficha (Remarcar), com as mesmas regras.
 */
export function AgendaView({ agenda, filtros, opcoes }: { agenda: AgendaDeCampo; filtros: FiltrosDaAgenda; opcoes: OpcoesDaEngenhariaResposta | null }) {
  const router = useRouter();
  const [agendando, setAgendando] = useState<OrdemDeServicoResumo | null>(null);
  const [criando, setCriando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 5000); return () => clearTimeout(t); }, [aviso]);

  const dias = diasVisiveis(agenda);
  const ir = (parcial: Partial<FiltrosDaAgenda>) => router.push(hrefDaAgenda({ ...filtros, ...parcial }), { scroll: false });
  // "Esta semana" só aparece fora da semana de hoje (a API marca o dia de hoje).
  const estaSemana = agenda.dias.some((d) => d.hoje);
  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];
  const linhas = agenda.semTecnico.some((d) => d.ordens.length) ? [...agenda.linhas, { tecnico: null, dias: agenda.semTecnico }] : agenda.linhas;
  const doDia = (dia: string) => linhas.flatMap((l) => (l.dias.find((d) => d.dia === dia)?.ordens ?? []));
  const colunas = { "--dias": dias.length } as CSSProperties;

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Agenda de campo</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>A semana dos técnicos, a partir das O.S. agendadas.</h2>
      </div>
      <div className={`${estilosPipelines.acoes} ${styles.acoes}`}>
        <div className={styles.semana} role="group" aria-label="Semana">
          <Button variant="secondary" iconOnly icon={<ChevronLeft size={18} />} aria-label="Semana anterior" title="Semana anterior" onClick={() => ir({ semana: agenda.semana.anterior })} />
          <span className={styles.rotuloDaSemana}><CalendarDays size={14} aria-hidden="true" />{dias.length ? rotuloDaSemana(dias[0]!.dia, dias.at(-1)!.dia) : rotuloDaSemana(agenda.semana.inicio, agenda.semana.fim)}</span>
          <Button variant="secondary" iconOnly icon={<ChevronRight size={18} />} aria-label="Próxima semana" title="Próxima semana" onClick={() => ir({ semana: agenda.semana.proxima })} />
          {estaSemana ? null : <Button variant="secondary" onClick={() => ir({ semana: undefined })}>Esta semana</Button>}
        </div>
        <div className={styles.filtro}><FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"} onChange={(v) => ir({ empresa: v === "todas" ? undefined : (v as CompanyKey) })} options={empresas} /></div>
        {opcoes ? <div className={styles.filtro}><FiltroComBusca label="Técnico" icon={<UserRound />} semFiltro="todos" value={filtros.tecnicoId ?? "todos"} onChange={(v) => ir({ tecnicoId: v === "todos" ? undefined : v })}
          options={[{ value: "todos", label: "Todos os técnicos", icon: <UserRound /> }, ...opcoes.tecnicos.map((t) => ({ value: t.id, label: t.nome, icon: <UserRound /> }))]} /></div> : null}
        <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Nova O.S.</Button>
        <Button variant="secondary" iconOnly icon={<Settings size={18} />} aria-label="Configurações da Engenharia" title="Configurações da Engenharia" onClick={() => setConfigurando(true)} />
      </div>
    </header>

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}

    {/* A grade técnico × dia; no celular, um cartão por dia. */}
    <div className={styles.grade} role="table" aria-label={`Agenda da semana por técnico, ${dias.length ? rotuloDaSemana(dias[0]!.dia, dias.at(-1)!.dia) : ""}`} style={colunas}>
      <div className={styles.linhaDaGrade} role="row">
        <div className={styles.cabecaTecnico} role="columnheader">Técnico</div>
        {dias.map((d) => <div key={d.dia} className={`${styles.cabecaDia} ${d.hoje ? styles.hoje : ""}`} role="columnheader">
          <span>{nomeDoDia(d.dia)}</span><small>{diaCurtoDaAgenda(d.dia)}{d.hoje ? " · hoje" : ""}</small>
        </div>)}
      </div>
      {linhas.length === 0 ? <p className={styles.vazio} role="status">Nenhum técnico da Engenharia ainda.</p> : linhas.map((l) => <div key={l.tecnico?.id ?? "sem-tecnico"} className={styles.linhaDaGrade} role="row">
        <div className={styles.tecnico} role="rowheader">
          <span className={styles.avatar} aria-hidden="true">{l.tecnico ? iniciaisDoNome(l.tecnico.nome) : "?"}</span>
          <span><strong>{l.tecnico?.nome ?? "Sem técnico"}</strong><small>{osNaSemana(l)} O.S. na semana</small></span>
        </div>
        {dias.map((d) => {
          const ordens = l.dias.find((x) => x.dia === d.dia)?.ordens ?? [];
          return <div key={d.dia} className={`${styles.celula} ${d.hoje ? styles.hoje : ""}`} role="cell" aria-label={`${l.tecnico?.nome ?? "Sem técnico"}, ${nomeDoDia(d.dia)} ${diaCurtoDaAgenda(d.dia)}: ${ordens.length ? `${ordens.length} O.S.` : "livre"}`}>
            {ordens.map((o) => <BlocoDaOrdem key={o.id} ordem={o} />)}
          </div>;
        })}
      </div>)}
    </div>

    <div className={styles.porDia}>
      {dias.map((d) => { const ordens = doDia(d.dia); return <section key={d.dia} className={`${styles.cartaoDoDia} ${d.hoje ? styles.hoje : ""}`} aria-label={`${nomeDoDia(d.dia)}, ${diaCurtoDaAgenda(d.dia)}`}>
        <h3>{nomeDoDia(d.dia)}<small>{diaCurtoDaAgenda(d.dia)}{d.hoje ? " · hoje" : ""}</small></h3>
        {ordens.length ? ordens.map((o) => <BlocoDaOrdem key={o.id} ordem={o} comTecnico />) : <p className={styles.muted}>Sem O.S.</p>}
      </section>; })}
    </div>

    <section className={styles.paraAgendar} aria-label="Para agendar">
      <header><h2><CalendarDays size={16} aria-hidden="true" />Para agendar</h2>
        <p>{agenda.paraAgendar.length ? `${agenda.paraAgendar.length} O.S. abertas e adiadas, do prazo mais curto ao mais longo` : "Tudo agendado."}</p></header>
      {agenda.paraAgendar.length ? <ul>{agenda.paraAgendar.map((o) => <li key={o.id}>
        <Link href={hrefDasOrdens({ visao: "cards" }, o.id)} className={styles.linhaParaAgendar}>
          <span className={styles.caixa} aria-hidden="true"><IconeDoTipo tipo={o.tipo} tamanho={16} /></span>
          <span className={styles.texto}><strong>{o.cliente.nome} · {ROTULO_DO_TIPO[o.tipo]}</strong><small>{o.codigo} · {o.tecnico ? primeiroNome(o.tecnico.nome) : "sem técnico"} · <EmpresaComPonto empresa={o.empresa} /></small></span>
          <span className={`${styles.prazo} ${o.atrasada ? styles.vermelho : ""}`}>{o.situacao === "adiada" && o.novaData ? `adiada para ${diaLegivel(o.novaData).slice(0, 5)}` : `prazo ${diaCurtoDaAgenda(o.prazo)}`}</span>
        </Link>
        <Button variant="secondary" size="sm" icon={<CalendarCheck size={14} />} onClick={() => setAgendando(o)} aria-label={`Agendar ${o.codigo}`}>Agendar</Button>
      </li>)}</ul> : null}
    </section>

    {agendando ? <AgendarOrdem ordem={agendando} opcoes={opcoes} hoje={agenda.hoje} aoCancelar={() => setAgendando(null)}
      aoAgendar={(codigo) => { setAgendando(null); setAviso(`${codigo} agendada.`); router.refresh(); }} /> : null}
    {criando ? <OrdemForm empresaInicial={filtros.empresa} hoje={agenda.hoje} prazoSugerido={opcoes?.prazoSugerido} aoCancelar={() => setCriando(false)}
      aoSalvar={(o) => { setCriando(false); setAviso(`${o.codigo} criada: falta agendar.`); router.refresh(); }} /> : null}
    {configurando ? <ConfiguracoesDaEngenharia opcoes={opcoes} aoFechar={() => setConfigurando(false)} /> : null}
  </div>;
}
