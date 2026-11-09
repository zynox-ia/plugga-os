"use client";

import { alcancaTela, type BulkDealsAction, type ClientDuplicateCandidate, type ConvertLeadResponse, type PipelinePerson, type CompanyKey, type Deal, type ListDealsResponse, type ListPipelinesResponse, type Pipeline } from "@plugga/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { enviar } from "../lib/clientes";
import { converterLead } from "../lib/conversao-lead";
import { hrefDaVisao, negocioConvertido, podeAtribuirLead, type Visao } from "../lib/negocios";
import { mesclarPipelineAtual } from "../lib/pipelines";
import type { TarefaDoLead } from "../lib/tarefas-lead";
import { useSessionUser } from "../lib/use-session-user";
import { Alert, Button, Dialog, IconPlus, IconSearch, IconSettings } from "./ui";
import { ConfiguracaoDePipelines } from "./pipelines/configuracao-de-pipelines";
import { moverCartao } from "./pipelines/arrasto-kanban";
import { GanhoDoNegocio, PerdaDoNegocio } from "./pipelines/encerrar-negocio";
import { Icone } from "./pipelines/icones";
import { EscolhaDeClienteNaConversao, SucessoDaConversao } from "./pipelines/modal-conversao-lead";
import { NovoNegocio } from "./pipelines/novo-negocio";
import { NavegacaoPipelines } from "./pipelines/navegacao-pipelines";
import { BarraRolagemMinimalista, QuadroDoPipeline, type AcoesDoNegocio } from "./pipelines/quadro-do-pipeline";
import { TransferirNegocio } from "./pipelines/transferir-negocio";
import { DetalhesDoLeadModal } from "./pipelines/detalhes-do-lead-modal";
import estilos from "./pipelines/tela-pipelines.module.css";

type Encerramento = { tipo: "ganho" | "perda" | "transferencia"; negocio: Deal };
type Conversao =
  | { tipo: "convite" | "enviando"; negocio: Deal }
  | { tipo: "erro"; negocio: Deal; mensagem: string }
  | { tipo: "escolha"; negocio: Deal; candidatos: ClientDuplicateCandidate[]; enviando: boolean; erro: string | null }
  | { tipo: "sucesso"; resultado: ConvertLeadResponse };

/**
 * Pipelines de venda: seletor de múltiplos funis e visões Kanban e Lista.
 * A configuração abre num modal pelo botão desta tela (PLU-269).
 * As ações mudam a tela na hora e confirmam na API;
 * se a API recusar, o negócio volta para onde estava.
 */
export function PipelinesView({
  pipelines,
  canCreateIn,
  selecionadoId,
  visao,
  negocios: doServidor,
  responsaveis,
}: {
  pipelines: Pipeline[];
  canCreateIn: CompanyKey[];
  selecionadoId: string | null;
  visao: Visao;
  negocios: Deal[];
  responsaveis: PipelinePerson[];
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const leadSelecionadoId = parametros.get("lead");
  const colunasRef = useRef<HTMLDivElement>(null);
  const prioridadesPendentes = useRef(new Set<string>());
  const movimentoPendente = useRef(false);
  const conversaoPendente = useRef(false);
  const configuracaoPendente = useRef(false);
  const { usuario } = useSessionUser();
  const podeVerClientes = alcancaTela(usuario?.acesso, "crm.clientes");
  const podeAtribuir = podeAtribuirLead(usuario?.acesso);
  const [busca, setBusca] = useState("");
  const [configurando, setConfigurando] = useState<{ tipo: "editar" | "novo"; dados: ListPipelinesResponse } | null>(null);
  const [negocios, setNegocios] = useState(doServidor);
  const [criando, setCriando] = useState<{ etapaId?: string } | null>(null);
  const [encerrando, setEncerrando] = useState<Encerramento | null>(null);
  const [convertendo, setConvertendo] = useState<Conversao | null>(null);
  const [tarefasPorLead, setTarefasPorLead] = useState<Record<string, TarefaDoLead[]>>({});
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => setNegocios(doServidor), [doServidor]);
  useEffect(() => {
    if (!aviso) return;
    const prazo = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(prazo);
  }, [aviso]);

  const ativos = pipelines.filter((p) => p.archivedAt === null);
  const selecionado = ativos.find((p) => p.id === selecionadoId) ?? null;
  const podeConfigurar = canCreateIn.length > 0 || pipelines.some((p) => p.canConfigure);

  async function abrirConfiguracao(tipo: "editar" | "novo") {
    if (configuracaoPendente.current) return;
    const pipelineId = selecionado?.id ?? pipelines.find((pipeline) => pipeline.canConfigure)?.id;
    if (tipo === "novo" || !pipelineId) {
      setConfigurando({ tipo, dados: { pipelines, canCreateIn, responsaveis } });
      return;
    }
    configuracaoPendente.current = true;
    const resposta = await enviar<ListPipelinesResponse>(`/api/pipelines?pipelineId=${encodeURIComponent(pipelineId)}`, "GET");
    configuracaoPendente.current = false;
    if (!resposta.ok) return setAviso(resposta.erro.mensagem);
    const atual = resposta.dados.pipelines.find((pipeline) => pipeline.id === pipelineId && pipeline.canConfigure);
    if (!atual) return setAviso("Você não pode mais configurar este pipeline.");
    setConfigurando({ tipo, dados: { ...resposta.dados, pipelines: mesclarPipelineAtual(pipelines, atual) } });
  }

  /** Troca os negócios atualizados na lista; quem foi para outro pipeline sai do quadro. */
  function aplicar(atualizados: Deal[]) {
    setNegocios((atuais) => {
      const porId = new Map(atualizados.map((n) => [n.id, n]));
      const novos = atualizados.filter((n) => !atuais.some((a) => a.id === n.id));
      return [...novos, ...atuais.map((n) => porId.get(n.id) ?? n)].filter((n) => n.pipelineId === selecionado?.id);
    });
  }

  function confirmado(atualizados: Deal[]) {
    aplicar(atualizados);
    router.refresh();
  }

  function abrirDetalhes(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("lead", id);
    else url.searchParams.delete("lead");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function fecharConversao() {
    const id = convertendo?.tipo === "sucesso" ? convertendo.resultado.lead.id : convertendo?.negocio.id;
    setConvertendo(null);
    requestAnimationFrame(() => {
      const alvo = document.querySelector<HTMLElement>(`[data-cartao-id="${id}"] button[aria-label^="Ver lead"]`)
        ?? document.querySelector<HTMLElement>('input[aria-label="Buscar negócios"]');
      alvo?.focus({ preventScroll: true });
    });
  }

  async function converter(negocio: Deal, destino?: string) {
    if (conversaoPendente.current) return;
    conversaoPendente.current = true;
    const escolha = convertendo?.tipo === "escolha" && convertendo.negocio.id === negocio.id ? convertendo : null;
    setConvertendo(escolha ? { ...escolha, enviando: true, erro: null } : { tipo: "enviando", negocio });
    const resposta = await converterLead(negocio, destino, podeVerClientes);
    conversaoPendente.current = false;
    if (resposta.ok) {
      confirmado([resposta.dados.lead]);
      setConvertendo({ tipo: "sucesso", resultado: resposta.dados });
    } else if (podeVerClientes && resposta.erro.candidatos?.length) {
      setConvertendo({ tipo: "escolha", negocio, candidatos: resposta.erro.candidatos, enviando: false, erro: null });
    } else if (escolha) {
      setConvertendo({ ...escolha, enviando: false, erro: resposta.erro.mensagem });
    } else {
      setConvertendo({ tipo: "erro", negocio, mensagem: resposta.erro.mensagem });
    }
  }

  const acoes: AcoesDoNegocio = {
    abrirDetalhes: (negocio) => abrirDetalhes(negocio.id),
    atualizar: (negocio) => aplicar([negocio]),
    async definirPrioridade(negocio, prioridade) {
      if (prioridadesPendentes.current.has(negocio.id)) return null;
      if (negocio.priority === prioridade) return negocio;
      prioridadesPendentes.current.add(negocio.id);
      setNegocios((atuais) => atuais.map((n) => n.id === negocio.id ? { ...n, priority: prioridade } : n));
      const resposta = await enviar<Deal>(`/api/leads/${negocio.id}/prioridade`, "PATCH", { priority: prioridade });
      if (resposta.ok) confirmado([resposta.dados]);
      else {
        setNegocios((atuais) => atuais.map((n) => n.id === negocio.id ? { ...n, priority: negocio.priority } : n));
        setAviso(resposta.erro.mensagem);
      }
      prioridadesPendentes.current.delete(negocio.id);
      return resposta.ok ? resposta.dados : null;
    },
    async moverEtapa(negocio, etapaId, antesDeId) {
      if (movimentoPendente.current) return null;
      const mudouEtapa = negocio.stageId !== etapaId;
      if (!mudouEtapa && antesDeId === undefined) return negocio;
      movimentoPendente.current = true;
      const etapaDestino = selecionado?.stages.find((e) => e.id === etapaId);
      const indiceOriginal = negocios.findIndex((n) => n.id === negocio.id);
      const seguinteOriginal = negocios.slice(indiceOriginal + 1).find((n) => n.stageId === negocio.stageId && n.status === "open")?.id ?? null;
      setNegocios((atuais) => moverCartao(atuais, negocio.id, etapaId, antesDeId, new Date().toISOString()));
      const resposta = await enviar<Deal>(`/api/leads/${negocio.id}/etapa`, "POST", { stageId: etapaId, beforeDealId: antesDeId });
      movimentoPendente.current = false;
      if (resposta.ok) {
        confirmado([resposta.dados]);
        if (mudouEtapa && etapaDestino?.asksClientConversion && !negocioConvertido(resposta.dados)) {
          if (leadSelecionadoId === negocio.id) abrirDetalhes(null);
          setConvertendo((atual) => atual ?? { tipo: "convite", negocio: resposta.dados });
        }
        return resposta.dados;
      }
      setNegocios((atuais) => moverCartao(atuais, negocio.id, negocio.stageId, seguinteOriginal, negocio.stageEnteredAt));
      setAviso(resposta.erro.mensagem);
      return null;
    },
    ganhar: (negocio) => setEncerrando({ tipo: "ganho", negocio }),
    perder: (negocio) => setEncerrando({ tipo: "perda", negocio }),
    transferir: (negocio) => setEncerrando({ tipo: "transferencia", negocio }),
    converter: (negocio) => { void converter(negocio); },
    convertendoId: convertendo?.tipo === "enviando" || (convertendo?.tipo === "escolha" && convertendo.enviando) ? convertendo.negocio.id : null,
    novoNaEtapa: (etapaId) => setCriando({ etapaId }),
    async emLote(ids: string[], action: BulkDealsAction) {
      const resposta = await enviar<ListDealsResponse>("/api/leads/lote", "POST", { dealIds: ids, action });
      if (resposta.ok) {
        confirmado(resposta.dados.deals);
        return true;
      }
      setAviso(resposta.erro.mensagem);
      return false;
    },
  };

  const concluir = (negocio: Deal) => {
    setEncerrando(null);
    confirmado([negocio]);
  };

  return (
    <div className={`pagina-pipelines ${estilos.pagina}`}>
      <header className={estilos.cabecalho}>
        <div className={estilos.tituloGrupo}>
          <h1 className={estilos.titulo}>Pipelines</h1>
          <h2 className={estilos.subtitulo}>Gerencie seus funis de vendas e oportunidades comerciais.</h2>
        </div>
        {selecionado ? (
          <div className={estilos.acoes}>
            <div className="equipe-busca">
              <IconSearch className="equipe-busca-icon" />
              <input
                type="search"
                className="equipe-busca-input"
                placeholder="Buscar negócio, cliente ou contato…"
                aria-label="Buscar negócios"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Button
              variant="primary"
              icon={<IconPlus />}
              aria-label="Novo lead"
              onClick={() => setCriando({})}
            >
              Novo lead
            </Button>
          </div>
        ) : null}
      </header>

      {convertendo?.tipo === "enviando" ? <span className="sr-only" role="status">Convertendo lead em cliente…</span> : null}
      {convertendo?.tipo === "convite" ? (
        <Dialog title="Deseja converter em cliente?" size="estreita" onClose={() => setConvertendo(null)} cancelText="Agora não"
          footer={<Button onClick={() => { void converter(convertendo.negocio); }}>Converter em cliente</Button>}>
          <p>{convertendo.negocio.lead.name}</p>
        </Dialog>
      ) : null}
      {convertendo?.tipo === "erro" ? (
        <Alert tone="danger" title="Não foi possível converter">
          <p>{convertendo.mensagem}</p>
          <div className="ui-dialog-actions">
            <Button variant="secondary" onClick={() => { abrirDetalhes(convertendo.negocio.id); setConvertendo(null); }}>Abrir dados do lead</Button>
            <Button variant="secondary" onClick={() => setConvertendo(null)}>Fechar</Button>
          </div>
        </Alert>
      ) : null}

      {selecionado ? (
        <>
          <NavegacaoPipelines
            pipelines={ativos}
            selecionado={selecionado}
            visao={visao}
            podeConfigurar={podeConfigurar}
            aoConfigurar={() => { void abrirConfiguracao("editar"); }}
            rolagem={visao === "kanban" ? <BarraRolagemMinimalista key={`${selecionado.id}-${selecionado.stages.length}`} containerRef={colunasRef} className={estilos.rolagem} /> : null}
          />
          {aviso ? (
            <p className="aviso aviso--erro aviso-flutuante" role="alert">
              {aviso}
            </p>
          ) : null}
          <QuadroDoPipeline
            key={selecionado.id}
            pipeline={selecionado}
            responsaveis={responsaveis}
            negocios={negocios}
            busca={busca}
            visao={visao}
            usuarioId={usuario?.id ?? null}
            acoes={acoes}
            colunasRef={colunasRef}
          />
        </>
      ) : (
        <section className="pipelines-vazio">
          <span className="pipelines-vazio-icone" aria-hidden="true">
            <Icone nome="etapas" tamanho={28} />
          </span>
          <h2>{podeConfigurar ? "Crie o primeiro pipeline" : "Nenhum pipeline para você ainda"}</h2>
          <p>
            {podeConfigurar
              ? "Organize seu processo de venda: escolha a empresa, as etapas e quem trabalha nele."
              : "Ainda não há pipelines ativos. Peça ao gerente do CRM para configurar um."}
          </p>
          {canCreateIn.length > 0 ? (
            <Button variant="primary" icon={<IconPlus />} onClick={() => { void abrirConfiguracao("novo"); }}>
              Criar pipeline
            </Button>
          ) : podeConfigurar ? (
            <Button variant="secondary" icon={<IconSettings />} onClick={() => { void abrirConfiguracao("editar"); }}>
              Configurar pipelines
            </Button>
          ) : null}
          {aviso ? <p className="aviso aviso--erro" role="alert">{aviso}</p> : null}
        </section>
      )}

      {configurando ? (
        <ConfiguracaoDePipelines
          pipelines={configurando.dados.pipelines}
          canCreateIn={configurando.dados.canCreateIn}
          inicialId={selecionado?.id ?? null}
          comecarNovo={configurando.tipo === "novo"}
          aoFechar={() => {
            setConfigurando(null);
            router.refresh();
          }}
        />
      ) : null}

      {criando && selecionado ? (
        <NovoNegocio
          pipelines={ativos}
          pipelineInicial={selecionado}
          etapaInicialId={criando.etapaId ?? null}
          usuarioId={usuario?.id ?? null}
          podeAtribuir={podeAtribuir}
          responsaveis={responsaveis}
          aoCriar={(negocio) => {
            setCriando(null);
            if (negocio.pipelineId === selecionado.id) confirmado([negocio]);
            else router.push(hrefDaVisao(negocio.pipelineId, visao));
          }}
          aoFechar={() => setCriando(null)}
        />
      ) : null}

      {encerrando?.tipo === "ganho" && selecionado ? (
        <GanhoDoNegocio pipeline={selecionado} negocio={encerrando.negocio} aoConcluir={concluir} aoFechar={() => setEncerrando(null)} />
      ) : null}
      {encerrando?.tipo === "perda" && selecionado ? (
        <PerdaDoNegocio pipeline={selecionado} negocio={encerrando.negocio} aoConcluir={concluir} aoFechar={() => setEncerrando(null)} />
      ) : null}
      {encerrando?.tipo === "transferencia" && selecionado ? (
        <TransferirNegocio podeAtribuir={podeAtribuir} responsaveis={responsaveis} pipelines={ativos} origem={selecionado} negocio={encerrando.negocio} aoConcluir={concluir} aoFechar={() => setEncerrando(null)} />
      ) : null}

      {convertendo?.tipo === "sucesso" ? (
        <SucessoDaConversao clienteNome={podeVerClientes ? convertendo.resultado.client?.name ?? null : null}
          aoFechar={fecharConversao}
        />
      ) : null}
      {podeVerClientes && convertendo?.tipo === "escolha" ? (
        <EscolhaDeClienteNaConversao candidatos={convertendo.candidatos} enviando={convertendo.enviando} erro={convertendo.erro}
          aoEscolher={(destino) => { void converter(convertendo.negocio, destino); }}
          aoFechar={() => { if (!conversaoPendente.current) fecharConversao(); }}
        />
      ) : null}
      {leadSelecionadoId && selecionado ? <DetalhesDoLeadModal podeAtribuir={podeAtribuir} key={leadSelecionadoId} negocioId={leadSelecionadoId} pipeline={selecionado} responsaveis={responsaveis} acoes={acoes} tarefas={tarefasPorLead[leadSelecionadoId] ?? []} aoAlterarTarefas={(atualizar) => setTarefasPorLead((atuais) => ({ ...atuais, [leadSelecionadoId]: typeof atualizar === "function" ? atualizar(atuais[leadSelecionadoId] ?? []) : atualizar }))} aoFechar={() => abrirDetalhes(null)} /> : null}
    </div>
  );
}
