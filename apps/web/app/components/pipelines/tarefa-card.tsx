"use client";

import type { PipelinePerson } from "@plugga/shared";
import { Eye, Flag, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { COLUNAS_TAREFAS, PRIORIDADES_TAREFAS, type StatusTarefa, type TarefaDoLead } from "../../lib/tarefas-lead";
import { Button } from "../ui/button";
import { displayDate } from "../ui/date-value";
import { OptionLabel } from "../ui/select-option";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { Avatar } from "./icones";
import styles from "./tarefas-do-lead.module.css";

function MenuDaTarefa({ tarefa, aoVer, aoEditar, aoExcluir }: { tarefa: TarefaDoLead; aoVer: () => void; aoEditar: () => void; aoExcluir: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const abrindoModal = useRef(false);
  function selecionar(acao: () => void) { abrindoModal.current = true; setAberto(false); acao(); }
  return <Popover open={aberto} onOpenChange={(valor) => {
    if (valor) { setContainer(trigger.current?.closest("dialog") ?? null); abrindoModal.current = false; }
    setAberto(valor);
  }}>
    <PopoverTrigger ref={trigger} asChild><Button variant="secondary" size="sm" className={styles.menuTrigger} icon={<MoreHorizontal size={18} />} iconOnly aria-label={`Ações da tarefa ${tarefa.titulo}`} aria-haspopup="menu" /></PopoverTrigger>
    <PopoverContent ref={menu} container={container} className={styles.menuConteudo} align="end" role="menu" aria-label={`Ações da tarefa ${tarefa.titulo}`}
      onOpenAutoFocus={(evento) => { evento.preventDefault(); menu.current?.querySelector<HTMLButtonElement>("button")?.focus(); }}
      onCloseAutoFocus={(evento) => { if (abrindoModal.current) evento.preventDefault(); }}
      onKeyDown={(evento) => {
        const opcoes = Array.from(evento.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const atual = opcoes.indexOf(document.activeElement as HTMLButtonElement);
        const proximo = evento.key === "ArrowDown" ? (atual + 1) % opcoes.length : evento.key === "ArrowUp" ? (atual + opcoes.length - 1) % opcoes.length : evento.key === "Home" ? 0 : evento.key === "End" ? opcoes.length - 1 : -1;
        if (proximo >= 0) { evento.preventDefault(); opcoes[proximo]?.focus(); }
        if (evento.key === "Tab") setAberto(false);
      }}>
      <button type="button" role="menuitem" className="ui-option" onClick={() => selecionar(aoVer)}><OptionLabel option={{ label: "Ver detalhes", icon: <Eye /> }} /></button>
      <button type="button" role="menuitem" className="ui-option" onClick={() => selecionar(aoEditar)}><OptionLabel option={{ label: "Editar tarefa", icon: <Pencil /> }} /></button>
      <button type="button" role="menuitem" className="ui-option ui-option--danger" onClick={() => selecionar(aoExcluir)}><OptionLabel option={{ label: "Excluir tarefa", icon: <Trash2 /> }} /></button>
    </PopoverContent>
  </Popover>;
}

export function TarefaCard({ tarefa, responsavel, instrucoesId, arrastando, aoVer, aoEditar, aoExcluir, aoMover, aoIniciarArrasto, aoTerminarArrasto }: {
  tarefa: TarefaDoLead; responsavel?: PipelinePerson; instrucoesId: string; arrastando: boolean;
  aoVer: () => void; aoEditar: () => void; aoExcluir: () => void; aoMover: (status: StatusTarefa) => void;
  aoIniciarArrasto: (evento: DragEvent<HTMLElement>) => void; aoTerminarArrasto: () => void;
}) {
  const prioridade = PRIORIDADES_TAREFAS.find((item) => item.id === tarefa.prioridade)?.titulo;
  return <article className={`${styles.cartao} ${arrastando ? styles.arrastando : ""}`} aria-label={tarefa.titulo} aria-describedby={instrucoesId} data-tarefa-id={tarefa.id} tabIndex={0} draggable
    onDragStart={(evento) => { if ((evento.target as HTMLElement).closest("button")) evento.preventDefault(); else aoIniciarArrasto(evento); }} onDragEnd={aoTerminarArrasto}
    onClick={(evento) => { if (!(evento.target as HTMLElement).closest('button,[role="menu"]')) aoVer(); }}
    onKeyDown={(evento) => {
      if (!evento.altKey || (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft")) return;
      evento.preventDefault(); evento.stopPropagation();
      const indice = COLUNAS_TAREFAS.findIndex((item) => item.id === tarefa.status);
      const proximo = Math.max(0, Math.min(COLUNAS_TAREFAS.length - 1, indice + (evento.key === "ArrowRight" ? 1 : -1)));
      aoMover(COLUNAS_TAREFAS[proximo]!.id);
    }}>
    <div className={styles.topoCartao}>
      <span className={styles.codigo}>TAR-{tarefa.id.slice(0, 8).toUpperCase()}</span>
      <div className={styles.acoesCartao}>
        <span className={styles.prioridadeCartao} data-prioridade={tarefa.prioridade} title={`Prioridade: ${prioridade}`}>
          <Flag size={12} aria-hidden="true" fill={tarefa.prioridade === "urgente" ? "currentColor" : "none"} />{prioridade}
        </span>
        <MenuDaTarefa tarefa={tarefa} aoVer={aoVer} aoEditar={aoEditar} aoExcluir={aoExcluir} />
      </div>
    </div>
    <button type="button" className={styles.tituloCartao} aria-label={`Ver detalhes da tarefa ${tarefa.titulo}`} onClick={aoVer}>{tarefa.titulo}</button>
    {tarefa.descricao ? <p className={styles.descricaoCartao}>{tarefa.descricao}</p> : null}
    <footer className={styles.rodapeCartao}><span className={styles.pessoaCartao}>{responsavel ? <><span aria-hidden="true"><Avatar id={responsavel.id} nome={responsavel.name} tamanho="pequeno" /></span><span>{responsavel.name}</span></> : "Responsável indisponível"}</span><time dateTime={tarefa.dataFim || undefined}>{tarefa.dataFim ? `Prazo: ${displayDate(tarefa.dataFim).slice(0, 5)}` : "Sem prazo"}</time></footer>
  </article>;
}
