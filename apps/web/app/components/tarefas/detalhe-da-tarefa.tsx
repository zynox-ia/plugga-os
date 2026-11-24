"use client";

import type { DepartamentoComTarefas, OcorrenciaDeTarefa, Tarefa } from "@plugga/shared";
import { Ban, CalendarCheck, CheckCircle2, Paperclip, XCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { dataEmManaus } from "../../lib/compras";
import { horarioEmManaus } from "../../lib/ordens-de-servico";
import { diaCurtoDaTarefa, prazoDaOcorrencia, ROTULO_DA_EMPRESA_DA_TAREFA, urlDaEvidencia } from "../../lib/tarefas";
import { Alert, Button, Dialog, TextareaField } from "../ui";
import { encerrarTarefa, lerTarefa } from "./envios";
import { SeloDaTarefa } from "./partes";
import styles from "./tarefas.module.css";

/**
 * A tarefa aberta: a definição (recorrência, responsável, instruções, próximas
 * ocorrências), o que foi feito na ocorrência concluída (resultado, checklist e
 * evidências) e o encerrar, para quem pode.
 */
export function DetalheDaTarefa({ departamento, ocorrencia: o, hoje, aoFechar, aoEncerrar }: {
  departamento: DepartamentoComTarefas;
  ocorrencia: OcorrenciaDeTarefa;
  hoje: string;
  aoFechar: () => void;
  aoEncerrar: (t: Tarefa) => void;
}) {
  const [tarefa, setTarefa] = useState<Tarefa | null>(null);
  const [encerrando, setEncerrando] = useState(false);
  useEffect(() => {
    let vivo = true;
    void lerTarefa(departamento, o.tarefaId).then((r) => { if (vivo && r.ok) setTarefa(r.dados); });
    return () => { vivo = false; };
  }, [departamento, o.tarefaId]);

  const prazo = prazoDaOcorrencia(o, hoje);
  const c = o.conclusao;
  return <>
    <Dialog title={o.titulo} size="media" icon={<CalendarCheck size={20} />} onClose={aoFechar} cancelText="Fechar"
      description={`${o.recorrenciaTexto} · ${ROTULO_DA_EMPRESA_DA_TAREFA[o.empresa]}`}
      footer={o.acoesPermitidas.includes("encerrar") && !tarefa?.encerrada
        ? <Button variant="secondary" className={styles.botaoPerigo} icon={<Ban size={15} />} onClick={() => setEncerrando(true)}>Encerrar tarefa</Button> : undefined}>
      <div className={styles.detalhe}>
        <dl className={styles.dados}>
          <div><dt>Situação</dt><dd><SeloDaTarefa situacao={o.situacao} /></dd></div>
          <div><dt>Prazo</dt><dd>{prazo.dia}<small className={prazo.tom ? styles.perigo : undefined}>{prazo.detalhe}</small></dd></div>
          <div><dt>Responsável</dt><dd>{o.responsavel.nome}{o.substituto ? <small>Substituto: {o.substituto.nome}</small> : null}</dd></div>
          <div><dt>O que conta como feito</dt><dd>{[o.exigeResultado ? "resultado" : null, o.exigeEvidencia ? "evidência" : null].filter(Boolean).join(" e ") || "—"}{o.automacao ? <small>Conclui sozinha quando o trabalho é feito na tela dele.</small> : null}</dd></div>
          {o.categoria ? <div><dt>Categoria</dt><dd>{o.categoria}</dd></div> : null}
          {tarefa ? <div><dt>Criada</dt><dd>{dataEmManaus(tarefa.criada.em)}{tarefa.criada.por ? <small>por {tarefa.criada.por.nome}</small> : <small>rotina do departamento</small>}</dd></div> : null}
        </dl>

        {c ? <section className={styles.secaoDetalhe} aria-label="O que foi feito">
          <h3><CheckCircle2 size={15} aria-hidden="true" />{c.automatica ? "Concluída sozinha" : "O que foi feito"}</h3>
          <p className={styles.muted}>{c.automatica ? `Às ${horarioEmManaus(c.em)}, quando o trabalho foi feito na tela dele.` : `Às ${horarioEmManaus(c.em)} de ${dataEmManaus(c.em)}${c.por ? `, por ${c.por.nome}` : ""}.`}</p>
          {c.resultado ? <p className={styles.resultado}>{c.resultado}</p> : null}
          {c.checklist.length ? <ul className={styles.listaFeita}>{c.checklist.map((item, i) => <li key={i} data-feito={item.feito || undefined}>
            {item.feito ? <CheckCircle2 size={14} aria-hidden="true" /> : <XCircle size={14} aria-hidden="true" />}<span><span className="sr-only">{item.feito ? "Feito: " : "Não marcado: "}</span>{item.texto}</span>
          </li>)}</ul> : null}
          {c.evidencias.length ? <ul className={styles.evidencias}>{c.evidencias.map((e) => <li key={e.id}>
            <a href={urlDaEvidencia(e.url)} target="_blank" rel="noopener noreferrer"><Paperclip size={13} aria-hidden="true" /><span>{e.nome}</span></a>
          </li>)}</ul> : null}
        </section> : o.instrucoes.length ? <section className={styles.secaoDetalhe} aria-label="Instruções">
          <h3>Instruções</h3>
          <ol className={styles.instrucoes}>{o.instrucoes.map((item, i) => <li key={i}>{item.texto}</li>)}</ol>
        </section> : null}

        {tarefa?.encerrada ? <Alert tone="warning" title={`Encerrada em ${dataEmManaus(tarefa.encerrada.em)}${tarefa.encerrada.por ? ` por ${tarefa.encerrada.por.nome}` : ""}`}>{tarefa.encerrada.motivo}</Alert>
          : tarefa && tarefa.tipo === "recorrente" && tarefa.proximas.length ? <section className={styles.secaoDetalhe} aria-label="Próximas ocorrências">
            <h3>Próximas ocorrências</h3>
            <div className={styles.previa}>{tarefa.proximas.map((d) => <span key={d} className={d === hoje ? styles.ocorrenciaHoje : undefined}>{diaCurtoDaTarefa(d, hoje)} · {tarefa.horarioLimite}</span>)}</div>
          </section> : null}
      </div>
    </Dialog>
    {encerrando ? <EncerrarTarefa departamento={departamento} ocorrencia={o} aoCancelar={() => setEncerrando(false)}
      aoEncerrar={(t) => { setEncerrando(false); setTarefa(t); aoEncerrar(t); }} /> : null}
  </>;
}

/** Encerrar pede o motivo: a recorrente para de gerar ocorrências; as pendentes de hoje em diante saem da lista. */
function EncerrarTarefa({ departamento, ocorrencia: o, aoCancelar, aoEncerrar }: { departamento: DepartamentoComTarefas; ocorrencia: OcorrenciaDeTarefa; aoCancelar: () => void; aoEncerrar: (t: Tarefa) => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function encerrar(evento: FormEvent) {
    evento.preventDefault();
    if (!motivo.trim()) { setErro("informe o motivo."); return; }
    setEnviando(true); setFalha(null);
    const r = await encerrarTarefa(departamento, o.tarefaId, motivo.trim());
    setEnviando(false);
    if (r.ok) aoEncerrar(r.dados);
    else setFalha(r.erro.mensagem);
  }
  return <Dialog title="Encerrar tarefa" size="estreita" variant="danger" icon={<Ban size={20} />} onClose={aoCancelar} cancelText="Voltar"
    description={o.tipo === "recorrente" ? "Ela para de se repetir, e as pendentes de hoje em diante saem da lista. Não dá para desfazer." : "Ela sai da lista. Não dá para desfazer."}
    footer={<Button type="submit" form="form-encerrar-tarefa" variant="danger" disabled={enviando}>{enviando ? "Enviando…" : "Encerrar tarefa"}</Button>}>
    <form id="form-encerrar-tarefa" className="ui-dialog-form" onSubmit={encerrar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <TextareaField label="Motivo" required maxLength={500} autoFocus value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(null); }} error={erro ?? undefined}
        placeholder="Ex.: a rotina passou para o robô" />
    </form>
  </Dialog>;
}
