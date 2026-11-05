"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { Activity, ArrowUpRight, BriefcaseBusiness, History, Info, MessageSquare, Phone, Target, Zap } from "lucide-react";
import { telefoneFormatado } from "../../lib/clientes";
import { formatarBRL } from "../../lib/format";
import { Button } from "../ui/button";
import { displayDate } from "../ui/date-value";
import styles from "./detalhes-do-lead-modal.module.css";

export function ProximaAcaoDoLead({ aoVerCadastro }: { negocio: Deal; aoVerCadastro: () => void }) {
  return <div className={styles.proximaAcaoSuperior}>
    <div className={styles.faixaProximaAcao}>
      <span className={styles.iconeFaixa} aria-hidden="true"><Target size={19} /></span>
      <div className={styles.descricaoProximaAcao}><h3>Próxima ação</h3><p>Próxima ação não informada.</p></div>
      <div className={styles.acoesProximaAcao}>
        <Button variant="secondary" size="sm" icon={<ArrowUpRight size={14} />} onClick={aoVerCadastro}>Ver anotações</Button>
      </div>
    </div>
  </div>;
}

export function CabecalhoResumoDoLead({ negocio }: { negocio: Deal }) {
  return <div className={styles.resumoSuperior}>
    <div className={styles.gradeResumoComercial}>
      <section className={styles.cartaoResumo} aria-label="Resumo comercial">
        <h3 className={styles.tituloBloco}><BriefcaseBusiness size={16} aria-hidden="true" />Resumo comercial</h3>
        <div className={styles.solicitacaoResumo}><p>{negocio.title}</p></div>
        <dl className={styles.dadosComerciais}>
          <div><dt>Solicitação / dor</dt><dd className={styles.dadoAusente}>Não informada</dd></div>
          <div><dt>Solução indicada</dt><dd className={styles.dadoAusente}>Não informada</dd></div>
          <div><dt>Impedimento</dt><dd className={styles.dadoAusente}>Não informado</dd></div>
        </dl>
      </section>
      <section className={styles.cartaoResumo} aria-label="Indicadores do negócio">
        <h3 className={styles.tituloBloco}><Activity size={16} aria-hidden="true" />Indicadores do negócio</h3>
        <dl className={styles.indicadoresResumo}>
          <div><dt>Valor do negócio</dt><dd className={styles.indicadorDestaque}>{negocio.value !== null ? formatarBRL(negocio.value) : "Não informado"}</dd></div>
          <div><dt>Probabilidade</dt><dd className={styles.dadoAusente}>Não informada</dd></div>
          <div><dt>Previsão de fechamento</dt><dd>{negocio.expectedCloseDate ? displayDate(negocio.expectedCloseDate) : <span className={styles.dadoAusente}>Não informada</span>}</dd></div>
          <div><dt>Proposta comercial</dt><dd className={styles.dadoAusente}>Não disponível</dd></div>
        </dl>
      </section>
    </div>
  </div>;
}

export function ResumoDoLead({
  negocio,
  aoVerHistorico,
}: {
  negocio: Deal;
  pipeline?: Pipeline;
  aoMover?: (etapaId: string) => void;
  bloqueado?: boolean;
  aoVerHistorico: () => void;
}) {
  return <>
    <div className={styles.gradeVisaoGeral}>
      <section className={styles.cartaoDetalhe} aria-label="Diagnóstico energético">
        <div className={styles.cabecalhoBloco}>
          <h3 className={styles.tituloBloco}><Zap size={16} aria-hidden="true" />Diagnóstico energético</h3>
          <span className={styles.seloSemDados}>Não vinculado</span>
        </div>
        <div className={styles.diagnosticoGrade}>
          <div className={styles.diagnosticoItem}>
            <span className={styles.diagnosticoRotulo}>Distribuidora</span>
            <span className={styles.diagnosticoValorVazio}>Não informada</span>
          </div>
          <div className={styles.diagnosticoItem}>
            <span className={styles.diagnosticoRotulo}>Unidades Consumidoras</span>
            <span className={styles.diagnosticoValorVazio}>—</span>
          </div>
          <div className={styles.diagnosticoItem}>
            <span className={styles.diagnosticoRotulo}>Consumo Médio</span>
            <span className={styles.diagnosticoValorVazio}>— kWh/mês</span>
          </div>
          <div className={styles.diagnosticoItem}>
            <span className={styles.diagnosticoRotulo}>Modalidade Tarifária</span>
            <span className={styles.diagnosticoValorVazio}>Não classificada</span>
          </div>
        </div>
        <div className={styles.cartaoRodape}>
          <span className={styles.notaDiscreta}>
            <Info size={13} aria-hidden="true" />
            Dados técnicos vinculados a faturas e UCs do lead.
          </span>
        </div>
      </section>
      <section className={styles.cartaoDetalhe} aria-label="Últimas interações">
        <div className={styles.cabecalhoBloco}>
          <h3 className={styles.tituloBloco}><MessageSquare size={16} aria-hidden="true" />Últimas interações</h3>
          <span className={styles.seloSemDados}>Sem registros</span>
        </div>
        <div className={styles.timelineVazia}>
          <div className={styles.timelinePontoVazio} aria-hidden="true" />
          <div className={styles.timelineInfoVazia}>
            <p className={styles.timelineTituloVazio}>Nenhuma interação recente registrada</p>
            <span className={styles.timelineSubVazio}>Movimentações de etapa e anotações ficam salvas na auditoria completa.</span>
          </div>
        </div>
        <div className={styles.cartaoRodape}>
          <Button variant="secondary" size="sm" icon={<History size={14} />} onClick={aoVerHistorico}>Ver histórico completo</Button>
        </div>
      </section>
    </div>
    {negocio.lead.phone ? <div className={styles.contatosRodape}><span><Phone size={14} aria-hidden="true" />{telefoneFormatado(negocio.lead.phone)}</span></div> : null}
  </>;
}
