"use client";

import type { DepartamentoComTarefas, OcorrenciaDeTarefa } from "@plugga/shared";
import { CalendarCheck, Check } from "lucide-react";
import { useState, type FormEvent } from "react";

import { problemasDoConcluir, ROTULO_DA_EMPRESA_DA_TAREFA } from "../../lib/tarefas";
import { Alert, Button, Checkbox, Dialog, FileDropzone, TextareaField } from "../ui";
import { concluirOcorrencia, problemaDaEvidencia } from "./envios";
import styles from "./tarefas.module.css";

/** Concluir a tarefa do dia: o checklist das instruções, o resultado e a evidência, quando a tarefa pede. */
export function ConcluirTarefa({ departamento, ocorrencia: o, aoCancelar, aoConcluir }: {
  departamento: DepartamentoComTarefas;
  ocorrencia: OcorrenciaDeTarefa;
  aoCancelar: () => void;
  aoConcluir: (o: OcorrenciaDeTarefa) => void;
}) {
  const [marcados, setMarcados] = useState<number[]>([]);
  const [resultado, setResultado] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erros, setErros] = useState<{ resultado?: string; evidencia?: string }>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const evidencia = arquivos.at(-1) ?? null;

  async function concluir(evento: FormEvent) {
    evento.preventDefault();
    const problemas = { ...problemasDoConcluir(o, resultado, Boolean(evidencia)) };
    const doArquivo = evidencia ? problemaDaEvidencia(evidencia) : null;
    if (doArquivo) problemas.evidencia = doArquivo;
    setErros(problemas);
    if (problemas.resultado || problemas.evidencia) return;
    setEnviando(true); setFalha(null);
    const r = await concluirOcorrencia(departamento, o.id, { resultado, checklist: marcados, evidencia });
    setEnviando(false);
    if (r.ok) { aoConcluir(r.dados); return; }
    setFalha(Object.values(r.erro.porCampo)[0] ? `${r.erro.mensagem} ${Object.values(r.erro.porCampo).join(" ")}` : r.erro.mensagem);
  }

  return <Dialog title="Concluir tarefa" size="estreita" icon={<CalendarCheck size={20} />} onClose={aoCancelar}
    description={`${o.titulo} · ${ROTULO_DA_EMPRESA_DA_TAREFA[o.empresa]}`}
    footer={<Button type="submit" form="form-concluir-tarefa" icon={<Check size={15} />} disabled={enviando}>{enviando ? "Enviando…" : "Concluir"}</Button>}>
    <form id="form-concluir-tarefa" className="ui-dialog-form" onSubmit={concluir} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      {o.instrucoes.length ? <fieldset className={styles.checklist}>
        <legend>Checklist</legend>
        {o.instrucoes.map((item, i) => <Checkbox key={i} label={item.texto} checked={marcados.includes(i)} className={styles.itemDoChecklist}
          onChange={(e) => setMarcados((xs) => (e.target.checked ? [...xs, i].sort((a, b) => a - b) : xs.filter((x) => x !== i)))} />)}
      </fieldset> : null}
      <TextareaField label="Resultado" required={o.exigeResultado} maxLength={2000} rows={3} autoFocus value={resultado}
        onChange={(e) => { setResultado(e.target.value); setErros((x) => ({ ...x, resultado: undefined })); }} error={erros.resultado} placeholder="O que foi feito ou encontrado" />
      <div className="ui-field">
        <FileDropzone label={o.exigeEvidencia ? "Evidência (obrigatório): PDF, JPG ou PNG até 25 MB" : "Evidência (opcional): PDF, JPG ou PNG até 25 MB"} value={evidencia ? [evidencia] : []}
          onChange={(xs) => { setArquivos(xs.slice(-1)); setErros((x) => ({ ...x, evidencia: undefined })); }} disabled={enviando} />
        {erros.evidencia ? <p className="ui-field-error" role="alert">Erro: {erros.evidencia}</p> : null}
      </div>
    </form>
  </Dialog>;
}
