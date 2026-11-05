"use client";

import type { PipelinePerson } from "@plugga/shared";
import { Kanban, Plus } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { COLUNAS_TAREFAS, moverTarefa, type DadosTarefa, type StatusTarefa, type TarefaDoLead } from "../../lib/tarefas-lead";
import { Button } from "../ui/button";
import { TarefaCard } from "./tarefa-card";
import { ExcluirTarefaModal, TarefaDetalhesModal } from "./tarefa-detalhes-modal";
import { TarefaFormularioModal } from "./tarefa-formulario-modal";
import styles from "./tarefas-do-lead.module.css";

type Janela = { tipo: "novo"; status: StatusTarefa } | { tipo: "detalhes" | "editar" | "excluir"; id: string; voltarAosDetalhes?: boolean };

export function TarefasDoLead({ tarefas, aoAlterar, responsaveis, responsavelInicial }: {
  tarefas: TarefaDoLead[]; aoAlterar: Dispatch<SetStateAction<TarefaDoLead[]>>; responsaveis: PipelinePerson[]; responsavelInicial: string;
}) {
  const [janela, setJanela] = useState<Janela | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<StatusTarefa | null>(null);
  const [mensagem, setMensagem] = useState("");
  const idArrasto = useRef<string | null>(null);
  const cartaoParaFocar = useRef<string | null>(null);
  const quadro = useRef<HTMLDivElement>(null);
  const instrucoesId = useId();
  const prefixoId = useId();
  const selecionada = janela && "id" in janela ? tarefas.find((item) => item.id === janela.id) : undefined;

  useLayoutEffect(() => {
    if (!cartaoParaFocar.current) return;
    quadro.current?.querySelector<HTMLElement>(`[data-tarefa-id="${cartaoParaFocar.current}"]`)?.focus({ preventScroll: true });
    cartaoParaFocar.current = null;
  }, [tarefas]);

  function mover(id: string, destino: StatusTarefa, manterFoco = false) {
    if (manterFoco) cartaoParaFocar.current = id;
    aoAlterar((atuais) => moverTarefa(atuais, id, destino));
    const tarefa = tarefas.find((item) => item.id === id);
    if (tarefa) setMensagem(`Tarefa ${tarefa.titulo} movida para ${COLUNAS_TAREFAS.find((coluna) => coluna.id === destino)?.titulo}.`);
  }
  function terminarArrasto() { idArrasto.current = null; setArrastando(null); setAlvo(null); }
  function salvar(dados: DadosTarefa) {
    if (janela?.tipo === "editar" && selecionada) {
      const id = selecionada.id;
      aoAlterar((atuais) => atuais.map((item) => item.id === id ? { ...dados, id, status: item.status } : item));
      setMensagem("Tarefa atualizada.");
    } else {
      const id = crypto.randomUUID();
      aoAlterar((atuais) => [{ ...dados, id }, ...atuais]);
      setMensagem("Tarefa criada.");
    }
    setJanela(null);
  }

  const modais = <>
    {janela?.tipo === "novo" || (janela?.tipo === "editar" && selecionada) ? <TarefaFormularioModal key={janela.tipo === "novo" ? "nova" : selecionada!.id} tarefa={janela.tipo === "editar" ? selecionada : undefined} statusInicial={janela.tipo === "novo" ? janela.status : selecionada!.status} responsaveis={responsaveis} responsavelInicial={responsavelInicial} aoSalvar={salvar} aoFechar={() => setJanela(null)} /> : null}
    {janela?.tipo === "detalhes" && selecionada ? <TarefaDetalhesModal tarefa={selecionada} responsaveis={responsaveis} aoFechar={() => setJanela(null)} aoEditar={() => setJanela({ tipo: "editar", id: selecionada.id })} aoExcluir={() => setJanela({ tipo: "excluir", id: selecionada.id, voltarAosDetalhes: true })} /> : null}
    {janela?.tipo === "excluir" && selecionada ? <ExcluirTarefaModal tarefa={selecionada} aoFechar={() => setJanela(janela.voltarAosDetalhes ? { tipo: "detalhes", id: selecionada.id } : null)} aoExcluir={() => {
      const id = selecionada.id;
      aoAlterar((atuais) => atuais.filter((item) => item.id !== id));
      setMensagem("Tarefa excluída."); setJanela(null);
    }} /> : null}
  </>;

  return <div className={styles.tarefas}>
    <header className={styles.barraTarefas}><div><h3>Tarefas do lead</h3><p>Organize as próximas atividades deste negócio.</p></div><Button variant="primary" size="sm" icon={<Plus />} onClick={() => setJanela({ tipo: "novo", status: "todo" })}>Nova tarefa</Button></header>
    <p id={instrucoesId} className="sr-only">Arraste uma tarefa entre colunas ou, com o cartão em foco, use Alt e as setas para a esquerda ou direita.</p>
    <span className="sr-only" role="status" aria-live="polite">{mensagem}</span>
    <div ref={quadro} className={styles.quadro}>
      {COLUNAS_TAREFAS.map((coluna) => {
        const itens = tarefas.filter((item) => item.status === coluna.id);
        return <section key={coluna.id} className={`${styles.coluna} ${alvo === coluna.id ? styles.colunaAlvo : ""}`} data-tarefa-coluna={coluna.id} aria-labelledby={`${prefixoId}-${coluna.id}`}
          onDragOver={(evento) => { if (idArrasto.current) { evento.preventDefault(); evento.dataTransfer.dropEffect = "move"; setAlvo(coluna.id); } }}
          onDragLeave={(evento) => { if (!(evento.relatedTarget instanceof Node) || !evento.currentTarget.contains(evento.relatedTarget)) setAlvo(null); }}
          onDrop={(evento) => { evento.preventDefault(); if (idArrasto.current) mover(idArrasto.current, coluna.id); terminarArrasto(); }}>
          <header className="coluna-topo"><div className="coluna-titulo"><Kanban size={16} aria-hidden="true" className={styles.iconeColuna} /><h3 id={`${prefixoId}-${coluna.id}`}>{coluna.titulo}</h3></div><div className={styles.acoesColuna}><span className="coluna-quantidade" aria-label={`${itens.length} tarefas`}>{String(itens.length).padStart(2, "0")}</span><button type="button" className="coluna-novo" aria-label={`Nova tarefa em ${coluna.titulo}`} onClick={() => setJanela({ tipo: "novo", status: coluna.id })}><Plus size={14} aria-hidden="true" /></button></div></header>
          <div className={styles.lista}>
            {itens.length ? itens.map((tarefa) => <TarefaCard key={tarefa.id} tarefa={tarefa} responsavel={responsaveis.find((item) => item.id === tarefa.responsavelId)} instrucoesId={instrucoesId} arrastando={arrastando === tarefa.id}
              aoVer={() => setJanela({ tipo: "detalhes", id: tarefa.id })} aoEditar={() => setJanela({ tipo: "editar", id: tarefa.id })} aoExcluir={() => setJanela({ tipo: "excluir", id: tarefa.id })} aoMover={(destino) => mover(tarefa.id, destino, true)}
              aoIniciarArrasto={(evento) => { idArrasto.current = tarefa.id; setArrastando(tarefa.id); evento.dataTransfer.setData("text/plain", tarefa.id); evento.dataTransfer.effectAllowed = "move"; }} aoTerminarArrasto={terminarArrasto} />) : <p className={styles.colunaVazia}>{arrastando ? "Solte aqui" : "Nenhuma tarefa nesta coluna"}</p>}
          </div>
        </section>;
      })}
    </div>
    {janela ? createPortal(modais, document.body) : null}
  </div>;
}
