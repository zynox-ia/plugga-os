"use client";

import { periodosDeTarefas, type ListarTarefasResposta, type OcorrenciaDeTarefa, type OpcoesDeTarefasResposta } from "@plugga/shared";
import { Building2, CalendarCheck, CalendarDays, CalendarRange, Info, Layers, List, SquareKanban, Tag, TriangleAlert, UserRound, Users, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  hrefDeTarefas,
  ordenarOcorrencias,
  ROTULO_DO_PERIODO_DE_TAREFAS,
  temFiltroNasTarefas,
  textoDoProgresso,
  TITULO_DO_PERIODO,
  visoesDeTarefas,
  type ConfiguracaoDeTarefas,
  type FiltrosDeTarefas,
  type VisaoDeTarefas,
} from "../../lib/tarefas";
import estilosClientes from "../clientes/tela-clientes.module.css";
import { BarraRolagemMinimalista } from "../pipelines/quadro-do-pipeline";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus } from "../ui";
import { ConcluirTarefa } from "./concluir-tarefa";
import { DetalheDaTarefa } from "./detalhe-da-tarefa";
import { KanbanDeTarefas } from "./kanban-de-tarefas";
import { ListaDeTarefas } from "./lista-de-tarefas";
import { NovaTarefa } from "./nova-tarefa";
import styles from "./tarefas.module.css";

const VISOES: Record<VisaoDeTarefas, { rotulo: string; icone: LucideIcon }> = { lista: { rotulo: "Lista", icone: List }, kanban: { rotulo: "Kanban", icone: SquareKanban } };
const ICONE_DO_PERIODO = { hoje: CalendarDays, semana: CalendarRange, atrasadas: TriangleAlert, todas: Layers } as const;

/**
 * Tarefas do departamento (PLU-349, PLU-340): Lista e Kanban, os filtros de
 * período, categoria (só onde houver), empresa e responsável, a Nova tarefa e o
 * concluir com resultado e evidência. Um só componente para o Financeiro, a
 * Engenharia e a Energia; o que muda vem em `config`.
 */
export function TarefasView({ config, filtros, resposta, opcoes, acoesDoCabecalho }: {
  config: ConfiguracaoDeTarefas;
  filtros: FiltrosDeTarefas;
  resposta: ListarTarefasResposta;
  /** Nulas quando a leitura falhou: sem Nova tarefa e sem o filtro de responsável. */
  opcoes: OpcoesDeTarefasResposta | null;
  /** Ex.: a engrenagem das Configurações do departamento. */
  acoesDoCabecalho?: ReactNode;
}) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [concluindo, setConcluindo] = useState<OcorrenciaDeTarefa | null>(null);
  const [aberta, setAberta] = useState<OcorrenciaDeTarefa | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const abasRef = useRef<HTMLDivElement>(null);
  const colunasRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 5000); return () => clearTimeout(t); }, [aviso]);

  const hoje = resposta.hoje;
  const ir = (parcial: Partial<FiltrosDeTarefas>) => router.push(hrefDeTarefas(config.rota, { ...filtros, ...parcial }), { scroll: false });
  const limpar = () => router.push(hrefDeTarefas(config.rota, { visao: filtros.visao }), { scroll: false });
  const filtrado = temFiltroNasTarefas(filtros);
  const podeCriar = Boolean(opcoes?.podeCriar);

  function navegarAbas(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const proxima = visoesDeTarefas[filtros.visao === "lista" ? 1 : 0];
    ir({ visao: proxima });
    abasRef.current?.querySelector<HTMLButtonElement>(`#tarefas-visao-${proxima}`)?.focus();
  }

  const periodos = periodosDeTarefas.map((p) => { const Icone = ICONE_DO_PERIODO[p]; return { value: p, label: ROTULO_DO_PERIODO_DE_TAREFAS[p], icon: <Icone />, aside: String(resposta.contagens.periodos[p]) }; });
  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];
  const pessoas = opcoes ? [{ value: "todos", label: "Todos os responsáveis", icon: <Users /> }, ...opcoes.pessoas.map((p) => ({ value: p.id, label: p.nome, icon: <UserRound /> }))] : null;
  // A categoria é opcional por departamento: o filtro só aparece onde houver (a CCEE na Energia).
  const categorias = opcoes?.categorias.length ? [{ value: "todas", label: "Todas as categorias", icon: <Tag /> }, ...opcoes.categorias.map((c) => ({ value: c, label: c, icon: <Tag /> }))] : null;

  const itens = ordenarOcorrencias(resposta.itens);
  const progresso = { texto: textoDoProgresso(filtros.periodo, resposta.progresso), ...resposta.progresso };
  const acoes = { aoConcluir: setConcluindo, aoVer: setAberta, aoAbrir: setAberta };

  let conteudo: ReactNode;
  if (itens.length === 0) {
    const atrasadas = filtros.periodo === "atrasadas";
    conteudo = <div className={`lista-negocios-vazia ${styles.vazio}`} role="status">
      <div className="lista-negocios-vazia-icone" aria-hidden="true"><CalendarCheck size={22} /></div>
      <h3 className="lista-negocios-vazia-titulo">{atrasadas ? "Nada atrasado" : "Nenhuma tarefa nesse período"}</h3>
      <p className="lista-negocios-vazia-desc">{atrasadas ? "Todas as tarefas estão em dia." : "Troque o período ou crie uma tarefa."}</p>
      {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : podeCriar ? <Button size="sm" icon={<IconPlus />} onClick={() => setCriando(true)}>Nova tarefa</Button> : null}
    </div>;
  } else if (filtros.visao === "kanban") {
    conteudo = <>
      <p className={styles.resumo} role="status">{progresso.texto}</p>
      <BarraRolagemMinimalista containerRef={colunasRef} className={`${estilosPipelines.rolagem} ${styles.rolagemQuadro}`} />
      <KanbanDeTarefas itens={itens} contagens={resposta.contagens.colunas} hoje={hoje} config={config} colunasRef={colunasRef} {...acoes} />
    </>;
  } else {
    const titulo = filtros.categoria ? `${TITULO_DO_PERIODO[filtros.periodo]} · ${filtros.categoria}` : TITULO_DO_PERIODO[filtros.periodo];
    conteudo = <ListaDeTarefas titulo={titulo} progresso={progresso} mostrarBarra={filtros.periodo !== "atrasadas"} itens={itens} hoje={hoje} config={config} {...acoes} />;
  }

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Tarefas</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>O que {config.nomeDoDepartamento} precisa fazer: tarefas únicas e recorrentes, com responsável, prazo e evidência.</h2>
      </div>
      <div className={estilosPipelines.acoes}>
        {podeCriar ? <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Nova tarefa</Button> : null}
        {acoesDoCabecalho}
      </div>
    </header>

    <div className={styles.barra} role="toolbar" aria-label="Visualização e filtros das tarefas">
      <div ref={abasRef} className={`${estilosPipelines.visoes} ${estilosClientes.abas} ${styles.abas}`} role="tablist" aria-label="Visualização das tarefas" onKeyDown={navegarAbas}>
        {visoesDeTarefas.map((id) => {
          const { rotulo, icone: Icone } = VISOES[id];
          return <button key={id} type="button" id={`tarefas-visao-${id}`} className="ui-tab" role="tab" aria-selected={filtros.visao === id} aria-controls="tarefas-conteudo"
            tabIndex={filtros.visao === id ? 0 : -1} onClick={() => ir({ visao: id })}><Icone size={15} aria-hidden="true" />{rotulo}</button>;
        })}
      </div>
      <div className={styles.filtros} role="group" aria-label="Filtros das tarefas">
        <div className={styles.filtro}><FiltroComBusca label="Período" icon={<CalendarDays />} value={filtros.periodo} onChange={(v) => ir({ periodo: v as FiltrosDeTarefas["periodo"] })} options={periodos} /></div>
        {categorias ? <div className={styles.filtro}><FiltroComBusca label="Categoria" icon={<Tag />} semFiltro="todas" value={filtros.categoria ?? "todas"} onChange={(v) => ir({ categoria: v === "todas" ? undefined : v })} options={categorias} /></div> : null}
        <div className={styles.filtro}><FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"} onChange={(v) => ir({ empresa: v === "todas" ? undefined : (v as FiltrosDeTarefas["empresa"]) })} options={empresas} /></div>
        {pessoas ? <div className={styles.filtro}><FiltroComBusca label="Responsável" icon={<UserRound />} semFiltro="todos" value={filtros.responsavelId ?? "todos"} onChange={(v) => ir({ responsavelId: v === "todos" ? undefined : v })} options={pessoas} /></div> : null}
        {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
      </div>
    </div>

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
    {opcoes === null ? <p className="aviso aviso--alerta" role="status">Não foi possível carregar as pessoas do departamento: Nova tarefa e o filtro de responsável ficam de fora até recarregar a página.</p> : null}

    <section id="tarefas-conteudo" className={`${estilosClientes.conteudo} ${styles.conteudo}`} role="tabpanel" aria-labelledby={`tarefas-visao-${filtros.visao}`}>{conteudo}</section>
    {/* O aviso do departamento (opcional), sempre à vista, como no protótipo: também com a lista vazia. */}
    {config.nota ? <p className={styles.nota}><Info size={14} aria-hidden="true" /><span>{config.nota}</span></p> : null}

    {criando && opcoes ? <NovaTarefa departamento={config.departamento} opcoes={opcoes} exemplo={config.exemplo} empresaInicial={filtros.empresa} hoje={hoje} aoCancelar={() => setCriando(false)}
      aoCriar={(t) => { setCriando(false); setAviso(`Tarefa criada: ${t.titulo} (${t.recorrenciaTexto}).`); router.refresh(); }} /> : null}
    {concluindo ? <ConcluirTarefa departamento={config.departamento} ocorrencia={concluindo} aoCancelar={() => setConcluindo(null)}
      aoConcluir={(o) => { setConcluindo(null); setAviso(`Tarefa concluída: ${o.titulo}.`); router.refresh(); }} /> : null}
    {aberta ? <DetalheDaTarefa key={aberta.id} departamento={config.departamento} ocorrencia={aberta} hoje={hoje} aoFechar={() => setAberta(null)}
      aoEncerrar={(t) => { setAberta(null); setAviso(`Tarefa encerrada: ${t.titulo}.`); router.refresh(); }} /> : null}
  </div>;
}
