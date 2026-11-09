"use client";

import { listDealHistoryResponseSchema, type DealHistoryEntry, type DealHistoryValue } from "@plugga/shared";
import { ArrowRight, Archive, CircleCheck, CircleX, Flag, GitPullRequestArrow, History, MessageSquare, Paperclip, Pencil, UserRound, UserRoundPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { enviar } from "../../lib/clientes";
import { formatarBRL, formatarDataHora } from "../../lib/format";
import { agruparHistoricoPorDia, formatarHoraHistorico } from "../../lib/historico-lead";
import { Button } from "../ui/button";
import { displayDate } from "../ui/date-value";
import styles from "./historico-do-lead.module.css";

const CAMPOS: Record<string, string> = { "lead.companyName": "Empresa", "lead.landlinePhone": "Telefone fixo", "lead.website": "Site", "lead.mainInterest": "Segmento / interesse principal", "lead.jobTitle": "Cargo / função do contato", title: "Título", value: "Investimento", expectedCloseDate: "Previsão de fechamento", ownerId: "Responsável", owner: "Responsável", tagIds: "Etiquetas", tags: "Etiquetas", contact: "Contato", "lead.name": "Nome do lead", "lead.email": "E-mail", "lead.phone": "Telefone", "lead.origin": "Origem", "lead.notes": "Anotações", "lead.document": "Documento", "lead.legalName": "Razão social", "lead.personType": "Tipo de pessoa", "lead.street": "Logradouro", "lead.city": "Cidade", "lead.state": "UF", "lead.postalCode": "CEP", "lead.district": "Bairro", "lead.addressComplement": "Complemento" };
const EVENTOS = {
  created: { acao: "cadastrou este lead", icone: UserRoundPlus },
  stage_changed: { acao: "alterou a etapa do negócio", icone: GitPullRequestArrow },
  priority_changed: { acao: "alterou a prioridade", icone: Flag },
  document_added: { acao: "adicionou um documento", icone: Paperclip },
  document_archived: { acao: "arquivou um documento", icone: Archive },
  client_converted: { acao: "converteu o lead em cliente", icone: UserRoundPlus },
  won: { acao: "marcou o negócio como ganho", icone: CircleCheck },
  lost: { acao: "marcou o negócio como perdido", icone: CircleX },
  transferred: { acao: "alterou o pipeline", icone: ArrowRight },
  field_changed: { acao: "atualizou", icone: Pencil },
};
const PRIORIDADES = { urgente: "Urgente", medio: "Médio", normal: "Normal" };
function valor(valor: DealHistoryValue): string {
  if (valor === null || valor === "") return "Não informado";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "string") return valor;
  return Array.isArray(valor) ? valor.map((item) => item.name).join(", ") || "Nenhuma" : valor.name;
}

function AtividadeHistorico({ entrada }: { entrada: DealHistoryEntry }) {
  const anotacao = entrada.kind === "field_changed" && entrada.field === "lead.notes";
  const Icone = anotacao ? MessageSquare : EVENTOS[entrada.kind].icone;
  const nome = entrada.actor?.name ?? "Autor não informado";
  function valorCampo(conteudo: DealHistoryValue) {
    if (typeof conteudo === "string" && conteudo !== "") {
      if (entrada.field === "value") return formatarBRL(conteudo);
      if (entrada.field === "expectedCloseDate") return displayDate(conteudo) || conteudo;
    }
    return valor(conteudo);
  }
  return <li className={styles.historicoEvento}>
    <span className={styles.historicoIcone} aria-hidden="true"><Icone size={16} /></span>
    <time className={styles.historicoHora} dateTime={entrada.occurredAt} title={formatarDataHora(entrada.occurredAt)}>{formatarHoraHistorico(entrada.occurredAt)}</time>
    <div className={styles.historicoConteudo}>
      <div className={styles.historicoLinha}>
        <span className={styles.historicoAvatar} aria-hidden="true">{entrada.actor ? nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase() : <UserRound size={13} />}</span>
        <p><strong>{nome}</strong> {EVENTOS[entrada.kind].acao}
          {entrada.kind === "field_changed" ? <> <strong>{entrada.field?.startsWith("custom:") ? entrada.field.slice(7) : entrada.field ? CAMPOS[entrada.field] ?? "um campo do cadastro" : "os dados do lead"}</strong></> : null}
          {entrada.kind === "priority_changed" ? <> para <strong>{entrada.toPriority ? PRIORIDADES[entrada.toPriority] : "Sem prioridade"}</strong></> : null}
        </p>
      </div>
      {anotacao ? <div className={`${styles.historicoDetalhe} ${styles.historicoAnotacao}`}>{valor(entrada.after)}</div> : entrada.kind === "field_changed" ? <div className={`${styles.historicoDetalhe} ${styles.historicoMudanca}`}><span>{valorCampo(entrada.before)}</span><ArrowRight size={14} aria-label="alterado para" /><strong>{valorCampo(entrada.after)}</strong></div> : null}
      {entrada.fromStageName || entrada.toStageName ? <div className={`${styles.historicoDetalhe} ${styles.historicoMudanca}`}><span className={styles.historicoEtapa}>{entrada.fromStageName ?? "Sem etapa"}</span><ArrowRight size={14} aria-label="alterado para" /><span className={styles.historicoEtapa}>{entrada.toStageName ?? "Sem etapa"}</span></div> : null}
      {entrada.fromPipelineName || entrada.toPipelineName ? <div className={`${styles.historicoDetalhe} ${styles.historicoMudanca}`}><span className={styles.historicoEtapa}>{entrada.fromPipelineName ?? "Sem pipeline"}</span><ArrowRight size={14} aria-label="alterado para" /><span className={styles.historicoEtapa}>{entrada.toPipelineName ?? "Sem pipeline"}</span></div> : null}
      {(entrada.kind === "document_added" || entrada.kind === "document_archived") && entrada.after ? <div className={styles.historicoDetalhe}><span className={styles.historicoArquivo}><Paperclip size={14} aria-hidden="true" />{valor(entrada.after)}</span></div> : null}
    </div>
  </li>;
}

export function HistoricoDoLead({ id, ativo, revisao }: { id: string; ativo: boolean; revisao: number }) {
  const [entradas, setEntradas] = useState<DealHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async (proximo?: string) => {
    setCarregando(true); setErro(null);
    const resposta = await enviar<unknown>(`/api/leads/${id}/historico?limit=30${proximo ? `&cursor=${encodeURIComponent(proximo)}` : ""}`, "GET");
    setCarregando(false);
    if (!resposta.ok) { setErro(resposta.erro.mensagem); return; }
    const dados = listDealHistoryResponseSchema.safeParse(resposta.dados);
    if (!dados.success) { setErro("Não foi possível interpretar o histórico."); return; }
    setEntradas((atuais) => proximo ? [...atuais, ...dados.data.entries.filter((item) => !atuais.some((existente) => existente.id === item.id))] : dados.data.entries);
    setCursor(dados.data.nextCursor); setCarregado(true);
  }, [id]);
  useEffect(() => { if (ativo) void carregar(); }, [ativo, revisao, carregar]);
  return <section className={styles.historico} aria-label="Histórico do lead" aria-busy={carregando}>
    {erro ? <div role="alert" className="aviso aviso--erro">{erro} <Button size="sm" variant="secondary" disabled={carregando} onClick={() => void carregar()}>Tentar novamente</Button></div> : null}
    {carregado && !carregando && !erro && !entradas.length ? <div className={styles.historicoVazio}><History size={24} aria-hidden="true" /><h3>Nenhuma atividade registrada</h3><p>As alterações deste lead aparecerão aqui, com data e autoria.</p></div> : null}
    {agruparHistoricoPorDia(entradas).map((grupo) => <section key={grupo.data} className={styles.historicoDia} aria-label={grupo.rotulo}>
      <h3 className={styles.historicoData}>{grupo.rotulo}</h3>
      <ol className={styles.historicoLista}>{grupo.entradas.map((entrada) => <AtividadeHistorico key={entrada.id} entrada={entrada} />)}</ol>
    </section>)}
    {cursor ? <Button size="sm" variant="secondary" loading={carregando} onClick={() => void carregar(cursor)}>Carregar mais atividades</Button> : null}
  </section>;
}
