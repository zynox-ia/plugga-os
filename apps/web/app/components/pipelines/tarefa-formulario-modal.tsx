"use client";

import type { PipelinePerson } from "@plugga/shared";
import { Flag, ListPlus, Pencil, Plus, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { normalizarTarefa, PRIORIDADES_TAREFAS, validarTarefa, type DadosTarefa, type ErrosTarefa, type StatusTarefa, type TarefaDoLead } from "../../lib/tarefas-lead";
import { Button } from "../ui/button";
import { DatePicker } from "../ui/date-picker";
import { dateValue } from "../ui/date-value";
import { Dialog } from "../ui/dialog";
import { TextField, TextareaField } from "../ui/fields";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/shadcn/select";
import styles from "./tarefas-do-lead.module.css";

export function PerfilResponsavelTarefa({ pessoa }: { pessoa: PipelinePerson }) {
  return <div className="ui-member-profile">
    <span className="ui-member-avatar ui-member-avatar--fallback" aria-hidden="true"><UserRound size={15} /></span>
    <div className="ui-member-text"><span className="ui-member-name">{pessoa.name}</span><span className="ui-member-email">{pessoa.email || "Equipe comercial"}</span></div>
  </div>;
}

export function TarefaFormularioModal({ tarefa, statusInicial, responsaveis, responsavelInicial, aoSalvar, aoFechar }: {
  tarefa?: TarefaDoLead; statusInicial: StatusTarefa; responsaveis: PipelinePerson[]; responsavelInicial: string;
  aoSalvar: (dados: DadosTarefa) => void; aoFechar: () => void;
}) {
  const [dados, setDados] = useState<DadosTarefa>(() => tarefa ? { ...tarefa } : {
    titulo: "", descricao: "", responsavelId: responsavelInicial, dataInicio: dateValue(new Date()), dataFim: "", prioridade: "normal", status: statusInicial,
  });
  const [erros, setErros] = useState<ErrosTarefa>({});
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const pessoa = responsaveis.find((item) => item.id === dados.responsavelId);

  function alterar<K extends keyof DadosTarefa>(campo: K, valor: DadosTarefa[K]) {
    setDados((atuais) => ({ ...atuais, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  return <div className={styles.escopoModal}>
    <Dialog title={tarefa ? "Editar tarefa" : "Nova tarefa"} description="Organize uma atividade para este lead." icon={tarefa ? <Pencil /> : <ListPlus />} onClose={aoFechar}
      footer={<Button variant="primary" icon={tarefa ? <Pencil /> : <Plus />} onClick={() => formulario.current?.requestSubmit()}>{tarefa ? "Salvar alterações" : "Criar tarefa"}</Button>}>
      <form ref={formulario} className="ui-dialog-form" onSubmit={(evento) => {
        evento.preventDefault();
        const proximosErros = validarTarefa(dados, responsaveis.map((item) => item.id));
        setErros(proximosErros);
        if (!Object.keys(proximosErros).length) aoSalvar(normalizarTarefa(dados));
      }}>
        <div className={`ui-dialog-grid ${styles.identidadeFormulario}`}>
          <TextField label="Título da tarefa" required autoFocus maxLength={120} placeholder="Ex.: Solicitar faturas de energia" value={dados.titulo} error={erros.titulo} onChange={(evento) => alterar("titulo", evento.target.value)} />
          <div className="ui-field" ref={(elemento) => { if (elemento && container !== elemento) setContainer(elemento); }}>
            <label id="tarefa-responsavel-label" htmlFor="tarefa-responsavel">Responsável</label>
            <Select value={dados.responsavelId} onValueChange={(valor) => alterar("responsavelId", valor)}>
              <SelectTrigger id="tarefa-responsavel" className={styles.responsavelTrigger} aria-labelledby="tarefa-responsavel-label" aria-invalid={Boolean(erros.responsavelId)} aria-describedby={erros.responsavelId ? "tarefa-responsavel-erro" : undefined}>
                {pessoa ? <PerfilResponsavelTarefa pessoa={pessoa} /> : <span>Selecione um responsável</span>}
              </SelectTrigger>
              <SelectContent container={container} style={{ width: "var(--radix-select-trigger-width)", maxHeight: "260px" }}>
                {responsaveis.map((item) => <SelectItem key={item.id} value={item.id} textValue={item.name} style={{ minHeight: "46px", padding: "6px 12px" }}><PerfilResponsavelTarefa pessoa={item} /></SelectItem>)}
              </SelectContent>
            </Select>
            {erros.responsavelId ? <p id="tarefa-responsavel-erro" className="ui-field-error" role="alert">{erros.responsavelId}</p> : null}
          </div>
        </div>
        <div className={`ui-dialog-grid ${styles.gradeFormulario}`}>
          <DatePicker label="Data de início" value={dados.dataInicio} onChange={(valor) => alterar("dataInicio", valor)} error={erros.dataInicio} required />
          <DatePicker label="Data de fim" value={dados.dataFim} onChange={(valor) => alterar("dataFim", valor)} min={dados.dataInicio || undefined} error={erros.dataFim} />
        </div>
        <div className="ui-field">
          <span id="tarefa-prioridade-label" className="ui-field-label">Prioridade</span>
          <div className={styles.prioridades} role="radiogroup" aria-labelledby="tarefa-prioridade-label">
            {PRIORIDADES_TAREFAS.map((opcao) => <label key={opcao.id} className={`ui-choice ui-role-card ${styles.prioridade}`} data-prioridade={opcao.id}>
              <input type="radio" name="tarefa-prioridade" value={opcao.id} checked={dados.prioridade === opcao.id} onChange={() => alterar("prioridade", opcao.id)} />
              <Flag size={14} aria-hidden="true" fill={opcao.id === "urgente" ? "currentColor" : "none"} /><span>{opcao.titulo}</span>
            </label>)}
          </div>
        </div>
        <TextareaField label="Descrição" maxLength={2000} placeholder="Adicione detalhes da atividade (opcional)" value={dados.descricao} error={erros.descricao} onChange={(evento) => alterar("descricao", evento.target.value)} />
      </form>
    </Dialog>
  </div>;
}
