"use client";

import type { OpcoesDaEngenhariaResposta, OrdemDeServicoResumo } from "@plugga/shared";
import { CalendarCheck, Clock, UserRound, Users } from "lucide-react";
import { useState, type FormEvent } from "react";

import { diaLegivel } from "../../lib/compras";
import { agoraEmManaus, HORARIOS_DE_AGENDAMENTO, problemasDoAgendamento, ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog } from "../ui";
import { agirNaOrdem } from "./envios";

/**
 * Agendar uma O.S. direto da Agenda de campo (PLU-346): técnico, apoio, data e
 * horário, com as regras da ficha (nada no passado). A adiada vem com a nova data.
 */
export function AgendarOrdem({ ordem, opcoes, hoje, aoCancelar, aoAgendar }: {
  ordem: OrdemDeServicoResumo;
  opcoes: OpcoesDaEngenhariaResposta | null;
  hoje: string;
  aoCancelar: () => void;
  aoAgendar: (codigo: string) => void;
}) {
  const [tecnicoId, setTecnicoId] = useState(ordem.tecnico?.id ?? "");
  const [apoioId, setApoioId] = useState(ordem.apoio?.id ?? "");
  const [data, setData] = useState(ordem.novaData && ordem.novaData >= hoje ? ordem.novaData : "");
  const [horario, setHorario] = useState("08:00");
  const [erros, setErros] = useState<Partial<Record<"tecnicoId" | "data" | "horario", string>>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const tecnicos = (opcoes?.tecnicos ?? []).map((p) => ({ value: p.id, label: p.nome, icon: <UserRound /> }));

  async function agendar(evento: FormEvent) {
    evento.preventDefault();
    const problemas = problemasDoAgendamento({ tecnicoId, data, horario }, hoje, agoraEmManaus());
    setErros(problemas);
    if (Object.values(problemas).some(Boolean)) return;
    setEnviando(true); setFalha(null);
    const r = await agirNaOrdem(ordem.id, { acao: "agendar", tecnicoId, apoioId: apoioId || null, data, horario });
    setEnviando(false);
    if (r.ok) { aoAgendar(r.dados.codigo); return; }
    setFalha(Object.values(r.erro.porCampo)[0] ? `${r.erro.mensagem} ${Object.values(r.erro.porCampo).join(" ")}` : r.erro.mensagem);
  }

  return <Dialog title={`Agendar ${ordem.codigo}`} size="estreita" icon={<CalendarCheck size={20} />} onClose={aoCancelar}
    description={`${ROTULO_DO_TIPO[ordem.tipo]} · ${ordem.cliente.nome} · prazo ${diaLegivel(ordem.prazo)}`}
    footer={<Button type="submit" form="form-agendar-os" icon={<CalendarCheck size={15} />} disabled={enviando || !opcoes}>{enviando ? "Agendando…" : "Agendar"}</Button>}>
    <form id="form-agendar-os" className="ui-dialog-form" onSubmit={agendar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      {!opcoes ? <Alert tone="warning" title="Não foi possível carregar os técnicos. Recarregue a página." /> : null}
      <CampoDeMenu label="Técnico" required icon={<UserRound />} placeholder="Selecione o técnico" value={tecnicoId || undefined} onChange={(v) => { setTecnicoId(v); if (apoioId === v) setApoioId(""); setErros((e) => ({ ...e, tecnicoId: undefined })); }} options={tecnicos} error={erros.tecnicoId} />
      <CampoDeMenu label="Apoio" icon={<Users />} value={apoioId || "sem"} onChange={(v) => setApoioId(v === "sem" ? "" : v)}
        options={[{ value: "sem", label: "Sem apoio", icon: <Users /> }, ...tecnicos.filter((t) => t.value !== tecnicoId)]} />
      <DatePicker label="Data" required min={hoje} value={data} onChange={(v) => { setData(v); setErros((e) => ({ ...e, data: undefined })); }} error={erros.data} />
      <CampoDeMenu label="Horário" required icon={<Clock />} value={horario} onChange={(v) => { setHorario(v); setErros((e) => ({ ...e, horario: undefined })); }}
        options={HORARIOS_DE_AGENDAMENTO.map((h) => ({ value: h, label: h, icon: <Clock /> }))} error={erros.horario} />
    </form>
  </Dialog>;
}
