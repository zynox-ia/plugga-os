"use client";

import type { CompanyKey, ListarProtocolosResposta, OpcoesDaEngenhariaResposta, OrdemDeServicoResumo, VisaoGeralDaEngenharia } from "@plugga/shared";
import { Activity, ArrowRight, Building2, CalendarCheck, CalendarDays, Clock, FileCheck, HardHat, Settings, TriangleAlert, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { diaPorExtenso, notaDasAtrasadas, notaDoCampoHoje, ROTA_VISAO_GERAL_DA_ENGENHARIA } from "../../lib/engenharia";
import { agendaDaOrdem, hrefDasOrdens, quandoNaFicha, ROTULO_DO_TIPO, textoDoAtraso } from "../../lib/ordens-de-servico";
import { hrefDosProtocolos, prazoDoProtocolo, ROTULO_DA_SITUACAO_DO_PROTOCOLO, ROTULO_DO_TIPO_DE_PROTOCOLO, textoDaVerificacao } from "../../lib/protocolos";
import { prazoDaOcorrencia } from "../../lib/tarefas";
import { hrefDasUsinas } from "../../lib/usinas";
import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { CardDeMetrica } from "../suprimentos/card-de-metrica";
import { EmpresaComPonto, PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus } from "../ui";
import { ConfiguracoesDaEngenharia } from "./configuracoes-da-engenharia";
import styles from "./engenharia.module.css";
import { OrdemForm } from "./ordem-form";
import { IconeDoTipo, SeloDaEtapa } from "./partes";

/** "Solarman, Solax"; a empresa só entra quando a mesma plataforma está pendente nas duas. */
function textoDasPendentes(pendentes: readonly { plataforma: string; empresa: CompanyKey }[]): string {
  const repetidas = new Set(pendentes.filter((p, i) => pendentes.findIndex((x) => x.plataforma === p.plataforma) !== i).map((p) => p.plataforma));
  return pendentes.map((p) => (repetidas.has(p.plataforma) ? `${p.plataforma} (${ROTULO_DA_EMPRESA[p.empresa].split(" ")[0]})` : p.plataforma)).join(", ");
}

/** Um bloco da Visão geral: título com ícone, subtítulo, o link de "ver tudo" e a lista. */
function Bloco({ icone, titulo, sub, link, children }: { icone: ReactNode; titulo: string; sub: string; link?: { href: string; rotulo: string }; children: ReactNode }) {
  return <section className={styles.bloco} aria-label={titulo}>
    <header className={styles.blocoTopo}>
      <div><h2>{icone}{titulo}</h2><p>{sub}</p></div>
      {link ? <Link href={link.href} className={styles.blocoLink}>{link.rotulo}<ArrowRight size={14} aria-hidden="true" /></Link> : null}
    </header>
    {children}
  </section>;
}

/** Uma O.S. nos blocos: cliente e tipo, código, técnico e empresa; à direita, o horário ou o atraso e a etapa. */
function LinhaDeOrdem({ ordem: o, hoje, atrasada = false }: { ordem: OrdemDeServicoResumo; hoje: string; atrasada?: boolean }) {
  const agenda = agendaDaOrdem(o, hoje);
  const quando = atrasada ? textoDoAtraso(o.agendadaPara ? o.agendadaPara.slice(0, 10) < o.prazo ? o.agendadaPara.slice(0, 10) : o.prazo : o.prazo, hoje) : o.agendadaPara ? quandoNaFicha(o.agendadaPara, hoje) : agenda.dia;
  return <li>
    <Link href={hrefDasOrdens({ visao: "cards" }, o.id)} className={styles.linhaDoBloco}>
      <span className={styles.caixaPequena} aria-hidden="true"><IconeDoTipo tipo={o.tipo} tamanho={16} /></span>
      <span className={styles.textoDaLinha}>
        <strong>{o.cliente.nome} · {ROTULO_DO_TIPO[o.tipo]}</strong>
        <small>{o.codigo} · {o.tecnico?.nome ?? "Sem técnico"} · <EmpresaComPonto empresa={o.empresa} /></small>
      </span>
      <span className={styles.ladoDaLinha}>
        <span className={atrasada ? styles.atraso : undefined}>{quando}</span>
        <SeloDaEtapa situacao={o.situacao} />
      </span>
    </Link>
  </li>;
}

/**
 * Visão geral da Engenharia (PLU-349): o dia em metric cards (que abrem as O.S.
 * filtradas), o campo de hoje, as atrasadas e as tarefas de hoje. O monitoramento
 * e os protocolos entram com as Usinas (PLU-347) e os Protocolos (PLU-348); o bloco de
 * protocolos só para quem tem a tela (`protocolos` nulo, sem bloco).
 */
export function VisaoGeralDaEngenhariaView({ dados, empresa, opcoes, protocolos }: { dados: VisaoGeralDaEngenharia; empresa?: CompanyKey; opcoes: OpcoesDaEngenhariaResposta | null; protocolos: ListarProtocolosResposta | null }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const { hoje, metricas: m } = dados;
  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];
  const abrirOrdens = (situacao: "em_andamento" | "atrasadas" | "em_campo_hoje") => router.push(hrefDasOrdens({ visao: "cards", situacao, ...(empresa ? { empresa } : {}) }));
  const t = dados.tarefasHoje;
  const mon = dados.monitoramentoHoje;

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Visão geral</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>O dia da Engenharia: campo, atrasos e tarefas.</h2>
      </div>
      <div className={`${estilosPipelines.acoes} ${styles.acoesDaVisao}`}>
        <span className={styles.data}><CalendarDays size={15} aria-hidden="true" />{diaPorExtenso(hoje)}</span>
        <div className={styles.filtroDaVisao}><FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={empresa ?? "todas"} onChange={(v) => router.push(v === "todas" ? ROTA_VISAO_GERAL_DA_ENGENHARIA : `${ROTA_VISAO_GERAL_DA_ENGENHARIA}?empresa=${v}`)} options={empresas} /></div>
        <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Nova O.S.</Button>
        <Button variant="secondary" iconOnly icon={<Settings size={18} />} aria-label="Configurações da Engenharia" title="Configurações da Engenharia" onClick={() => setConfigurando(true)} />
      </div>
    </header>

    <div className={styles.metricasDaVisao} role="group" aria-label="O dia da Engenharia">
      <CardDeMetrica rotulo="O.S. em aberto" valor={m.emAberto} icone={<Wrench />} nota="em andamento, de aberta a colher assinatura" aoClicar={() => abrirOrdens("em_andamento")} />
      <CardDeMetrica rotulo="Atrasadas" valor={m.atrasadas} icone={<TriangleAlert />} nota={notaDasAtrasadas(dados.atrasadas.total, dados.atrasadas.itens, hoje)} aoClicar={() => abrirOrdens("atrasadas")} />
      <CardDeMetrica rotulo="Em campo hoje" valor={m.emCampoHoje} icone={<HardHat />} nota={notaDoCampoHoje(dados.campoHoje)} aoClicar={() => abrirOrdens("em_campo_hoje")} />
      {m.usinasComAtencao !== null ? <CardDeMetrica rotulo="Usinas com atenção" valor={m.usinasComAtencao} icone={<Activity />}
        nota={!mon || mon.total === 0 ? "nenhuma usina no monitoramento" : mon.total - mon.conferidas ? `${mon.total - mon.conferidas} ${mon.total - mon.conferidas === 1 ? "plataforma" : "plataformas"} por conferir hoje` : "monitoramento de hoje completo"}
        aoClicar={() => router.push(hrefDasUsinas({ aba: "cadastro", atencao: true, ...(empresa ? { empresa } : {}) }))} /> : null}
    </div>

    <div className={styles.blocos}>
      <div className={styles.colunaDeBlocos}>
        <Bloco icone={<HardHat size={16} aria-hidden="true" />} titulo="Campo hoje" sub={dados.campoHoje.length ? `${dados.campoHoje.length} O.S. com técnico em campo ou agendada para hoje` : "Ninguém em campo hoje."}
          link={{ href: hrefDasOrdens({ visao: "cards", situacao: "em_campo_hoje" }), rotulo: "Ver no O.S." }}>
          {dados.campoHoje.length ? <ul className={styles.listaDoBloco}>{dados.campoHoje.map((o) => <LinhaDeOrdem key={o.id} ordem={o} hoje={hoje} />)}</ul> : null}
        </Bloco>
        <Bloco icone={<TriangleAlert size={16} aria-hidden="true" />} titulo="Atrasadas" sub={dados.atrasadas.total ? "Passaram do prazo sem concluir. A mais antiga primeiro." : "Nada atrasado."}
          link={dados.atrasadas.total ? { href: hrefDasOrdens({ visao: "lista", situacao: "atrasadas" }), rotulo: `Ver todas (${dados.atrasadas.total})` } : undefined}>
          {dados.atrasadas.itens.length ? <ul className={styles.listaDoBloco}>{dados.atrasadas.itens.map((o) => <LinhaDeOrdem key={o.id} ordem={o} hoje={hoje} atrasada />)}</ul> : null}
        </Bloco>
      </div>
      <div className={styles.colunaDeBlocos}>
        {mon ? <Bloco icone={<Activity size={16} aria-hidden="true" />} titulo="Monitoramento de hoje" sub={mon.total ? `${mon.conferidas} de ${mon.total} ${mon.total === 1 ? "plataforma conferida" : "plataformas conferidas"}` : "Nenhuma usina cadastrada para conferir."}
          link={{ href: hrefDasUsinas({ aba: "monitoramento", ...(empresa ? { empresa } : {}) }), rotulo: mon.pendentes.length ? "Conferir" : "Abrir" }}>
          {mon.total ? <div className={styles.progressoDoBloco} role="progressbar" aria-label="Plataformas conferidas hoje" aria-valuemin={0} aria-valuemax={mon.total} aria-valuenow={mon.conferidas}><span style={{ width: `${(mon.conferidas / mon.total) * 100}%` }} /></div> : null}
          {mon.pendentes.length ? <p className={styles.faltaConferir}><Clock size={14} aria-hidden="true" />Falta conferir: {textoDasPendentes(mon.pendentes)}</p> : null}
        </Bloco> : null}
        <Bloco icone={<CalendarCheck size={16} aria-hidden="true" />} titulo="Tarefas de hoje" sub={t.total ? `${t.concluidas} de ${t.total} ${t.total === 1 ? "concluída" : "concluídas"}` : "Nenhuma tarefa para hoje."}
          link={{ href: "/engenharia/tarefas", rotulo: "Abrir" }}>
          {t.total ? <div className={styles.progressoDoBloco} role="progressbar" aria-label="Tarefas de hoje concluídas" aria-valuemin={0} aria-valuemax={t.total} aria-valuenow={t.concluidas}><span style={{ width: `${(t.concluidas / t.total) * 100}%` }} /></div> : null}
          {t.itens.length ? <ul className={styles.tarefasDoBloco}>{t.itens.map((o) => {
            const prazo = prazoDaOcorrencia(o, hoje);
            return <li key={o.id} data-concluida={o.situacao === "concluida" || undefined}>
              <span className={styles.tituloDaTarefa}>{o.titulo}</span>
              <small className={prazo.tom ? styles.atraso : undefined}>{o.responsavel.nome.split(/\s+/)[0]} · {o.situacao === "concluida" || prazo.tom ? prazo.detalhe : prazo.detalhe.replace(/^até /, "")}</small>
            </li>;
          })}</ul> : null}
        </Bloco>
      </div>
    </div>

    {protocolos ? <Bloco icone={<FileCheck size={16} aria-hidden="true" />} titulo="Protocolos"
      sub={protocolos.contagens.emAndamento ? `${protocolos.contagens.verificarHoje} para verificar hoje · ${protocolos.contagens.vencemEm7Dias} com data-limite em 7 dias` : "Nenhum protocolo em andamento."}
      link={{ href: hrefDosProtocolos({ situacao: protocolos.contagens.verificarHoje ? "verificar_hoje" : "em_andamento", departamento: "engenharia-obras", ...(empresa ? { empresa } : {}) }), rotulo: protocolos.contagens.verificarHoje ? "Verificar" : "Ver todos" }}>
      {protocolos.itens.length ? <ul className={styles.listaDoBloco}>{[...protocolos.itens].sort((a, b) => a.dataLimite.localeCompare(b.dataLimite)).slice(0, 4).map((p) => {
        const prazo = prazoDoProtocolo(p);
        return <li key={p.id}><Link href={hrefDosProtocolos({}, p.id)} className={styles.linhaDoBloco}>
          <span className={styles.caixaPequena} aria-hidden="true"><FileCheck size={16} /></span>
          <span className={styles.textoDaLinha}><strong>{p.cliente.nome}</strong><small>{ROTULO_DO_TIPO_DE_PROTOCOLO[p.tipo]} · {p.numero} · {textoDaVerificacao(p, hoje)}</small></span>
          <span className={styles.ladoDaLinha}><span className={prazo.tom === "perigo" ? styles.atraso : undefined}>{prazo.texto}</span><span className="ui-badge ui-tone--neutral">{ROTULO_DA_SITUACAO_DO_PROTOCOLO[p.situacao]}</span></span>
        </Link></li>;
      })}</ul> : null}
    </Bloco> : null}

    {configurando ? <ConfiguracoesDaEngenharia opcoes={opcoes} aoFechar={() => setConfigurando(false)} /> : null}
    {criando ? <OrdemForm empresaInicial={empresa} hoje={hoje} prazoSugerido={opcoes?.prazoSugerido} aoCancelar={() => setCriando(false)}
      aoSalvar={(o) => { setCriando(false); router.push(hrefDasOrdens({ visao: "cards" }, o.id)); }} /> : null}
  </div>;
}
