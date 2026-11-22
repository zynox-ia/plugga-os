"use client";

import type { Deal, DealTransitionOrigin, Pipeline, PipelinePerson } from "@plugga/shared";
import { ArrowRight, BriefcaseBusiness, Building2, FileText, FolderKanban, FolderOpen, History, LayoutDashboard, ListTodo, MapPin, MoreHorizontal, Pencil, Save, UserRound, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ROTULO_ORIGEM } from "../../lib/clientes";
import { negocioConvertido } from "../../lib/negocios";
import { tarefasHabilitadas } from "../../lib/tarefas-habilitadas";
import { proximaAtividade } from "../../lib/proxima-atividade";
import type { RascunhoLead } from "../../lib/rascunho-lead";
import { Modal } from "../modal";
import { Button } from "../ui/button";
import { DocumentosDoLead } from "./documentos-do-lead";
import { FichaDoLead } from "./ficha-do-lead";
import { HistoricoDoLead } from "./historico-do-lead";
import { Avatar } from "./icones";
import { OportunidadeDoLead } from "./oportunidade-do-lead";
import { ProjetosDoLead } from "./projetos-do-lead";
import { useProcessoSolar } from "./use-processo-solar";
import { PropostasDoLead } from "./propostas-do-lead";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";
import { ProximaAcaoDoLead, ResumoDoLead } from "./resumo-do-lead";
import { useDetalhesDoLead } from "./use-detalhes-do-lead";
import { TarefasDoLead } from "./tarefas-do-lead";
import { useAtividadesDoNegocio } from "./use-atividades-do-negocio";
import styles from "./detalhes-do-lead-modal.module.css";
import perfilStyles from "./perfil-do-lead.module.css";

const TAREFAS_HABILITADAS = tarefasHabilitadas(process.env.NODE_ENV);
function secoesDoLead(pipeline: Pipeline) {
  const solar = pipeline.processProfile?.key === "solar_commercial";
  return ([
    { id: "resumo", titulo: "Visão geral", descricao: "Indicadores comerciais e próximas ações", icone: LayoutDashboard },
    { id: "lead", titulo: "Perfil", descricao: "Identificação, contato e qualificação comercial", icone: UserRound },
    { id: "tarefas", titulo: "Tarefas", descricao: "Atividades e acompanhamento do lead", icone: ListTodo },
    { id: "proposta", titulo: "Propostas", descricao: "Propostas comerciais", icone: FileText },
    solar
      ? { id: "projetos", titulo: "Projetos", descricao: "Projetos Solar deste lead", icone: FolderKanban }
      : { id: "oportunidade", titulo: "Oportunidade", descricao: "Estrutura do negócio e valores", icone: BriefcaseBusiness },
    { id: "historico", titulo: "Histórico", descricao: "Linha do tempo e autoria das alterações", icone: History },
    { id: "documentos", titulo: "Documentos", descricao: "Arquivos e documentos categorizados", icone: FolderOpen },
  ] as const).filter((secao) => secao.id !== "tarefas" || TAREFAS_HABILITADAS);
}
type Secao = ReturnType<typeof secoesDoLead>[number]["id"];
type Props = { negocioId: string; pipeline: Pipeline; responsaveis: PipelinePerson[]; podeAtribuir: boolean; acoes: AcoesDoNegocio; aoFechar: () => void };

export function DetalhesDoLeadModal({ negocioId, pipeline, responsaveis, podeAtribuir, acoes, aoFechar }: Props) {
  const detalhe = useDetalhesDoLead(negocioId, pipeline.id, acoes.atualizar);
  const atividades = useAtividadesDoNegocio(negocioId, () => { void detalhe.carregar(); });
  const { negocio, rascunho } = detalhe;
  const secoes = useMemo(() => secoesDoLead(pipeline), [pipeline]);
  const [secao, setSecao] = useState<Secao>("resumo");
  const [perfilEditando, setPerfilEditando] = useState(false);
  const inicioEdicao = useRef<Pick<RascunhoLead, "lead" | "ownerId"> | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [acaoPendente, setAcaoPendente] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [docsAlterados, setDocsAlterados] = useState(false);
  const [docsOcupados, setDocsOcupados] = useState(false);
  const [docsChave, setDocsChave] = useState(0);
  const [docsDesatualizados, setDocsDesatualizados] = useState(false);
  const [propostasAlteradas, setPropostasAlteradas] = useState(false);
  const [propostasOcupadas, setPropostasOcupadas] = useState(false);
  const [projetosAlterados, setProjetosAlterados] = useState(false);
  const [projetosOcupados, setProjetosOcupados] = useState(false);
  const [atividadeAlterada, setAtividadeAlterada] = useState(false);
  const [propostasChave, setPropostasChave] = useState(0);
  const [historicoRevisao, setHistoricoRevisao] = useState(0);
  const [saida, setSaida] = useState<{ executar: () => void; recarregar: boolean } | null>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLElement>(null);
  const id = useId();
  const alterado = detalhe.alterado || docsAlterados || propostasAlteradas || projetosAlterados || atividadeAlterada;
  const ocupado = detalhe.salvando || docsOcupados || propostasOcupadas || projetosOcupados || atividades.salvando || acaoPendente || detalhe.carregando;
  const origem = negocio?.lead.origin;
  const origemFormatada = origem ? ROTULO_ORIGEM[origem as keyof typeof ROTULO_ORIGEM] ?? origem : "Origem não informada";
  const equipe = negocio && !responsaveis.some((pessoa) => pessoa.id === negocio.owner.id) ? [negocio.owner, ...responsaveis] : responsaveis;
  const proxima = proximaAtividade(atividades.atividades);
  const processo = useProcessoSolar(negocioId, pipeline, detalhe.revisao);

  useEffect(() => { painel.current?.scrollTo({ top: 0 }); }, [secao]);
  // Cada recarga do lead pode trazer tarefa nova do processo (entrada em etapa).
  const recarregarAtividades = atividades.recarregar;
  const primeiraRevisao = useRef(true);
  useEffect(() => {
    if (primeiraRevisao.current) { primeiraRevisao.current = false; return; }
    if (processo.ativo) recarregarAtividades();
  }, [detalhe.revisao]);

  useEffect(() => {
    if (!docsDesatualizados || docsAlterados || docsOcupados) return;
    setDocsChave((valor) => valor + 1); setDocsDesatualizados(false);
  }, [docsDesatualizados, docsAlterados, docsOcupados]);

  useEffect(() => {
    if (!alterado && !ocupado) return;
    const avisar = (evento: BeforeUnloadEvent) => { evento.preventDefault(); evento.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alterado, ocupado]);

  function pedirSaida(executar = aoFechar, recarregar = false) {
    if (detalhe.salvando || docsOcupados || propostasOcupadas || projetosOcupados || atividades.salvando || acaoPendente) return;
    if (alterado) setSaida({ executar, recarregar });
    else executar();
  }
  function recarregar() {
    setPerfilEditando(false); inicioEdicao.current = null;
    setDocsChave((valor) => valor + 1); setDocsAlterados(false);
    setPropostasChave((valor) => valor + 1); setPropostasAlteradas(false);
    void detalhe.carregar();
  }
  function editarPerfil() {
    if (!rascunho || ocupado) return;
    if (!perfilEditando) inicioEdicao.current = { lead: { ...rascunho.lead }, ownerId: rascunho.ownerId };
    setSecao("lead"); setPerfilEditando(true);
  }
  function cancelarPerfil() {
    const inicio = inicioEdicao.current;
    if (inicio) detalhe.setRascunho((atual) => atual && { ...atual, lead: inicio.lead, ownerId: inicio.ownerId });
    detalhe.limparValidacao();
    inicioEdicao.current = null; setPerfilEditando(false);
  }
  async function salvarAlteracoes() {
    if (await detalhe.salvar()) { setPerfilEditando(false); inicioEdicao.current = null; }
  }
  function executar(acao: (negocio: Deal, origem?: DealTransitionOrigin) => void) {
    if (!negocio) return;
    pedirSaida(() => { aoFechar(); acao(negocio, "ficha"); });
  }
  async function mudarEtapa(etapaId: string) {
    if (!negocio || ocupado || alterado || negocio.status !== "open") return;
    setAcaoPendente(true); setErroAcao(null);
    let motivo = "Não foi possível mudar a etapa. Tente novamente.";
    const atualizado = await acoes.moverEtapa(negocio, etapaId, undefined, "ficha", (mensagem) => { motivo = mensagem; });
    setAcaoPendente(false);
    if (atualizado) await detalhe.carregar();
    else setErroAcao(motivo);
  }
  async function prioridade(valor: Deal["priority"]) {
    if (!negocio || ocupado || alterado) return;
    setMenuAberto(false); setAcaoPendente(true); setErroAcao(null);
    const atualizado = await acoes.definirPrioridade(negocio, valor);
    setAcaoPendente(false);
    if (atualizado) await detalhe.carregar();
    else setErroAcao("Não foi possível alterar a prioridade. Tente novamente.");
  }
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const indiceFocado = botoes.current.findIndex((botao) => botao === evento.target);
    const indice = indiceFocado >= 0 ? indiceFocado : secoes.findIndex((item) => item.id === secao);
    const proximo = evento.key === "ArrowDown" || evento.key === "ArrowRight" ? (indice + 1) % secoes.length
      : evento.key === "ArrowUp" || evento.key === "ArrowLeft" ? (indice + secoes.length - 1) % secoes.length
      : evento.key === "Home" ? 0 : evento.key === "End" ? secoes.length - 1 : -1;
    if (proximo < 0) return;
    evento.preventDefault(); setSecao(secoes[proximo]!.id); botoes.current[proximo]?.focus();
  }

  function abrirSecao(destino: Secao) {
    const indice = secoes.findIndex((item) => item.id === destino);
    if (indice < 0) return;
    setSecao(destino);
    botoes.current[indice]?.focus({ preventScroll: true });
  }

  async function adicionarAnotacao(texto: string) {
    if (!rascunho || ocupado || alterado || detalhe.conflito) return false;
    const notes = [rascunho.lead.notes, texto].filter(Boolean).join("\n\n");
    return detalhe.salvar({ ...rascunho, lead: { ...rascunho.lead, notes } });
  }

  return <Modal rotulo="Detalhes do lead" aoFechar={() => pedirSaida()} largura="larga" className={styles.modal}>
    <div className={styles.layout}>
      <header className={styles.cabecalhoLead}>
        <div className={styles.identidadeCabecalho}>
          <div className={styles.leadCardLinhaSuperior}>
            <div className={styles.iconeLead} aria-hidden="true">{negocio?.lead.personType === "pf" ? <UserRound size={20} /> : <Building2 size={20} />}</div>
            <div className={styles.identidadeLead}>
              <h2 className={styles.leadCardTitulo}>{negocio?.lead.name ?? "Carregando lead…"}</h2>
              {negocio ? <div className={styles.metadadosCabecalho}>
                <span>{origemFormatada}</span><span aria-hidden="true">·</span>
                <span><MapPin size={13} aria-hidden="true" />{[negocio.lead.city, negocio.lead.state].filter(Boolean).join(" / ") || "Localidade não informada"}</span>
                <span aria-hidden="true">·</span>
                <span className={styles.responsavelInline}><span aria-hidden="true"><Avatar id={negocio.owner.id} nome={negocio.owner.name} tamanho="pequeno" /></span>{negocio.owner.name}</span>
              </div> : null}
            </div>
          </div>
        </div>
        <div className={styles.controlesCabecalho}>
          <Button variant="secondary" size="sm" disabled={!negocio || ocupado} icon={<Pencil size={14} />} onClick={editarPerfil}>Editar</Button>
          {negocio && negocio.status !== "open" ? <span className={styles.statusPill}>{negocio.status === "won" ? "Lead ganho" : "Lead perdido"}</span> : null}
          <div className={styles.menu} onBlur={(evento) => { if (!evento.currentTarget.contains(evento.relatedTarget)) setMenuAberto(false); }} onKeyDown={(evento) => { if (evento.key === "Escape" && menuAberto) { evento.preventDefault(); evento.stopPropagation(); setMenuAberto(false); botaoMenu.current?.focus(); } }}>
            <button ref={botaoMenu} type="button" className={styles.botaoMenu} disabled={!negocio || ocupado} aria-label="Mais ações do lead" aria-haspopup="menu" aria-expanded={menuAberto} onClick={() => setMenuAberto((aberto) => !aberto)}><MoreHorizontal size={18} aria-hidden="true" /></button>
            {menuAberto && negocio ? <div className={styles.menuOpcoes} role="menu" aria-label="Ações do lead">
              {negocio.status === "open" ? <>
                <button type="button" role="menuitem" onClick={() => executar(acoes.perder)}><X size={14} />{pipeline.lostLabel}</button>
                <button type="button" role="menuitem" onClick={() => executar(acoes.transferir)}><ArrowRight size={14} />Mover para outro pipeline</button>
                {!negocioConvertido(negocio) && acoes.converter ? <button type="button" role="menuitem" disabled={Boolean(acoes.convertendoId)} onClick={() => executar(acoes.converter!)}><UserRound size={14} />Converter em cliente</button> : null}
                <span className={styles.menuSeparador} role="separator" />
              </> : null}
              <span className={styles.menuTitulo}>Prioridade</span>
              {([{ valor: null, rotulo: "Sem prioridade" }, { valor: "urgente", rotulo: "Urgente" }, { valor: "medio", rotulo: "Médio" }, { valor: "normal", rotulo: "Normal" }] as const).map((opcao) => <button key={opcao.rotulo} type="button" role="menuitemradio" aria-checked={negocio.priority === opcao.valor} disabled={alterado} onClick={() => void prioridade(opcao.valor)}><span className={`${styles.prioridadeMenuDot} ${opcao.valor ? styles[`prioridade_${opcao.valor}`] : ""}`} />{opcao.rotulo}</button>)}
              <button type="button" role="menuitem" onClick={() => pedirSaida(recarregar, true)}>Recarregar dados</button>
            </div> : null}
          </div>
          <button type="button" className={styles.botaoFechar} disabled={detalhe.salvando || docsOcupados || propostasOcupadas || projetosOcupados || acaoPendente} onClick={() => pedirSaida()} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>
        </div>
      </header>
      <div className={styles.painelPrincipal}>
        <div className={styles.navegacao} role="tablist" aria-label="Seções do lead" aria-orientation="horizontal" onKeyDown={navegar}>
          {secoes.map((item, indice) => <div key={item.id}>
            <button ref={(elemento) => { botoes.current[indice] = elemento; }} type="button" role="tab" id={`${id}-${item.id}`} aria-selected={secao === item.id} aria-controls={`${id}-painel`} tabIndex={secao === item.id ? 0 : -1} className={styles.abaBotao} onClick={() => setSecao(item.id)}><item.icone size={15} aria-hidden="true" /><span>{item.titulo}</span></button>
          </div>)}
        </div>
        {negocio && secao !== "resumo" ? <ProximaAcaoDoLead atividade={proxima} responsavel={equipe.find((pessoa) => pessoa.id === proxima?.currentRound.ownerId)?.name} carregando={atividades.carregando} erro={!!atividades.erro} aoVerAtividades={() => abrirSecao("tarefas")} /> : null}
        <section ref={painel} id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${secao}`} className={styles.conteudo}>
          {detalhe.carregando ? <p role="status">Carregando dados do lead…</p> : null}
          {detalhe.erro ? <div className="aviso aviso--erro" role="alert">{detalhe.erro}{!negocio ? <Button size="sm" variant="secondary" onClick={() => void detalhe.carregar()}>Tentar novamente</Button> : null}{detalhe.conflito ? <><p>Seu rascunho foi preservado. Recarregar substituirá os textos pelos dados atuais.</p><Button size="sm" variant="secondary" onClick={() => pedirSaida(recarregar, true)}>Recarregar dados atuais</Button></> : null}</div> : null}
          {erroAcao ? <p role="alert" className="aviso aviso--erro">{erroAcao}</p> : null}
          {detalhe.sucesso && !detalhe.alterado ? <p role="status" className="aviso aviso--sucesso">Alterações salvas.</p> : null}
          {negocio && rascunho ? <>
            {secao === "resumo" ? (
              <ResumoDoLead negocio={negocio} pipeline={pipeline} pendencias={processo.situacao?.pendencies}
                atividades={atividades} proxima={proxima} responsaveis={equipe} bloqueado={ocupado || alterado || detalhe.conflito}
                aoVerAtividades={() => abrirSecao("tarefas")} aoMover={(etapaId) => void mudarEtapa(etapaId)}
                aoGanhar={() => executar(acoes.ganhar)} aoPerder={() => executar(acoes.perder)} aoAdicionarAnotacao={adicionarAnotacao} />
            ) : null}
            {secao === "lead" || secao === "oportunidade" ? <fieldset className={styles.formularioSemBorda} disabled={ocupado}>
              {secao === "lead" ? <FichaDoLead podeAtribuir={podeAtribuir} rascunho={rascunho} aoAlterar={detalhe.setRascunho} erros={detalhe.errosCampos} editando={perfilEditando} aoEditar={editarPerfil} responsaveis={equipe} /> : <OportunidadeDoLead negocioId={negocio.id} aoVerDocumentos={() => setSecao("documentos")} podeAtribuir={podeAtribuir} rascunho={rascunho} aoAlterar={detalhe.setRascunho} erros={detalhe.errosCampos} pipeline={pipeline} responsaveis={equipe} />}
            </fieldset> : null}
            <div hidden={secao !== "historico"}><HistoricoDoLead id={negocio.id} ativo={secao === "historico"} revisao={detalhe.revisao + historicoRevisao} /></div>
            {TAREFAS_HABILITADAS && secao === "tarefas" ? <TarefasDoLead negocioId={negocio.id} controle={atividades} responsaveis={equipe} responsavelInicial={negocio.owner.id} aoAlterarRascunho={setAtividadeAlterada} /> : null}
            <div hidden={secao !== "proposta"}><PropostasDoLead key={propostasChave} negocio={negocio} ativo={secao === "proposta"} aoRascunho={setPropostasAlteradas} aoOcupar={setPropostasOcupadas} aoGerar={() => { setHistoricoRevisao((valor) => valor + 1); setDocsDesatualizados(true); }} /></div>
            <div hidden={secao !== "projetos"}><ProjetosDoLead negocioId={negocio.id} versao={negocio.version} naQualificacao={processo.situacao?.role === "qualificacao" && negocio.status === "open"} aoSalvarProjeto={() => { void detalhe.carregar(); }} ativo={secao === "projetos"} aoRascunho={setProjetosAlterados} aoOcupar={setProjetosOcupados} aoAtualizar={() => { setHistoricoRevisao((valor) => valor + 1); setDocsDesatualizados(true); }} /></div>
            <div hidden={secao !== "documentos"}><DocumentosDoLead key={docsChave} id={negocio.id} ativo={secao === "documentos"} aoRascunho={setDocsAlterados} aoOcupar={setDocsOcupados} aoAtualizar={() => setHistoricoRevisao((valor) => valor + 1)} /></div>
          </> : null}
        </section>
        {perfilEditando || detalhe.alterado ? <div className={perfilStyles.rodape}>
          {perfilEditando ? <Button variant="secondary" size="sm" disabled={ocupado} onClick={cancelarPerfil}>Cancelar</Button> : <span>Há alterações não salvas.</span>}
          <div>{perfilEditando && detalhe.alterado ? <span>Há alterações não salvas.</span> : null}<Button size="sm" icon={<Save />} loading={detalhe.salvando} disabled={ocupado || detalhe.conflito || !detalhe.alterado} onClick={() => void salvarAlteracoes()}>Salvar alterações</Button></div>
        </div> : null}
      </div>
    </div>
    {saida ? <Modal rotulo="Descartar alterações?" aoFechar={() => setSaida(null)}><div className={styles.confirmacaoSaida}><h2>Descartar alterações?</h2><p>Há textos ou arquivos ainda não salvos. Continuar descarta este rascunho.</p><div className={styles.propostaAcoes}><Button variant="secondary" autoFocus onClick={() => setSaida(null)}>Continuar editando</Button><Button variant="danger" onClick={() => { const acao = saida.executar; setSaida(null); acao(); }}>{saida.recarregar ? "Descartar e recarregar" : "Descartar e fechar"}</Button></div></div></Modal> : null}
  </Modal>;
}
