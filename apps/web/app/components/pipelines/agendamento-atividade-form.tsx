"use client";

import type { Activity, PipelinePerson } from "@plugga/shared";
import { useEffect, useId, useRef, useState } from "react";
import { horarioDeManaus, instanteEmManaus, validarHorarioDaAtividade, type DadosAgendamento } from "../../lib/agendamento-atividade";
import type { ErroDoFormulario } from "../../lib/clientes";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { TextareaField, TextField } from "../ui/fields";
import styles from "./atividades-do-negocio.module.css";

export const TIPOS_ATIVIDADE = { task: "Tarefa", call: "Ligação", meeting: "Reunião", visit: "Visita" } as const;

export function agendamentoInicial(ownerId: string, atividade?: Activity): DadosAgendamento {
  return atividade ? {
    type: atividade.type, title: atividade.title, notes: atividade.notes, priority: atividade.priority,
    ownerId: atividade.currentRound.ownerId, startsAt: horarioDeManaus(atividade.currentRound.startsAt), dueAt: horarioDeManaus(atividade.currentRound.dueAt),
  } : { type: "task", title: "", notes: "", priority: "normal", ownerId, startsAt: horarioDeManaus(new Date().toISOString()), dueAt: "" };
}

export function validarAgendamento(dados: DadosAgendamento, pessoas: PipelinePerson[]): Record<string, string> {
  const erros: Record<string, string> = { ...validarHorarioDaAtividade(dados.startsAt, dados.dueAt) };
  if (!dados.title.trim()) erros.title = "Informe o título.";
  else if (dados.title.trim().length > 120) erros.title = "Use até 120 caracteres.";
  if (dados.notes.trim().length > 2000) erros.notes = "Use até 2.000 caracteres.";
  if (!pessoas.some((pessoa) => pessoa.id === dados.ownerId)) erros.ownerId = "Selecione um responsável disponível.";
  return erros;
}

export function agendamentoParaEnvio(dados: DadosAgendamento): DadosAgendamento {
  return { ...dados, title: dados.title.trim(), notes: dados.notes.trim(), startsAt: instanteEmManaus(dados.startsAt)!, dueAt: instanteEmManaus(dados.dueAt || dados.startsAt)! };
}

export function CamposAgendamento({ dados, aoAlterar, pessoas, erros, editando = false, agendaFixa = false, bloqueado = false }: {
  dados: DadosAgendamento; aoAlterar: (dados: DadosAgendamento) => void; pessoas: PipelinePerson[]; erros: Record<string, string>;
  editando?: boolean; agendaFixa?: boolean; bloqueado?: boolean;
}) {
  const prefixo = useId();
  function alterar<K extends keyof DadosAgendamento>(campo: K, valor: DadosAgendamento[K]) { aoAlterar({ ...dados, [campo]: valor }); }
  return <fieldset className={styles.campos} disabled={bloqueado}>
    <div className={styles.grade}>
      <div className="ui-field"><label htmlFor={`${prefixo}-tipo`}>Tipo de atividade</label>
        <select id={`${prefixo}-tipo`} className="ui-input" value={dados.type} disabled={editando} onChange={(evento) => alterar("type", evento.target.value as DadosAgendamento["type"])}>
          {Object.entries(TIPOS_ATIVIDADE).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
      </div>
      <div className="ui-field"><label htmlFor={`${prefixo}-prioridade`}>Prioridade</label>
        <select id={`${prefixo}-prioridade`} className="ui-input" value={dados.priority} onChange={(evento) => alterar("priority", evento.target.value as DadosAgendamento["priority"])}>
          <option value="normal">Normal</option><option value="medio">Médio</option><option value="urgente">Urgente</option>
        </select>
      </div>
    </div>
    <TextField label="Título da atividade" required maxLength={120} value={dados.title} error={erros.title} onChange={(evento) => alterar("title", evento.target.value)} />
    <div className="ui-field"><label htmlFor={`${prefixo}-responsavel`}>Responsável</label>
      <select id={`${prefixo}-responsavel`} className="ui-input" value={dados.ownerId} disabled={agendaFixa} aria-invalid={!!erros.ownerId} aria-describedby={erros.ownerId ? `${prefixo}-responsavel-erro` : undefined} onChange={(evento) => alterar("ownerId", evento.target.value)}>
        <option value="">Selecione um responsável</option>{pessoas.map((pessoa) => <option key={pessoa.id} value={pessoa.id}>{pessoa.name}</option>)}
      </select>{erros.ownerId ? <p id={`${prefixo}-responsavel-erro`} className="ui-field-error">{erros.ownerId}</p> : null}
    </div>
    <div className={styles.grade}>
      <TextField label="Data e hora de início" type="datetime-local" required value={dados.startsAt} disabled={agendaFixa} error={erros.startsAt} onChange={(evento) => alterar("startsAt", evento.target.value)} />
      <TextField label="Prazo (opcional)" type="datetime-local" value={dados.dueAt} disabled={agendaFixa} error={erros.dueAt} hint="Sem prazo separado, vale o horário de início." onChange={(evento) => alterar("dueAt", evento.target.value)} />
    </div>
    <p className={styles.ajuda}>Datas e horários de Manaus.</p>
    <TextareaField label="Notas" maxLength={2000} value={dados.notes} error={erros.notes} onChange={(evento) => alterar("notes", evento.target.value)} />
  </fieldset>;
}

export function AgendamentoAtividadeModal({ atividade, pessoas, ownerId, salvando, erro, aoSalvar, aoAlterarRascunho, aoFechar }: {
  atividade?: Activity; pessoas: PipelinePerson[]; ownerId: string; salvando: boolean; erro: ErroDoFormulario | null;
  aoSalvar: (dados: DadosAgendamento, requestId: string) => Promise<boolean>; aoFechar: () => void;
  aoAlterarRascunho: (alterado: boolean) => void;
}) {
  const [inicial] = useState(() => agendamentoInicial(ownerId, atividade));
  const [dados, setDados] = useState(inicial);
  const [requestId] = useState(() => crypto.randomUUID());
  const [erros, setErros] = useState<Record<string, string>>({});
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => { aoAlterarRascunho(JSON.stringify(dados) !== JSON.stringify(inicial)); }, [dados, inicial, aoAlterarRascunho]);
  useEffect(() => () => aoAlterarRascunho(false), [aoAlterarRascunho]);
  const fechar = () => { if (!salvando) aoFechar(); };
  return <Dialog title={atividade ? "Editar atividade" : "Nova atividade"} description="Agende o próximo passo deste negócio." onClose={fechar}
    footer={<Button variant="primary" disabled={salvando} onClick={() => formulario.current?.requestSubmit()}>{salvando ? "Salvando…" : atividade ? "Salvar atividade" : "Criar atividade"}</Button>}>
    <form ref={formulario} className="ui-dialog-form" onSubmit={async (evento) => {
      evento.preventDefault();
      const validacao = validarAgendamento(dados, pessoas); setErros(validacao);
      if (!Object.keys(validacao).length && await aoSalvar(agendamentoParaEnvio(dados), requestId)) aoFechar();
    }}>
      {erro ? <p className="aviso aviso--erro" role="alert">{erro.mensagem}{erro.codigo === "CONFLITO_ESTADO" ? " Feche este formulário e recarregue as atividades para conferir a versão atual." : ""}</p> : null}
      <CamposAgendamento dados={dados} aoAlterar={setDados} pessoas={pessoas} erros={{ ...erro?.porCampo, ...erros }} editando={!!atividade} agendaFixa={atividade?.origin === "process"} bloqueado={salvando} />
    </form>
  </Dialog>;
}
