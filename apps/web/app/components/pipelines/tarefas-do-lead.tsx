"use client";

import type { Activity, ActivityStatus, PipelinePerson } from "@plugga/shared";
import { Check, Clock, History, Kanban, ListTodo, MapPin, MoreHorizontal, Pencil, Phone, Play, Plus, RotateCcw, Users } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { formatarDataHoraCurta } from "../../lib/format";
import { alteracoesDoAgendamento } from "../../lib/agendamento-atividade";
import { Button } from "../ui/button";
import { OptionLabel } from "../ui/select-option";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { Avatar } from "./icones";
import { AgendamentoAtividadeModal, TIPOS_ATIVIDADE } from "./agendamento-atividade-form";
import { ConcluirAtividadeModal } from "./concluir-atividade-modal";
import { HistoricoAtividadeModal } from "./historico-atividade-modal";
import type { ControleAtividadesDoNegocio } from "./use-atividades-do-negocio";
import styles from "./atividades-do-negocio.module.css";
import quadroStyles from "./tarefas-do-lead.module.css";

const COLUNAS = [
  { id: "todo", nome: "A fazer", cor: "#7F8FA3" },
  { id: "doing", nome: "Em andamento", cor: "#0066CC" },
  { id: "done", nome: "Concluído", cor: "#126744" },
] as const;
type Janela = { tipo: "nova" } | { tipo: "editar" | "concluir" | "historico"; atividade: Activity };

export function TarefasDoLead({ negocioId, controle, responsaveis, responsavelInicial, aoAlterarRascunho }: {
  negocioId: string; controle: ControleAtividadesDoNegocio; responsaveis: PipelinePerson[]; responsavelInicial: string;
  aoAlterarRascunho: (alterado: boolean) => void;
}) {
  const [janela, setJanela] = useState<Janela | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [alvo, setAlvo] = useState<ActivityStatus | null>(null);
  const arrastando = useRef<Activity | null>(null);
  const quadro = useRef<HTMLDivElement>(null);
  const focoPendente = useRef<string | null>(null);
  const prefixo = useId();
  const bloqueado = controle.salvando || controle.carregando;
  const ordenadas = [...controle.atividades].sort((a, b) => a.currentRound.dueAt.localeCompare(b.currentRound.dueAt) || a.id.localeCompare(b.id));
  useLayoutEffect(() => {
    if (janela || !focoPendente.current) return;
    quadro.current?.querySelector<HTMLElement>(`[data-atividade-id="${focoPendente.current}"]`)?.focus({ preventScroll: true });
    focoPendente.current = null;
  }, [controle.atividades, janela]);
  function fecharJanela() {
    if (janela && "atividade" in janela) focoPendente.current = janela.atividade.id;
    // Fechar depois de um erro (um conflito de versão, por exemplo) descarta o rascunho: o quadro volta aos dados atuais.
    if (controle.erro) { controle.limparErro(); controle.recarregar(); }
    setJanela(null);
  }
  function abrir(proxima: Janela) { controle.limparErro(); setJanela(proxima); }
  async function mover(atividade: Activity, destino: ActivityStatus) {
    if (bloqueado || atividade.currentRound.status === destino || atividade.currentRound.status === "done") return;
    if (destino === "done") { abrir({ tipo: "concluir", atividade }); return; }
    focoPendente.current = atividade.id;
    if (await controle.atualizar(atividade, { status: destino })) setMensagem(`Atividade ${atividade.title} movida para ${COLUNAS.find((coluna) => coluna.id === destino)?.nome}.`);
    else focoPendente.current = null;
  }
  return <div className={quadroStyles.tarefas}>
    <header className={styles.barra}><div><h3>Tarefas do lead</h3><p className={styles.ajuda}>Atividades e prazos em Manaus.</p></div><div className={styles.acoes}>
      <Button variant="primary" size="sm" icon={<Plus />} disabled={bloqueado} onClick={() => abrir({ tipo: "nova" })}>Nova atividade</Button>
    </div></header>
    <p id={`${prefixo}-ajuda`} className="sr-only">Arraste entre colunas ou use Alt e as setas com o cartão em foco. Para concluir, registre o resultado.</p>
    <span className="sr-only" role="status">{mensagem}</span>
    {controle.erro && !janela ? <p className="aviso aviso--erro" role="alert">{controle.erro.mensagem}</p> : null}
    {/* Na recarga o quadro fica à vista, bloqueado, até os dados novos chegarem. */}
    {controle.carregando && !controle.atividades.length ? <p role="status">Carregando atividades…</p> : <div ref={quadro} className={quadroStyles.quadro} aria-label="Atividades do negócio">
      {COLUNAS.map((coluna) => {
        const atividades = ordenadas.filter((atividade) => atividade.currentRound.status === coluna.id);
        return <section key={coluna.id} className={`${quadroStyles.coluna}${alvo === coluna.id ? ` ${quadroStyles.colunaAlvo}` : ""}`} aria-labelledby={`${prefixo}-${coluna.id}`}
          onDragOver={(evento) => { if (arrastando.current && !bloqueado) { evento.preventDefault(); setAlvo(coluna.id); } }}
          onDragLeave={(evento) => { if (!(evento.relatedTarget instanceof Node) || !evento.currentTarget.contains(evento.relatedTarget)) setAlvo(null); }}
          onDrop={(evento) => { evento.preventDefault(); const atividade = arrastando.current; arrastando.current = null; setAlvo(null); if (atividade) void mover(atividade, coluna.id); }}>
          <header className="coluna-topo">
            <div className="coluna-titulo">
              <Kanban size={16} className="coluna-titulo-icone" style={{ color: coluna.cor }} aria-hidden="true" />
              <h3 id={`${prefixo}-${coluna.id}`}>{coluna.nome}</h3>
            </div>
            <span className="coluna-quantidade" aria-label={`${atividades.length} atividades`}>{String(atividades.length).padStart(2, "0")}</span>
          </header>
          <div className={quadroStyles.lista}>{atividades.length ? atividades.map((atividade) => {
            const rodada = atividade.currentRound;
            const atrasada = rodada.status !== "done" && new Date(rodada.dueAt).getTime() < Date.now();
            return <CartaoAtividade key={atividade.id} atividade={atividade} cor={coluna.cor} atrasada={atrasada} bloqueado={bloqueado} descricaoId={`${prefixo}-ajuda`}
              responsavel={responsaveis.find((pessoa) => pessoa.id === rodada.ownerId)}
              aoIniciarArrasto={() => { arrastando.current = atividade; }} aoTerminarArrasto={() => { arrastando.current = null; setAlvo(null); }}
              aoMoverTeclado={(direcao) => {
                const indice = COLUNAS.findIndex((item) => item.id === rodada.status);
                void mover(atividade, COLUNAS[Math.max(0, Math.min(2, indice + direcao))]!.id);
              }}
              aoAlternarAndamento={() => void mover(atividade, rodada.status === "todo" ? "doing" : "todo")}
              aoEditar={() => abrir({ tipo: "editar", atividade })} aoConcluir={() => abrir({ tipo: "concluir", atividade })} aoHistorico={() => abrir({ tipo: "historico", atividade })} />;
          }) : <p className={quadroStyles.colunaVazia}>Nenhuma atividade nesta coluna.</p>}</div>
        </section>;
      })}
    </div>}
    {janela ? createPortal(<>
      {janela.tipo === "nova" || janela.tipo === "editar" ? <AgendamentoAtividadeModal key={janela.tipo === "nova" ? "nova" : janela.atividade.id} atividade={janela.tipo === "editar" ? janela.atividade : undefined} pessoas={responsaveis} ownerId={responsavelInicial} salvando={controle.salvando} erro={controle.erro} aoAlterarRascunho={aoAlterarRascunho} aoFechar={fecharJanela} aoSalvar={async (dados, requestId) => {
        const patch = janela.tipo === "editar" ? alteracoesDoAgendamento(janela.atividade, dados) : null;
        if (patch && !Object.keys(patch).length) { setMensagem("Nenhuma alteração para salvar."); return true; }
        const salva = janela.tipo === "editar" ? await controle.atualizar(janela.atividade, patch!) : await controle.criar({ ...dados, requestId, target: { kind: "deal", dealId: negocioId } });
        if (salva) setMensagem(janela.tipo === "editar" ? "Atividade atualizada." : "Atividade criada.");
        return !!salva;
      }} /> : null}
      {janela.tipo === "concluir" ? <ConcluirAtividadeModal atividade={janela.atividade} pessoas={responsaveis} salvando={controle.salvando} erro={controle.erro} aoAlterarRascunho={aoAlterarRascunho} aoFechar={fecharJanela} aoConcluir={async (dados) => {
        const concluida = await controle.concluir(janela.atividade, dados); if (concluida) setMensagem("Atividade concluída."); return !!concluida;
      }} /> : null}
      {janela.tipo === "historico" ? <HistoricoAtividadeModal atividade={janela.atividade} pessoas={responsaveis} aoFechar={() => setJanela(null)} /> : null}
    </>, document.body) : null}
  </div>;
}

const ICONE_DO_TIPO = { task: ListTodo, call: Phone, meeting: Users, visit: MapPin } as const;

/** Cartão de atividade no formato do cartão de negócio do Quadro: tipo, título, responsável e prazo. */
function CartaoAtividade({ atividade, cor, atrasada, bloqueado, descricaoId, responsavel, aoIniciarArrasto, aoTerminarArrasto, aoMoverTeclado, aoAlternarAndamento, aoEditar, aoConcluir, aoHistorico }: {
  atividade: Activity; cor: string; atrasada: boolean; bloqueado: boolean; descricaoId: string; responsavel?: PipelinePerson;
  aoIniciarArrasto: () => void; aoTerminarArrasto: () => void; aoMoverTeclado: (direcao: 1 | -1) => void;
  aoAlternarAndamento: () => void; aoEditar: () => void; aoConcluir: () => void; aoHistorico: () => void;
}) {
  const rodada = atividade.currentRound;
  const concluida = rodada.status === "done";
  const Icone = ICONE_DO_TIPO[atividade.type] ?? ListTodo;
  const horas = (new Date(rodada.dueAt).getTime() - Date.now()) / 36e5;
  const tomPrazo = concluida ? quadroStyles.prazoConcluido : atrasada ? quadroStyles.prazoAtrasado : horas <= 48 ? quadroStyles.prazoProximo : "";
  const [menuAberto, setMenuAberto] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const escolher = (acao: () => void) => () => { setMenuAberto(false); acao(); };

  return <article data-atividade-id={atividade.id} className={`${quadroStyles.cartaoAtividade}${concluida ? ` ${quadroStyles.cartaoConcluido}` : ""}`}
    style={{ "--cor-coluna": cor } as CSSProperties} aria-label={`Atividade ${atividade.title}`} tabIndex={0} aria-describedby={descricaoId}
    draggable={!bloqueado && !concluida}
    onDragStart={(evento) => { if ((evento.target as HTMLElement).closest("button")) { evento.preventDefault(); return; } aoIniciarArrasto(); evento.dataTransfer.setData("text/plain", atividade.id); }}
    onDragEnd={aoTerminarArrasto}
    onKeyDown={(evento) => {
      if (!evento.altKey || !["ArrowLeft", "ArrowRight"].includes(evento.key)) return;
      evento.preventDefault(); evento.stopPropagation();
      aoMoverTeclado(evento.key === "ArrowRight" ? 1 : -1);
    }}>
    <div className={quadroStyles.topoAtividade}>
      <span className={quadroStyles.iconeAtividade} aria-hidden="true"><Icone size={15} /></span>
      <span className={quadroStyles.tipoAtividade}>{TIPOS_ATIVIDADE[atividade.type]} · Rodada {rodada.number}</span>
      {!concluida ? <button type="button" className={quadroStyles.botaoConcluir} disabled={bloqueado} onClick={aoConcluir} aria-label={`Concluir ${atividade.title}`} title="Concluir"><Check size={14} strokeWidth={2.4} /></button> : null}
      <Popover open={menuAberto} onOpenChange={(aberto) => { if (aberto) setContainer(gatilho.current?.closest("dialog") ?? null); setMenuAberto(aberto); }}>
        <PopoverTrigger asChild>
          <button ref={gatilho} type="button" className={quadroStyles.botaoMais} disabled={bloqueado} aria-label={`Ações de ${atividade.title}`} aria-haspopup="menu"><MoreHorizontal size={16} /></button>
        </PopoverTrigger>
        <PopoverContent container={container} className={quadroStyles.menuAtividade} align="end" role="menu" aria-label={`Ações de ${atividade.title}`}>
          {!concluida ? <button type="button" role="menuitem" className="ui-option" onClick={escolher(aoAlternarAndamento)}><OptionLabel option={{ label: rodada.status === "todo" ? "Iniciar" : "Voltar a fazer", icon: rodada.status === "todo" ? <Play /> : <RotateCcw /> }} /></button> : null}
          {!concluida ? <button type="button" role="menuitem" className="ui-option" onClick={escolher(aoEditar)}><OptionLabel option={{ label: "Editar", icon: <Pencil /> }} /></button> : null}
          <button type="button" role="menuitem" className="ui-option" onClick={escolher(aoHistorico)}><OptionLabel option={{ label: "Ver histórico", icon: <History /> }} /></button>
        </PopoverContent>
      </Popover>
    </div>
    <h4 className={quadroStyles.tituloAtividade}>{atividade.title}</h4>
    {atividade.notes ? <p className={quadroStyles.notaAtividade}>{atividade.notes}</p> : null}
    {rodada.outcome ? <p className={quadroStyles.resultadoAtividade}><Check size={12} aria-hidden="true" />{rodada.outcome.summary}</p> : null}
    <footer className={quadroStyles.rodapeAtividade}>
      <span className={quadroStyles.pessoaAtividade}>
        {responsavel ? <><Avatar id={responsavel.id} nome={responsavel.name} tamanho="pequeno" /><span>{responsavel.name.split(/\s+/)[0]}</span></> : <span>Responsável indisponível</span>}
      </span>
      <time className={`${quadroStyles.prazoAtividade} ${tomPrazo}`} dateTime={rodada.dueAt}>
        <Clock size={12} aria-hidden="true" />{atrasada ? "Atrasada · " : ""}{formatarDataHoraCurta(rodada.dueAt)}
      </time>
    </footer>
  </article>;
}
