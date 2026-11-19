"use client";

import type { Activity as Atividade, Deal, LeadSolarProject, Pipeline, PipelinePerson, SolarPendency } from "@plugga/shared";
import { useEffect, useState } from "react";
import { ArrowUpRight, BriefcaseBusiness, Check, ClipboardList, Flag, Mail, Pencil, Phone, Sparkles, Target, Trophy, X } from "lucide-react";
import { cargaParaRender, iniciarCarga, type Carga } from "../../lib/carga-por-chave";
import { ROTULO_ORIGEM, telefoneFormatado } from "../../lib/clientes";
import { formatarBRL, formatarData, formatarDataHoraCurta, formatarNumero } from "../../lib/format";
import { listarProjetosSolaresDoLead, ROTULO_INSTALACAO_SOLAR } from "../../lib/projetos-solares-lead";
import { Avatar } from "./icones";
import { Button } from "../ui/button";
import { displayDate } from "../ui/date-value";
import styles from "./detalhes-do-lead-modal.module.css";
import visao from "./resumo-do-lead.module.css";
import { diasNaEtapa, estaParado } from "../../lib/negocios";
import type { ControleAtividadesDoNegocio } from "./use-atividades-do-negocio";

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



function resumoDoProjeto(projeto: LeadSolarProject): string {
  const partes = [ROTULO_INSTALACAO_SOLAR[projeto.installationType], `${formatarNumero(projeto.averageConsumptionKwh)} kWh/mês`];
  if (projeto.estimatedPowerKwp) partes.push(`${formatarNumero(projeto.estimatedPowerKwp)} kWp`);
  return partes.join(" · ");
}

export function ResumoDoLead({
  negocio, pipeline, pendencias = [], atividades, proxima, responsaveis, bloqueado, aoVerAtividades,
  aoMover, aoGanhar, aoPerder, aoAdicionarAnotacao,
}: {
  negocio: Deal;
  pipeline: Pipeline;
  pendencias?: SolarPendency[];
  atividades: Pick<ControleAtividadesDoNegocio, "atividades" | "carregando" | "erro">;
  proxima: Atividade | null;
  responsaveis: PipelinePerson[];
  bloqueado: boolean;
  aoVerAtividades: () => void;
  aoMover: (id: string) => void;
  aoGanhar: () => void;
  aoPerder: () => void;
  aoAdicionarAnotacao: (texto: string) => Promise<boolean>;
}) {
  const [anotacao, setAnotacao] = useState("");
  const [erroAnotacao, setErroAnotacao] = useState(false);
  const solar = pipeline.processProfile?.key === "solar_commercial";
  const projetos = useLista(negocio.id, negocio.version, solar, listarProjetosSolaresDoLead);
  const projeto = projetos.dados[0];
  const etapas = [...pipeline.stages, { id: "ganho", name: pipeline.wonLabel }];
  const indiceEtapa = etapas.findIndex((etapa) => etapa.id === (negocio.status === "won" ? "ganho" : negocio.stageId));
  const nomeEtapa = etapas[indiceEtapa]?.name;
  const encerrado = negocio.status !== "open";
  const situacao = negocio.status === "lost" ? pipeline.lostLabel : nomeEtapa;
  const parado = estaParado(negocio, pipeline);
  const origem = negocio.lead.origin;
  const contato = negocio.contact ?? negocio.lead;
  const telefone = contato.phone?.replace(/\D/g, "");
  const recentes = [...atividades.atividades].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const estadoProjeto = projetos.estado === "carregando" ? "Carregando…"
    : projetos.estado === "erro" ? "Não foi possível consultar"
      : projeto ? resumoDoProjeto(projeto) : "Nenhum projeto cadastrado";
  const resumo = pendencias.length ? pendencias.map((item) => item.message).join(" ")
    : [encerrado ? situacao : nomeEtapa ? "Na etapa " + nomeEtapa : null,
      proxima ? "Próxima atividade: " + proxima.title : null,
      projeto ? resumoDoProjeto(projeto) : null].filter(Boolean).join(" · ");

  return (
    <div className={visao.resumo}>
      <section aria-label="Indicadores do negócio" className={visao.indicadores}>
        <header className={visao.identidade}>
          <span className={visao.iconeNegocio} aria-hidden="true"><BriefcaseBusiness size={24} /></span>
          <div>
            <p className={visao.muted}>PLU-{String(negocio.number).padStart(4, "0")} · {negocio.title}</p>
            <h3>{negocio.lead.name}</h3>
            {situacao ? <span className={visao.etapaAtual}>{situacao}</span> : null}
          </div>
        </header>

        <div className={visao.valor}>
          <span><span className="sr-only">Valor do negócio: </span>{negocio.value === null ? "Valor não informado" : formatarBRL(negocio.value)}</span>
          {negocio.closedAt ? <small>Fechado em {formatarData(negocio.closedAt)}</small>
            : parado ? <small className={visao.parado}>Parado há {diasNaEtapa(negocio)} dias</small> : null}
        </div>

        {negocio.status !== "lost" ? (
          <ol className={visao.trilha} aria-label="Etapas do negócio">
            {etapas.map((item, indice) => {
              const atual = indice === indiceEtapa;
              return (
                <li key={item.id} aria-current={atual ? "step" : undefined} data-anterior={indice < indiceEtapa || undefined}>
                  <button type="button" disabled={encerrado || bloqueado || atual} onClick={() => item.id === "ganho" ? aoGanhar() : aoMover(item.id)}>
                    <span className={visao.marcador} aria-hidden="true">{indice < indiceEtapa ? <Check size={15} /> : indice + 1}</span>
                    <span>{item.name}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
      </section>

      <section className={visao.destaque} aria-label="Resumo do negócio">
        <h3><Sparkles size={15} aria-hidden="true" />Resumo do negócio</h3>
        <p>{resumo || "Acompanhe o negócio pelas atividades registradas."}</p>
      </section>

      <section aria-label="Resumo comercial">
        <dl className={visao.grade}>
          <div><dt>Previsão de fechamento</dt><dd>{negocio.expectedCloseDate ? displayDate(negocio.expectedCloseDate) : "Não informada"}</dd></div>
          <div><dt>Responsável</dt><dd className={visao.responsavel}><Avatar id={negocio.owner.id} nome={negocio.owner.name} tamanho="pequeno" />{negocio.owner.name}</dd></div>
          <div><dt>{solar ? "Sistema" : "Negócio"}</dt><dd>{solar ? estadoProjeto : negocio.title}</dd></div>
          <div><dt>Origem do lead</dt><dd>{origem ? (ROTULO_ORIGEM[origem as keyof typeof ROTULO_ORIGEM] ?? origem) : "Não informada"}<small>Aberto em {formatarData(negocio.createdAt)}</small></dd></div>
        </dl>
      </section>

      <section className={visao.secao} aria-label="Próximo passo">
        <h3>Próximo passo</h3>
        <button type="button" className={visao.proximo} onClick={aoVerAtividades}>
          <Flag size={16} aria-hidden="true" />
          <span>{atividades.carregando ? "Carregando atividades…" : atividades.erro ? "Consultar atividades" : proxima?.title ?? "Agendar próxima atividade"}</span>
          <Pencil size={15} aria-hidden="true" />
        </button>
      </section>

      <section className={visao.contato} aria-label="Contato">
        <Avatar id={negocio.id} nome={contato.name} />
        <div>
          <strong>{contato.name}</strong>
          <small>{[contato.jobTitle, contato.phone && telefoneFormatado(contato.phone)].filter(Boolean).join(" · ") || "Contato do lead"}</small>
        </div>
        {contato.email ? <a href={"mailto:" + contato.email} aria-label={"Enviar e-mail para " + contato.name}><Mail size={16} aria-hidden="true" /></a> : null}
        {telefone ? <a href={"tel:" + telefone} aria-label={"Ligar para " + contato.name}><Phone size={16} aria-hidden="true" /></a> : null}
      </section>

      <section className={visao.secao} aria-label="Atividades">
        <h3>Atividades</h3>
        <form className={visao.anotacao} onSubmit={async (evento) => {
          evento.preventDefault();
          const texto = anotacao.trim();
          if (!texto || bloqueado) return;
          const salvou = await aoAdicionarAnotacao(texto);
          setErroAnotacao(!salvou);
          if (salvou) setAnotacao("");
        }}>
          <input className="ui-input" value={anotacao} maxLength={2000} disabled={bloqueado}
            onChange={(evento) => { setAnotacao(evento.target.value); setErroAnotacao(false); }}
            aria-label="Adicionar anotação" placeholder="Adicionar anotação…" />
          <Button size="sm" type="submit" disabled={bloqueado || !anotacao.trim()}>Adicionar</Button>
        </form>
        {erroAnotacao ? <p className={visao.parado} role="alert">Não foi possível adicionar a anotação. O texto foi mantido.</p> : null}
        {negocio.lead.notes ? <p className={visao.notas}>{negocio.lead.notes}</p> : null}
        {atividades.carregando || atividades.erro || !recentes.length ? (
          <p className={visao.muted}>{atividades.carregando ? "Carregando atividades…" : atividades.erro ? "Não foi possível consultar as atividades." : "Nenhuma atividade registrada."}</p>
        ) : (
          <ol className={visao.atividades}>
            {recentes.map((atividade) => (
              <li key={atividade.id}>
                <span className={visao.iconeAtividade} aria-hidden="true"><ClipboardList size={15} /></span>
                <div>
                  <p>{atividade.title}</p>
                  <small>{responsaveis.find((pessoa) => pessoa.id === atividade.createdBy.id)?.name ?? (atividade.createdBy.type === "system" ? "Sistema" : "Autor não informado")} · {formatarDataHoraCurta(atividade.createdAt)}</small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {!encerrado ? (
        <footer className={visao.rodape}>
          <Button size="sm" variant="secondary" icon={<X size={15} />} disabled={bloqueado} onClick={aoPerder}>Marcar como {pipeline.lostLabel.toLowerCase()}</Button>
          <Button size="sm" icon={<Trophy size={15} />} disabled={bloqueado} onClick={aoGanhar}>Marcar como {pipeline.wonLabel.toLowerCase()}</Button>
        </footer>
      ) : null}
    </div>
  );
}
