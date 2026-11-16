"use client";

import type { Activity, CompleteActivityRequest, PipelinePerson } from "@plugga/shared";
import { useEffect, useRef, useState } from "react";
import type { ErroDoFormulario } from "../../lib/clientes";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { TextareaField } from "../ui/fields";
import { agendamentoInicial, agendamentoParaEnvio, CamposAgendamento, validarAgendamento } from "./agendamento-atividade-form";
import styles from "./atividades-do-negocio.module.css";

export function ConcluirAtividadeModal({ atividade, pessoas, salvando, erro, aoConcluir, aoAlterarRascunho, aoFechar }: {
  atividade: Activity; pessoas: PipelinePerson[]; salvando: boolean; erro: ErroDoFormulario | null;
  aoConcluir: (dados: Omit<CompleteActivityRequest, "version" | "roundId">) => Promise<boolean>; aoFechar: () => void;
  aoAlterarRascunho: (alterado: boolean) => void;
}) {
  const [resultado, setResultado] = useState("");
  const [agendarProxima, setAgendarProxima] = useState(false);
  const [proxima, setProxima] = useState(() => agendamentoInicial(atividade.currentRound.ownerId));
  const [erros, setErros] = useState<Record<string, string>>({});
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => { aoAlterarRascunho(resultado !== "" || agendarProxima); }, [resultado, agendarProxima, aoAlterarRascunho]);
  useEffect(() => () => aoAlterarRascunho(false), [aoAlterarRascunho]);
  const errosProxima = Object.fromEntries(Object.entries(erro?.porCampo ?? {}).filter(([campo]) => campo.startsWith("nextAction.")).map(([campo, mensagem]) => [campo.slice(11), mensagem]));
  return <Dialog title="Concluir atividade" description={atividade.title} onClose={() => { if (!salvando) aoFechar(); }}
    footer={<Button variant="primary" disabled={salvando} onClick={() => formulario.current?.requestSubmit()}>{salvando ? "Concluindo…" : "Concluir atividade"}</Button>}>
    <form ref={formulario} className="ui-dialog-form" onSubmit={async (evento) => {
      evento.preventDefault();
      const validacao = agendarProxima ? validarAgendamento(proxima, pessoas) : {};
      if (!resultado.trim()) validacao.summary = "Registre o resultado e a evidência da atividade.";
      setErros(validacao);
      if (Object.keys(validacao).length) return;
      if (await aoConcluir({ outcome: { summary: resultado.trim(), documentIds: [] }, ...(agendarProxima ? { nextAction: agendamentoParaEnvio(proxima) } : {}) })) aoFechar();
    }}>
      {erro ? <p className="aviso aviso--erro" role="alert">{erro.mensagem}{erro.codigo === "CONFLITO_ESTADO" ? " Feche este formulário e recarregue as atividades para conferir a versão atual." : ""}</p> : null}
      <TextareaField label="Resultado e evidência" required maxLength={2000} disabled={salvando} value={resultado} error={erros.summary ?? erro?.porCampo["outcome.summary"]} hint="Descreva o que foi feito, a informação obtida e como foi confirmada." onChange={(evento) => setResultado(evento.target.value)} />
      <label className="ui-checkbox"><input type="checkbox" checked={agendarProxima} disabled={salvando} onChange={(evento) => setAgendarProxima(evento.target.checked)} /><span>Agendar a próxima atividade</span></label>
      {agendarProxima ? <section className={styles.bloco} aria-label="Próxima atividade"><h4>Próxima atividade</h4><CamposAgendamento dados={proxima} aoAlterar={setProxima} pessoas={pessoas} erros={{ ...errosProxima, ...erros }} bloqueado={salvando} /></section> : null}
    </form>
  </Dialog>;
}
