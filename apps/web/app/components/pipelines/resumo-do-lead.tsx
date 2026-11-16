"use client";

import type { Activity as Atividade, Deal, LeadProposal, LeadSolarProject, Pipeline, SolarPendency } from "@plugga/shared";
import { useEffect, useState, type CSSProperties } from "react";
import { Activity, ArrowUpRight, BriefcaseBusiness, History, Info, MessageSquare, Target, Zap } from "lucide-react";
import { cargaParaRender, iniciarCarga, type Carga } from "../../lib/carga-por-chave";
import { ROTULO_ORIGEM, telefoneFormatado } from "../../lib/clientes";
import { formatarBRL, formatarDataHoraCurta, formatarNumero } from "../../lib/format";
import { listarProjetosSolaresDoLead, ROTULO_INSTALACAO_SOLAR } from "../../lib/projetos-solares-lead";
import { carregarPropostas, codigoProposta } from "../../lib/propostas-lead";
import { Button } from "../ui/button";
import { displayDate } from "../ui/date-value";
import styles from "./detalhes-do-lead-modal.module.css";

export function ProximaAcaoDoLead({ atividade, responsavel, carregando, erro, aoVerAtividades }: {
  atividade: Atividade | null; responsavel?: string; carregando: boolean; erro: boolean; aoVerAtividades: () => void;
}) {
  return <div className={styles.proximaAcaoSuperior}>
    <div className={styles.faixaProximaAcao}>
      <span className={styles.iconeFaixa} aria-hidden="true"><Target size={19} /></span>
      <div className={styles.descricaoProximaAcao}><h3>Próxima ação</h3><p>{carregando ? "Carregando atividades…" : erro ? "Não foi possível consultar as atividades." : atividade ? `${atividade.title} · ${formatarDataHoraCurta(atividade.currentRound.dueAt)} (Manaus) · ${responsavel ?? "Responsável indisponível"}` : "Sem próxima atividade."}</p></div>
      <div className={styles.acoesProximaAcao}>
        <Button variant="secondary" size="sm" icon={<ArrowUpRight size={14} />} onClick={aoVerAtividades}>Ver atividades</Button>
      </div>
    </div>
  </div>;
}

/** Lê uma lista do negócio só quando `habilitado`; falha vira "erro" e o campo mostra que não foi possível consultar. */
function useLista<T>(negocioId: string, versao: number | undefined, habilitado: boolean, ler: (id: string, signal: AbortSignal) => Promise<T[]>): Carga<T[]> {
  const chave = `${negocioId}:${versao ?? ""}:${habilitado}`;
  const [guardado, setGuardado] = useState<{ chave: string; carga: Carga<T[]> }>(() => ({ chave, carga: { estado: habilitado ? "carregando" : "ok", dados: [] } }));
  useEffect(() => {
    if (!habilitado) { setGuardado({ chave, carga: { estado: "ok", dados: [] } }); return; }
    return iniciarCarga(chave, negocioId, ler, setGuardado);
    // `ler` fica fora: é sempre listarProjetosSolaresDoLead ou carregarPropostas, função exportada
    // de módulo (mesma referência em toda chamada), nunca recriada por render.
  }, [negocioId, versao, habilitado]);
  // Deriva no próprio render: se a chave guardada ainda é de outro negócio/versão, o efeito da
  // consulta atual ainda não concluiu — não mostra o dado antigo nem espera o próximo render.
  return cargaParaRender(guardado.chave, chave, guardado.carga, habilitado);
}

const ausente = (texto: string) => <span className={styles.dadoAusente}>{texto}</span>;

function resumoDoProjeto(projeto: LeadSolarProject): string {
  const partes = [ROTULO_INSTALACAO_SOLAR[projeto.installationType], `${formatarNumero(projeto.averageConsumptionKwh)} kWh/mês`];
  if (projeto.estimatedPowerKwp) partes.push(`${formatarNumero(projeto.estimatedPowerKwp)} kWp`);
  return partes.join(" · ");
}

const ROTULO_PROPOSTA: Record<LeadProposal["status"], string> = { draft: "Rascunho", generated: "PDF gerado" };

export function CabecalhoResumoDoLead({ negocio, pipeline, pendencias = [] }: { negocio: Deal; pipeline?: Pipeline; pendencias?: SolarPendency[] }) {
  const solar = pipeline?.processProfile?.key === "solar_commercial";
  const projetos = useLista(negocio.id, negocio.version, solar, listarProjetosSolaresDoLead);
  const propostas = useLista(negocio.id, negocio.version, solar, carregarPropostas);
  const projeto = projetos.dados[0];
  const proposta = [...propostas.dados].sort((a, b) => b.number - a.number)[0];
  const aberto = negocio.status === "open";
  const mostraPendencia = solar && aberto && pendencias.length > 0;
  // Subgrid (grid-template-rows) exige que o cartão reserve exatamente o nº de trilhas que ele
  // ocupa: tituloBloco (1) + solicitacaoResumo (1) + as linhas do dl (display:contents, então cada
  // <div> do dl soma uma trilha própria no mesmo subgrid). Base sem Solar: 2 + Telefone + Origem do
  // lead = 4. Com Solar: +1 (Projeto Solar) = 5. Com pendência também: +1 (Para avançar) = 6.
  // O card "Indicadores" (título + 4 linhas, sem variação) continua no padrão de 5 via var() com fallback.
  const linhasResumo = 4 + (solar ? 1 : 0) + (mostraPendencia ? 1 : 0);

  return <div className={styles.resumoSuperior}>
    <div className={styles.gradeResumoComercial}>
      <section className={styles.cartaoResumo} aria-label="Resumo comercial" style={{ "--linhas-resumo": linhasResumo } as CSSProperties}>
        <h3 className={styles.tituloBloco}><BriefcaseBusiness size={16} aria-hidden="true" />Resumo comercial</h3>
        <div className={styles.solicitacaoResumo}><p>{negocio.title}</p></div>
        <dl className={styles.dadosComerciais}>
          <div><dt>Telefone</dt><dd>{negocio.lead.phone ? telefoneFormatado(negocio.lead.phone) : ausente("Não informado")}</dd></div>
          <div><dt>Origem do lead</dt><dd>{negocio.lead.origin ? (ROTULO_ORIGEM[negocio.lead.origin as keyof typeof ROTULO_ORIGEM] ?? negocio.lead.origin) : ausente("Não informada")}</dd></div>
          {solar ? <div><dt>Projeto Solar</dt><dd>{projetos.estado === "carregando" ? ausente("Carregando…") : projetos.estado === "erro" ? ausente("Não foi possível consultar") : projeto ? <>{resumoDoProjeto(projeto)}{projetos.dados.length > 1 ? ` (+${projetos.dados.length - 1})` : ""}</> : ausente("Nenhum projeto cadastrado")}</dd></div> : null}
          {mostraPendencia ? <div><dt>Para avançar</dt><dd>{pendencias.map((item) => item.message).join(" ")}</dd></div> : null}
        </dl>
      </section>
      <section className={styles.cartaoResumo} aria-label="Indicadores do negócio">
        <h3 className={styles.tituloBloco}><Activity size={16} aria-hidden="true" />Indicadores do negócio</h3>
        <dl className={styles.indicadoresResumo}>
          <div><dt>Valor do negócio</dt><dd className={styles.indicadorDestaque}>{negocio.value !== null ? formatarBRL(negocio.value) : "Não informado"}</dd></div>
          <div><dt>Probabilidade</dt><dd className={styles.dadoAusente}>Não informada</dd></div>
          <div><dt>Previsão de fechamento</dt><dd>{negocio.expectedCloseDate ? displayDate(negocio.expectedCloseDate) : ausente("Não informada")}</dd></div>
          <div><dt>Proposta comercial</dt><dd>{solar ? (propostas.estado === "carregando" ? ausente("Carregando…") : propostas.estado === "erro" ? ausente("Não foi possível consultar") : proposta ? `${codigoProposta(proposta)} · ${ROTULO_PROPOSTA[proposta.status]}${proposta.content.amount ? ` · ${formatarBRL(proposta.content.amount)}` : ""}` : ausente("Nenhuma proposta")) : ausente("Não disponível")}</dd></div>
        </dl>
      </section>
    </div>
  </div>;
}

export function ResumoDoLead({
  aoVerHistorico,
}: {
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
  </>;
}
