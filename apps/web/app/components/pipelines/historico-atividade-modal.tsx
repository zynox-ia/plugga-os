"use client";

import { activityHistoryResponseSchema, type Activity, type ActivityHistoryEntry, type PipelinePerson } from "@plugga/shared";
import { useEffect, useState } from "react";
import { lerErro } from "../../lib/clientes";
import { formatarDataHoraCurta } from "../../lib/format";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import styles from "./atividades-do-negocio.module.css";

const ROTULO = { created: "Criada", updated: "Atualizada", completed: "Concluída", reopened: "Reaberta" } as const;

export function HistoricoAtividadeModal({ atividade, pessoas, aoFechar }: { atividade: Activity; pessoas: PipelinePerson[]; aoFechar: () => void }) {
  const [entradas, setEntradas] = useState<ActivityHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pagina, setPagina] = useState<string | undefined>();
  const [tentativa, setTentativa] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true); setErro(null);
    async function carregar() {
      try {
        const query = new URLSearchParams({ limit: "30" }); if (pagina) query.set("cursor", pagina);
        const resposta = await fetch(`/api/atividades/${atividade.id}/historico?${query}`, { cache: "no-store", signal: controller.signal });
        const dados: unknown = await resposta.json().catch(() => null);
        if (!resposta.ok) { if (!controller.signal.aborted) setErro(lerErro(dados, "Não foi possível carregar o histórico.").mensagem); return; }
        const historico = activityHistoryResponseSchema.safeParse(dados);
        if (!historico.success) { setErro("Não foi possível interpretar o histórico."); return; }
        if (!controller.signal.aborted) {
          setEntradas((anteriores) => [...new Map([...anteriores, ...historico.data.entries].map((entrada) => [entrada.id, entrada])).values()]);
          setCursor(historico.data.nextCursor);
        }
      } catch { if (!controller.signal.aborted) setErro("Sem conexão para carregar o histórico."); }
      finally { if (!controller.signal.aborted) setCarregando(false); }
    }
    void carregar(); return () => controller.abort();
  }, [atividade.id, pagina, tentativa]);
  return <Dialog title="Histórico da atividade" description={`${atividade.title} · horários de Manaus`} cancelText="Fechar" onClose={aoFechar}>
    <div className={styles.bloco}>
      {erro ? <div role="alert"><p>{erro}</p><Button variant="secondary" onClick={() => setTentativa((valor) => valor + 1)}>Tentar novamente</Button></div> : null}
      <ol className={styles.historico}>{entradas.map((entrada) => <li key={entrada.id}><div className={styles.bloco}>
        <strong>{ROTULO[entrada.kind]} · rodada {entrada.snapshot.currentRound.number}</strong>
        <span className={styles.meta}>{formatarDataHoraCurta(entrada.occurredAt)} · {pessoas.find((pessoa) => pessoa.id === entrada.actor.id)?.name ?? "Autor indisponível"}</span>
        <span className={styles.meta}>Responsável: {pessoas.find((pessoa) => pessoa.id === entrada.snapshot.currentRound.ownerId)?.name ?? "Pessoa indisponível"} · Prazo: {formatarDataHoraCurta(entrada.snapshot.currentRound.dueAt)}</span>
        {entrada.snapshot.currentRound.outcome ? <p>{entrada.snapshot.currentRound.outcome.summary}</p> : null}
      </div></li>)}</ol>
      {carregando ? <p role="status">Carregando histórico…</p> : cursor ? <Button variant="secondary" onClick={() => setPagina(cursor)}>Carregar mais</Button> : !entradas.length && !erro ? <p>Sem registros disponíveis.</p> : null}
    </div>
  </Dialog>;
}
