"use client";

import type { Deal, Pipeline, PipelinePerson } from "@plugga/shared";
import { ArrowRight, BriefcaseBusiness, Building2, FileText, FolderOpen, History, LayoutDashboard, ListTodo, MapPin, MoreHorizontal, Pencil, UserRound, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { ROTULO_ORIGEM } from "../../lib/clientes";
import type { TarefaDoLead } from "../../lib/tarefas-lead";
import { Modal } from "../modal";
import { Button } from "../ui/button";
import { DocumentosDoLead } from "./documentos-do-lead";
import { FichaDoLead } from "./ficha-do-lead";
import { HistoricoDoLead } from "./historico-do-lead";
import { Avatar } from "./icones";
import { OportunidadeDoLead } from "./oportunidade-do-lead";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";
import { CabecalhoResumoDoLead, ProximaAcaoDoLead, ResumoDoLead } from "./resumo-do-lead";
import { useDetalhesDoLead } from "./use-detalhes-do-lead";
import { TarefasDoLead } from "./tarefas-do-lead";
import styles from "./detalhes-do-lead-modal.module.css";

const SECOES = [
  { id: "resumo", titulo: "Visão geral", descricao: "Indicadores comerciais e próximas ações", icone: LayoutDashboard },
  { id: "historico", titulo: "Histórico", descricao: "Linha do tempo e autoria das alterações", icone: History },
  { id: "tarefas", titulo: "Tarefas", descricao: "Atividades e acompanhamento do lead", icone: ListTodo },
  { id: "proposta", titulo: "Propostas", descricao: "Propostas comerciais", icone: FileText },
  { id: "documentos", titulo: "Documentos", descricao: "Arquivos e documentos categorizados", icone: FolderOpen },
  { id: "lead", titulo: "Cadastro", descricao: "Ficha cadastral e contato do lead", icone: UserRound },
  { id: "oportunidade", titulo: "Oportunidade", descricao: "Estrutura do negócio e valores", icone: BriefcaseBusiness },
] as const;
type Secao = (typeof SECOES)[number]["id"];
type Props = { negocioId: string; pipeline: Pipeline; responsaveis: PipelinePerson[]; acoes: AcoesDoNegocio; tarefas: TarefaDoLead[]; aoAlterarTarefas: Dispatch<SetStateAction<TarefaDoLead[]>>; aoFechar: () => void };

export function DetalhesDoLeadModal({ negocioId, pipeline, responsaveis, acoes, tarefas, aoAlterarTarefas, aoFechar }: Props) {
  const detalhe = useDetalhesDoLead(negocioId, pipeline.id, acoes.atualizar);
  const { negocio, rascunho } = detalhe;
  const [secao, setSecao] = useState<Secao>("resumo");
  const [menuAberto, setMenuAberto] = useState(false);
  const [acaoPendente, setAcaoPendente] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [docsAlterados, setDocsAlterados] = useState(false);
  const [docsOcupados, setDocsOcupados] = useState(false);
  const [docsChave, setDocsChave] = useState(0);
  const [historicoRevisao, setHistoricoRevisao] = useState(0);
  const [saida, setSaida] = useState<{ executar: () => void; recarregar: boolean } | null>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLElement>(null);
  const id = useId();
  const alterado = detalhe.alterado || docsAlterados;
  const ocupado = detalhe.salvando || docsOcupados || acaoPendente || detalhe.carregando;
  const origem = negocio?.lead.origin;
  const origemFormatada = origem ? ROTULO_ORIGEM[origem as keyof typeof ROTULO_ORIGEM] ?? origem : "Origem não informada";

  useEffect(() => { painel.current?.scrollTo({ top: 0 }); }, [secao]);

  useEffect(() => {
    if (!alterado && !ocupado) return;
    const avisar = (evento: BeforeUnloadEvent) => { evento.preventDefault(); evento.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alterado, ocupado]);

  function pedirSaida(executar = aoFechar, recarregar = false) {
    if (detalhe.salvando || docsOcupados || acaoPendente) return;
    if (alterado) setSaida({ executar, recarregar });
    else executar();
  }
  function recarregar() {
    setDocsChave((valor) => valor + 1); setDocsAlterados(false);
    void detalhe.carregar();
  }
  function executar(acao: (negocio: Deal) => void) {
    if (!negocio) return;
    pedirSaida(() => { aoFechar(); acao(negocio); });
  }
  async function mudarEtapa(etapaId: string) {
    if (!negocio || ocupado || alterado) return;
    setAcaoPendente(true); setErroAcao(null);
    const atualizado = await acoes.moverEtapa(negocio, etapaId);
    setAcaoPendente(false);
    if (atualizado) await detalhe.carregar();
    else setErroAcao("Não foi possível mudar a etapa. Tente novamente.");
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
    const indice = SECOES.findIndex((item) => item.id === secao);
    const proximo = evento.key === "ArrowDown" || evento.key === "ArrowRight" ? (indice + 1) % SECOES.length
      : evento.key === "ArrowUp" || evento.key === "ArrowLeft" ? (indice + SECOES.length - 1) % SECOES.length
      : evento.key === "Home" ? 0 : evento.key === "End" ? SECOES.length - 1 : -1;
    if (proximo < 0) return;
    evento.preventDefault(); setSecao(SECOES[proximo]!.id); botoes.current[proximo]?.focus();
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
          <Button variant="secondary" size="sm" disabled={!negocio || ocupado} icon={<Pencil size={14} />} onClick={() => setSecao("lead")}>Editar</Button>
          {negocio?.status === "open" ? <Button variant="primary" size="sm" disabled={ocupado} onClick={() => executar(acoes.ganhar)}>{pipeline.wonLabel}</Button> : negocio ? <span className={styles.statusPill}>{negocio.status === "won" ? "Lead ganho" : "Lead perdido"}</span> : null}
          <div className={styles.menu} onBlur={(evento) => { if (!evento.currentTarget.contains(evento.relatedTarget)) setMenuAberto(false); }} onKeyDown={(evento) => { if (evento.key === "Escape" && menuAberto) { evento.preventDefault(); evento.stopPropagation(); setMenuAberto(false); botaoMenu.current?.focus(); } }}>
            <button ref={botaoMenu} type="button" className={styles.botaoMenu} disabled={!negocio || ocupado} aria-label="Mais ações do lead" aria-haspopup="menu" aria-expanded={menuAberto} onClick={() => setMenuAberto((aberto) => !aberto)}><MoreHorizontal size={18} aria-hidden="true" /></button>
            {menuAberto && negocio ? <div className={styles.menuOpcoes} role="menu" aria-label="Ações do lead">
              {negocio.status === "open" ? <>
                <button type="button" role="menuitem" onClick={() => executar(acoes.perder)}><X size={14} />{pipeline.lostLabel}</button>
                <button type="button" role="menuitem" onClick={() => executar(acoes.transferir)}><ArrowRight size={14} />Mover para outro pipeline</button>
                {!negocio.client && acoes.converter ? <button type="button" role="menuitem" onClick={() => executar(acoes.converter!)}><UserRound size={14} />Converter em cliente</button> : null}
                <span className={styles.menuSeparador} role="separator" />
              </> : null}
              <span className={styles.menuTitulo}>Prioridade</span>
              {([{ valor: null, rotulo: "Sem prioridade" }, { valor: "urgente", rotulo: "Urgente" }, { valor: "medio", rotulo: "Médio" }, { valor: "normal", rotulo: "Normal" }] as const).map((opcao) => <button key={opcao.rotulo} type="button" role="menuitemradio" aria-checked={negocio.priority === opcao.valor} disabled={alterado} onClick={() => void prioridade(opcao.valor)}><span className={`${styles.prioridadeMenuDot} ${opcao.valor ? styles[`prioridade_${opcao.valor}`] : ""}`} />{opcao.rotulo}</button>)}
              <button type="button" role="menuitem" onClick={() => pedirSaida(recarregar, true)}>Recarregar dados</button>
            </div> : null}
          </div>
          <button type="button" className={styles.botaoFechar} disabled={detalhe.salvando || docsOcupados || acaoPendente} onClick={() => pedirSaida()} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>
        </div>
      </header>
      <div className={styles.painelPrincipal}>
        {negocio ? <ProximaAcaoDoLead negocio={negocio} aoVerCadastro={() => setSecao("lead")} /> : null}
        <div className={styles.navegacao} role="tablist" aria-label="Seções do lead" aria-orientation="horizontal" onKeyDown={navegar}>
          {SECOES.map((item, indice) => <div key={item.id}>
            <button ref={(elemento) => { botoes.current[indice] = elemento; }} type="button" role="tab" id={`${id}-${item.id}`} aria-selected={secao === item.id} aria-controls={`${id}-painel`} tabIndex={secao === item.id ? 0 : -1} className={styles.abaBotao} onClick={() => setSecao(item.id)}><item.icone size={15} aria-hidden="true" /><span>{item.titulo}</span></button>
          </div>)}
        </div>
        <section ref={painel} id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${secao}`} className={styles.conteudo}>
          {negocio && secao === "resumo" ? <CabecalhoResumoDoLead negocio={negocio} /> : null}
          {detalhe.carregando ? <p role="status">Carregando dados do lead…</p> : null}
          {detalhe.erro ? <div className="aviso aviso--erro" role="alert">{detalhe.erro}{!negocio ? <Button size="sm" variant="secondary" onClick={() => void detalhe.carregar()}>Tentar novamente</Button> : null}{detalhe.conflito ? <><p>Seu rascunho foi preservado. Recarregar substituirá os textos pelos dados atuais.</p><Button size="sm" variant="secondary" onClick={() => pedirSaida(recarregar, true)}>Recarregar dados atuais</Button></> : null}</div> : null}
          {erroAcao ? <p role="alert" className="aviso aviso--erro">{erroAcao}</p> : null}
          {detalhe.sucesso && !detalhe.alterado ? <p role="status" className="aviso aviso--sucesso">Alterações salvas.</p> : null}
          {negocio && rascunho ? <>
            {secao === "resumo" ? <ResumoDoLead negocio={negocio} pipeline={pipeline} aoMover={(etapaId) => void mudarEtapa(etapaId)} bloqueado={ocupado || alterado} aoVerHistorico={() => setSecao("historico")} /> : null}
            {secao === "lead" || secao === "oportunidade" ? <fieldset className={styles.formularioSemBorda} disabled={ocupado}>
              {secao === "lead" ? <FichaDoLead rascunho={rascunho} aoAlterar={detalhe.setRascunho} erros={detalhe.errosCampos} /> : <OportunidadeDoLead rascunho={rascunho} aoAlterar={detalhe.setRascunho} erros={detalhe.errosCampos} pipeline={pipeline} responsaveis={responsaveis.some((p) => p.id === negocio.owner.id) ? responsaveis : [negocio.owner, ...responsaveis]} />}
            </fieldset> : null}
            <div hidden={secao !== "historico"}><HistoricoDoLead id={negocio.id} ativo={secao === "historico"} revisao={detalhe.revisao + historicoRevisao} /></div>
            {secao === "tarefas" ? <TarefasDoLead tarefas={tarefas} aoAlterar={aoAlterarTarefas} responsaveis={responsaveis.some((pessoa) => pessoa.id === negocio.owner.id) ? responsaveis : [negocio.owner, ...responsaveis]} responsavelInicial={negocio.owner.id} /> : null}
            {secao === "proposta" ? <><div className={styles.tituloSecao}><h3>Proposta comercial</h3><p>As propostas deste lead ficarão organizadas nesta seção.</p></div><div className={styles.propostaCard}><div className={styles.propostaCodigo}><FileText size={20} aria-hidden="true" /><strong>Propostas ainda não disponíveis</strong></div><p className={styles.cockpitCardSub}>A integração de propostas será disponibilizada em uma próxima etapa.</p></div></> : null}
            <div hidden={secao !== "documentos"}><DocumentosDoLead key={docsChave} id={negocio.id} ativo={secao === "documentos"} aoRascunho={setDocsAlterados} aoOcupar={setDocsOcupados} aoAtualizar={() => setHistoricoRevisao((valor) => valor + 1)} /></div>
          </> : null}
        </section>
        {detalhe.alterado ? <div className={styles.barraSalvar}><span>Alterações não salvas nas abas Lead ou Oportunidade.</span><Button size="sm" variant="primary" loading={detalhe.salvando} disabled={ocupado || detalhe.conflito} onClick={() => void detalhe.salvar()}>Salvar alterações</Button></div> : null}
      </div>
    </div>
    {saida ? <Modal rotulo="Descartar alterações?" aoFechar={() => setSaida(null)}><div className={styles.confirmacaoSaida}><h2>Descartar alterações?</h2><p>Há textos ou arquivos ainda não salvos. Continuar descarta este rascunho.</p><div className={styles.propostaAcoes}><Button variant="secondary" autoFocus onClick={() => setSaida(null)}>Continuar editando</Button><Button variant="danger" onClick={() => { const acao = saida.executar; setSaida(null); acao(); }}>{saida.recarregar ? "Descartar e recarregar" : "Descartar e fechar"}</Button></div></div></Modal> : null}
  </Modal>;
}
