"use client";

import type { OpcoesDaEngenhariaResposta, OrdemDeServico } from "@plugga/shared";
import { Ban, CalendarCheck, CalendarDays, Check, CheckCircle2, ClipboardPen, Clock, FileText, MapPin, Signature, Undo2, UserRound, Users, X, type LucideIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { dataEmManaus, diaLegivel, ROTULO_DA_EMPRESA } from "../../lib/compras";
import {
  ETAPAS_DA_TRILHA,
  HORARIOS_DE_AGENDAMENTO,
  passoNaTrilha,
  pendenciasDaOrdem,
  prazoDaOrdem,
  quandoNaFicha,
  ROTULO_DA_ETAPA_DA_TRILHA,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DA_SITUACAO,
  ROTULO_DO_TIPO,
  textoDaUsina,
  urlDoArquivoDaOrdem,
} from "../../lib/ordens-de-servico";
import { rotuloDaUc } from "../../lib/usinas";
import fichaCompras from "../compras/ficha-do-pedido.module.css";
import visao from "../pipelines/resumo-do-lead.module.css";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Button, DatePicker, TextareaField } from "../ui";
import styles from "./ficha-da-ordem.module.css";
import type { RespostaDaOrdem } from "./envios";
import { IconeDoTipo } from "./partes";
import { PdfAssinado, TermoNaTela, type TermoNaTelaRef } from "./termo-da-ordem";

const TOM = { ok: fichaCompras.prazoOk, hoje: fichaCompras.prazoHoje, vencido: fichaCompras.prazoVencido } as const;
const ROTULO_DA_ORIGEM = { manual: "Manual", monitoramento: "Monitoramento", crm: "CRM", robo: "Robô" } as const;

export type Agendamento = { tecnicoId: string; apoioId: string; data: string; horario: string };
export type Laudo = { encontrado: string; feito: string; recomendacao: string };

export type EstadoDaVisaoGeral = {
  agendamento: Agendamento; errosDoAgendamento: Partial<Record<keyof Agendamento, string>>; aoAgendamento: (a: Agendamento) => void;
  laudo: Laudo; errosDoLaudo: Partial<Record<keyof Laudo, string>>; aoLaudo: (l: Laudo) => void;
  /** Agendada: o formulário de remarcar fica fechado até pedir. */
  remarcando: boolean; aoRemarcar: (sim: boolean) => void;
};

function Trilha({ ordem }: { ordem: OrdemDeServico }) {
  const cancelada = ordem.situacao === "cancelada";
  const atual = passoNaTrilha(ordem.situacao, ordem.cancelamento?.situacaoAnterior);
  const concluida = ordem.situacao === "concluida";
  return <>
    <ol className={`${visao.trilha} ${fichaCompras.trilha}`} aria-label="Etapas da O.S.">
      {ETAPAS_DA_TRILHA.map((etapa, i) => {
        const aqui = i === atual;
        const passou = i < atual || concluida;
        return <li key={etapa} aria-current={aqui && !cancelada ? "step" : undefined} data-anterior={(passou && !aqui) || undefined} data-cancelada={(aqui && cancelada) || undefined}>
          <button type="button" disabled>
            <span className={visao.marcador} aria-hidden="true">{aqui && cancelada ? <X size={12} /> : passou && !(aqui && !concluida) ? <Check size={12} /> : i + 1}</span>
            <span>{ROTULO_DA_ETAPA_DA_TRILHA[etapa]}
              {aqui && ordem.situacao === "adiada" ? <small className={fichaCompras.nota}>adiada</small> : null}
              {aqui && cancelada ? <small className={`${fichaCompras.nota} ${fichaCompras.notaPerigo}`}>cancelada aqui</small> : null}
            </span>
          </button>
        </li>;
      })}
    </ol>
    {/* No celular, a posição e a barra no lugar dos 5 pontos. */}
    <div className={fichaCompras.trilhaCompacta}>
      <p><strong>{Math.min(atual + 1, 5)} de 5</strong> · {ROTULO_DA_SITUACAO[ordem.situacao]}</p>
      <div className={fichaCompras.passoBarra} role="progressbar" aria-label="Etapas da O.S." aria-valuemin={0} aria-valuemax={5} aria-valuenow={Math.min(atual + 1, 5)}>
        <span style={{ width: `${(Math.min(atual + 1, 5) / 5) * 100}%` }} />
      </div>
    </div>
  </>;
}

/** O que falta para avançar: prazo, técnico e o checklist da etapa (protótipo aprovado). */
function PainelDoPasso({ ordem, hoje }: { ordem: OrdemDeServico; hoje: string }) {
  const itens = pendenciasDaOrdem(ordem);
  if (itens.length === 0) return null;
  const feitos = itens.filter((i) => i.feito).length;
  const prazo = prazoDaOrdem(ordem, hoje);
  return <section className={fichaCompras.passo} aria-label="O que falta para avançar">
    <div className={fichaCompras.passoTopo}>
      <div>
        <span className={fichaCompras.passoRotulo}>O que falta</span>
        <p><strong className={prazo.tom === "ok" ? undefined : TOM[prazo.tom]}>{prazo.texto}</strong><span className={fichaCompras.muted}> · prazo {diaLegivel(ordem.prazo)}</span></p>
      </div>
      <span className={fichaCompras.passoQuem}><UserRound size={13} aria-hidden="true" /><span><span className="sr-only">Técnico: </span>{ordem.tecnico?.nome ?? "Sem técnico"}</span></span>
    </div>
    <div className={fichaCompras.passoBarra} role="progressbar" aria-label="Itens desta etapa concluídos" aria-valuemin={0} aria-valuemax={itens.length} aria-valuenow={feitos}>
      <span style={{ width: `${(feitos / itens.length) * 100}%` }} />
    </div>
    <ul className={fichaCompras.passoLista}>
      {itens.map((i) => <li key={i.texto} data-feito={i.feito || undefined}>
        {i.feito ? <CheckCircle2 size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
        <span><span className="sr-only">{i.feito ? "Feito: " : "Falta: "}</span>{i.texto}</span>
      </li>)}
    </ul>
  </section>;
}

function Destaque({ icone: Icone, titulo, tom, children }: { icone: LucideIcon; titulo: string; tom?: "perigo" | "ok"; children: ReactNode }) {
  return <section className={`${visao.destaque} ${fichaCompras.acao} ${tom === "perigo" ? fichaCompras.acaoPerigo : tom === "ok" ? fichaCompras.acaoOk : ""}`} aria-label={titulo}>
    <h3><Icone size={15} aria-hidden="true" />{titulo}</h3>
    {children}
  </section>;
}

function FormularioDeAgendamento({ ordem, opcoes, hoje, estado, ocupado }: { ordem: OrdemDeServico; opcoes: OpcoesDaEngenhariaResposta | null; hoje: string; estado: EstadoDaVisaoGeral; ocupado: boolean }) {
  const a = estado.agendamento;
  const erros = estado.errosDoAgendamento;
  const tecnicos = (opcoes?.tecnicos ?? []).map((p) => ({ value: p.id, label: p.nome, icon: <UserRound /> }));
  const mudar = (parcial: Partial<Agendamento>) => estado.aoAgendamento({ ...a, ...parcial });
  return <div className={styles.camposDoAgendamento}>
    <CampoDeMenu label="Técnico" required icon={<UserRound />} placeholder="Selecione o técnico" value={a.tecnicoId || undefined} onChange={(v) => mudar({ tecnicoId: v, apoioId: a.apoioId === v ? "" : a.apoioId })} options={tecnicos} error={erros.tecnicoId} disabled={ocupado || !opcoes} />
    <CampoDeMenu label="Apoio" icon={<Users />} placeholder="Sem apoio" value={a.apoioId || "sem"} onChange={(v) => mudar({ apoioId: v === "sem" ? "" : v })}
      options={[{ value: "sem", label: "Sem apoio", icon: <Users /> }, ...tecnicos.filter((t) => t.value !== a.tecnicoId)]} disabled={ocupado || !opcoes} />
    <DatePicker label="Data" required min={hoje} value={a.data} onChange={(v) => mudar({ data: v })} error={erros.data} disabled={ocupado} />
    <CampoDeMenu label="Horário" required icon={<Clock />} placeholder="Escolha o horário" value={a.horario || undefined} onChange={(v) => mudar({ horario: v })}
      options={HORARIOS_DE_AGENDAMENTO.map((h) => ({ value: h, label: h, icon: <Clock /> }))} error={erros.horario} disabled={ocupado} />
    {ordem.situacao === "agendada" ? <p className={`${fichaCompras.muted} ${styles.largo}`}>Remarcar mantém a O.S. em Agendadas e registra a mudança na linha do tempo.</p> : null}
  </div>;
}

/** O bloco da etapa atual: agendar, check-in, laudo, termo, ou o encerramento. */
type DoTermo = { termo: RefObject<TermoNaTelaRef | null>; aoPdfAssinado: (r: RespostaDaOrdem) => void };

function AcaoDaEtapa({ ordem, opcoes, hoje, estado, ocupado, aoVerEvidencias, termo, aoPdfAssinado }: { ordem: OrdemDeServico; opcoes: OpcoesDaEngenhariaResposta | null; hoje: string; estado: EstadoDaVisaoGeral; ocupado: boolean; aoVerEvidencias: () => void } & DoTermo) {
  const pode = (a: OrdemDeServico["acoesPermitidas"][number]) => ordem.acoesPermitidas.includes(a);
  switch (ordem.situacao) {
    case "cancelada": {
      const c = ordem.cancelamento;
      return <Destaque icone={Ban} titulo="O.S. cancelada" tom="perigo">
        <p>Cancelada{c?.por ? ` por ${c.por.nome}` : ""}{c ? ` em ${dataEmManaus(c.em)}` : ""}{c ? `, quando estava em ${ROTULO_DA_SITUACAO[c.situacaoAnterior]}` : ""}.</p>
        {c ? <p className={fichaCompras.motivo}><strong>Motivo:</strong> {c.motivo}</p> : null}
      </Destaque>;
    }
    case "concluida": return <Destaque icone={CheckCircle2} titulo="O.S. concluída" tom="ok">
      <p>Concluída{ordem.concluidaEm ? ` em ${dataEmManaus(ordem.concluidaEm)}` : ""}{ordem.termo?.nome ? `, com o termo assinado por ${ordem.termo.nome}${ordem.termo.documentoMascarado ? ` (${ordem.termo.documentoMascarado})` : ""}` : ordem.termo ? ", com o termo assinado à parte" : ""}.</p>
      {ordem.termo ? <a className={fichaCompras.anexo} href={urlDoArquivoDaOrdem(ordem.termo.pdf.url)} target="_blank" rel="noopener noreferrer"><FileText size={13} aria-hidden="true" /><span>Termo em PDF</span></a> : null}
      <p className={fichaCompras.muted}>Concluída não reabre: para continuar o serviço, abra outra O.S. ligada a esta.</p>
    </Destaque>;
    case "aberta":
      return pode("agendar") ? <Destaque icone={CalendarDays} titulo="Agendar">
        <p>Escolha quem vai e quando. A O.S. aparece na agenda do técnico.</p>
        <FormularioDeAgendamento ordem={ordem} opcoes={opcoes} hoje={hoje} estado={estado} ocupado={ocupado} />
      </Destaque> : null;
    case "adiada": {
      const ad = ordem.adiamento;
      return <Destaque icone={Undo2} titulo={pode("agendar") ? "Reagendar" : "O.S. adiada"}>
        {ad ? <p>Adiada{ad.por ? ` por ${ad.por.nome}` : ""} em {dataEmManaus(ad.em)} para <strong>{diaLegivel(ad.novaData)}</strong>.</p> : null}
        {ad ? <p className={fichaCompras.motivo}><strong>Motivo:</strong> {ad.motivo}</p> : null}
        {pode("agendar") ? <FormularioDeAgendamento ordem={ordem} opcoes={opcoes} hoje={hoje} estado={estado} ocupado={ocupado} /> : null}
      </Destaque>;
    }
    case "agendada":
      return <Destaque icone={MapPin} titulo={estado.remarcando ? "Remarcar" : "Check-in no local"}>
        <p>Agendada para <strong>{quandoNaFicha(ordem.agendadaPara, hoje)}</strong>{ordem.tecnico ? ` com ${ordem.tecnico.nome}` : ""}{ordem.apoio ? ` e ${ordem.apoio.nome} de apoio` : ""}. {estado.remarcando ? "" : "Faça o check-in ao chegar ao local."}</p>
        {estado.remarcando ? <FormularioDeAgendamento ordem={ordem} opcoes={opcoes} hoje={hoje} estado={estado} ocupado={ocupado} />
          : pode("agendar") ? <div className={fichaCompras.botoes}><Button variant="secondary" size="sm" icon={<CalendarCheck size={14} />} disabled={ocupado} onClick={() => estado.aoRemarcar(true)}>Remarcar</Button></div> : null}
      </Destaque>;
    case "em_campo": {
      const l = estado.laudo;
      const erros = estado.errosDoLaudo;
      const fotos = ordem.fotos.length;
      return <Destaque icone={ClipboardPen} titulo="Registrar o laudo">
        <p>O que foi encontrado e o que foi feito, com as fotos do campo.</p>
        <TextareaField label="Encontrado" required maxLength={4000} rows={2} value={l.encontrado} onChange={(e) => estado.aoLaudo({ ...l, encontrado: e.target.value })} error={erros.encontrado} placeholder="Ex.: conector MC4 derretido na string 3" disabled={ocupado} />
        <TextareaField label="Feito" required maxLength={4000} rows={2} value={l.feito} onChange={(e) => estado.aoLaudo({ ...l, feito: e.target.value })} error={erros.feito} placeholder="Ex.: troca dos conectores e reaperto da string box" disabled={ocupado} />
        <TextareaField label="Recomendação" maxLength={4000} rows={2} value={l.recomendacao} onChange={(e) => estado.aoLaudo({ ...l, recomendacao: e.target.value })} placeholder="Opcional" disabled={ocupado} />
        <p className={fotos ? fichaCompras.muted : fichaCompras.prazoVencido}>{fotos ? `${fotos} ${fotos === 1 ? "foto enviada" : "fotos enviadas"}.` : "O laudo exige ao menos uma foto."}{" "}
          <button type="button" className={styles.link} onClick={aoVerEvidencias}>{fotos ? "Ver as evidências" : "Enviar fotos"}</button></p>
      </Destaque>;
    }
    case "laudo": {
      const laudo = ordem.laudo;
      return <Destaque icone={Signature} titulo="Termo do cliente">
        {laudo ? <dl className={styles.laudo}>
          <div><dt>Encontrado:</dt><dd>{laudo.encontrado}</dd></div>
          <div><dt>Feito:</dt><dd>{laudo.feito}</dd></div>
          {laudo.recomendacao ? <div><dt>Recomendação:</dt><dd>{laudo.recomendacao}</dd></div> : null}
        </dl> : null}
        {pode("colher_termo") ? <>
          <TermoNaTela ref={termo} ordem={ordem} desligado={ocupado} />
          <PdfAssinado ordem={ordem} desligado={ocupado} aoEnviar={aoPdfAssinado} />
        </> : <p className={fichaCompras.muted}>Falta o termo assinado pelo cliente, que conclui a O.S.</p>}
      </Destaque>;
    }
  }
}

/** Visão geral da ficha: indicadores e trilha, o que falta, a ação da etapa, os dados e o rodapé com as ações. */
export function VisaoGeralDaOrdem({ ordem, opcoes, hoje, ocupado, estado, aoVerEvidencias, termo, aoPdfAssinado }: {
  ordem: OrdemDeServico; opcoes: OpcoesDaEngenhariaResposta | null; hoje: string; ocupado: boolean; estado: EstadoDaVisaoGeral;
  aoVerEvidencias: () => void;
} & DoTermo) {
  const quando = ordem.situacao === "adiada" && ordem.adiamento ? diaLegivel(ordem.adiamento.novaData) : quandoNaFicha(ordem.agendadaPara, hoje);
  const prazo = prazoDaOrdem(ordem, hoje);
  const encerrada = ordem.situacao === "concluida" || ordem.situacao === "cancelada";
  return <div className={visao.resumo}>
    <section aria-label="Indicadores da O.S." className={visao.indicadores}>
      <header className={visao.identidade}>
        <span className={visao.iconeNegocio} aria-hidden="true"><IconeDoTipo tipo={ordem.tipo} /></span>
        <div className={visao.identidadeTexto}>
          <p className={visao.muted}>{ordem.codigo} · {ordem.descricao}</p>
          <span className={visao.etapaAtual}>{ROTULO_DA_SITUACAO[ordem.situacao]}</span>
        </div>
        <div className={`${visao.valor} ${fichaCompras.valorDoPedido}`}>
          <span><span className="sr-only">{ordem.situacao === "adiada" ? "Nova data: " : "Agenda: "}</span>{quando}</span>
          <small className={!encerrada && prazo.tom === "vencido" ? fichaCompras.prazoVencido : undefined}>{!encerrada && prazo.tom === "vencido" ? `atrasada · prazo ${diaLegivel(ordem.prazo)}` : `prazo ${diaLegivel(ordem.prazo)}`}</small>
        </div>
      </header>
      <Trilha ordem={ordem} />
    </section>

    {encerrada ? null : <PainelDoPasso ordem={ordem} hoje={hoje} />}

    <AcaoDaEtapa ordem={ordem} opcoes={opcoes} hoje={hoje} estado={estado} ocupado={ocupado} aoVerEvidencias={aoVerEvidencias} termo={termo} aoPdfAssinado={aoPdfAssinado} />

    <section aria-label="Dados da O.S.">
      <dl className={visao.grade}>
        <div><dt>Empresa</dt><dd>{ROTULO_DA_EMPRESA[ordem.empresa]}</dd></div>
        <div><dt>Tipo</dt><dd>{ROTULO_DO_TIPO[ordem.tipo]}</dd></div>
        <div><dt>Cliente</dt><dd>{ordem.cliente.nome}{ordem.uc ? <small>{rotuloDaUc(ordem.uc.codigo)} · {ordem.uc.distribuidora}</small> : null}</dd></div>
        {ordem.usina ? <div><dt>Usina</dt><dd>{ordem.usina.nome}<small>{textoDaUsina(ordem.usina)}</small></dd></div> : null}
        {ordem.obra ? <div><dt>Obra</dt><dd>{ordem.obra.nome}</dd></div> : null}
        {ordem.usinaDoComissionamento ? <div><dt>Usina cadastrada</dt><dd>{ordem.usinaDoComissionamento.nome}<small>Cadastrada a partir deste comissionamento</small></dd></div> : null}
        <div><dt>Local</dt><dd>{ordem.local ?? "Não informado"}</dd></div>
        <div><dt>Técnico</dt><dd>{ordem.tecnico?.nome ?? "Sem técnico"}{ordem.apoio ? <small>Apoio: {ordem.apoio.nome}</small> : null}</dd></div>
        <div><dt>Prioridade</dt><dd>{ROTULO_DA_PRIORIDADE[ordem.prioridade]}</dd></div>
        <div><dt>Origem</dt><dd>{ROTULO_DA_ORIGEM[ordem.origem]}{ordem.canal ? <small>{ordem.canal}</small> : null}</dd></div>
        <div><dt>Aberta</dt><dd>{dataEmManaus(ordem.criada.em)}{ordem.criada.por ? <small>por {ordem.criada.por.nome}</small> : null}</dd></div>
        {ordem.ordemAnterior ? <div><dt>Continua</dt><dd>{ordem.ordemAnterior.codigo}</dd></div> : null}
      </dl>
    </section>

    <section className={visao.secao} aria-label="Descrição do serviço">
      <h3>Descrição</h3>
      <p className={visao.notas}>{ordem.descricao}</p>
    </section>
  </div>;
}
