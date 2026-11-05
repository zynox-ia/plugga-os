"use client";

import type { PipelinePerson } from "@plugga/shared";
import { ClipboardList, Flag, Pencil, Trash2 } from "lucide-react";
import { COLUNAS_TAREFAS, PRIORIDADES_TAREFAS, type TarefaDoLead } from "../../lib/tarefas-lead";
import { Badge } from "../ui/feedback";
import { Button } from "../ui/button";
import { displayDate } from "../ui/date-value";
import { Dialog } from "../ui/dialog";
import { PerfilResponsavelTarefa } from "./tarefa-formulario-modal";
import styles from "./tarefas-do-lead.module.css";

export function TarefaDetalhesModal({ tarefa, responsaveis, aoEditar, aoExcluir, aoFechar }: {
  tarefa: TarefaDoLead; responsaveis: PipelinePerson[]; aoEditar: () => void; aoExcluir: () => void; aoFechar: () => void;
}) {
  const responsavel = responsaveis.find((item) => item.id === tarefa.responsavelId);
  return <div className={styles.escopoModal}><Dialog title="Detalhes da tarefa" description="Atividade vinculada a este lead." icon={<ClipboardList />} onClose={aoFechar} cancelText="Fechar"
    footer={<><Button variant="secondary" icon={<Pencil />} onClick={aoEditar}>Editar</Button><Button variant="danger" icon={<Trash2 />} onClick={aoExcluir}>Excluir</Button></>}>
    <div className="ui-dialog-form">
      <div className={styles.tituloDetalhes}><h3>{tarefa.titulo}</h3><Badge tone={tarefa.status === "done" ? "success" : "neutral"}>{COLUNAS_TAREFAS.find((item) => item.id === tarefa.status)?.titulo}</Badge></div>
      <dl className={styles.dadosDetalhes}>
        <div><dt>Responsável</dt><dd>{responsavel ? <PerfilResponsavelTarefa pessoa={responsavel} /> : "Responsável não disponível"}</dd></div>
        <div><dt>Prioridade</dt><dd className={styles.prioridadeDetalhes} data-prioridade={tarefa.prioridade}><Flag size={14} aria-hidden="true" fill={tarefa.prioridade === "urgente" ? "currentColor" : "none"} />{PRIORIDADES_TAREFAS.find((item) => item.id === tarefa.prioridade)?.titulo}</dd></div>
        <div><dt>Data de início</dt><dd>{displayDate(tarefa.dataInicio)}</dd></div>
        <div><dt>Data de fim</dt><dd>{displayDate(tarefa.dataFim) || "Não informada"}</dd></div>
      </dl>
      <div className={styles.descricaoDetalhes}><span className="ui-field-label">Descrição</span><p>{tarefa.descricao || "Sem descrição."}</p></div>
    </div>
  </Dialog></div>;
}

export function ExcluirTarefaModal({ tarefa, aoExcluir, aoFechar }: { tarefa: TarefaDoLead; aoExcluir: () => void; aoFechar: () => void }) {
  return <div className={styles.escopoModal}><Dialog title="Excluir tarefa?" description="Esta ação não poderá ser desfeita." icon={<Trash2 />} variant="danger" size="estreita" cancelAutoFocus onClose={aoFechar}
    footer={<Button variant="danger" icon={<Trash2 />} onClick={aoExcluir}>Excluir tarefa</Button>}>
    <p>A tarefa <strong>“{tarefa.titulo}”</strong> será excluída do quadro.</p>
  </Dialog></div>;
}
