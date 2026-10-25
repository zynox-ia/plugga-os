"use client";

import type { BulkDealsAction, ClientOwner, CompanyKey, Deal, ListDealsResponse, Pipeline } from "@plugga/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { enviar } from "../lib/clientes";
import { hrefDaVisao, type Visao } from "../lib/negocios";
import { useSessionUser } from "../lib/use-session-user";
import { ConfiguracaoDePipelines } from "./pipelines/configuracao-de-pipelines";
import { GanhoDoNegocio, PerdaDoNegocio } from "./pipelines/encerrar-negocio";
import { Icone } from "./pipelines/icones";
import { NovoNegocio } from "./pipelines/novo-negocio";
import { NavegacaoPipelines } from "./pipelines/navegacao-pipelines";
import { QuadroDoPipeline, type AcoesDoNegocio } from "./pipelines/quadro-do-pipeline";
import { TransferirNegocio } from "./pipelines/transferir-negocio";
import estilos from "./pipelines/tela-pipelines.module.css";

type Encerramento = { tipo: "ganho" | "perda" | "transferencia"; negocio: Deal };

/**
 * Pipelines de venda: seletor de processo e visões Kanban, Lista e Calendário.
 * A configuração abre num modal pelo
 * botão desta tela (PLU-269). As ações mudam a tela na hora e confirmam na API;
 * se a API recusar, o negócio volta para onde estava.
 */
export function PipelinesView({
  pipelines,
  canCreateIn,
  selecionadoId,
  visao,
  negocios: doServidor,
  responsaveisDeCliente,
}: {
  pipelines: Pipeline[];
  canCreateIn: CompanyKey[];
  selecionadoId: string | null;
  visao: Visao;
  negocios: Deal[];
  responsaveisDeCliente: ClientOwner[];
}) {
  const router = useRouter();
  const { usuario } = useSessionUser();
  const [configurando, setConfigurando] = useState<"editar" | "novo" | null>(null);
  const [negocios, setNegocios] = useState(doServidor);
  const [criando, setCriando] = useState<{ etapaId?: string } | null>(null);
  const [encerrando, setEncerrando] = useState<Encerramento | null>(null);
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

  const acoes: AcoesDoNegocio = {
    async moverEtapa(negocio, etapaId) {
      if (negocio.stageId === etapaId) return;
      aplicar([{ ...negocio, stageId: etapaId, stageEnteredAt: new Date().toISOString() }]);
      const resposta = await enviar<Deal>(`/api/negocios/${negocio.id}/etapa`, "POST", { stageId: etapaId });
      if (resposta.ok) return confirmado([resposta.dados]);
      aplicar([negocio]);
      setAviso(resposta.erro.mensagem);
    },
    ganhar: (negocio) => setEncerrando({ tipo: "ganho", negocio }),
    perder: (negocio) => setEncerrando({ tipo: "perda", negocio }),
    transferir: (negocio) => setEncerrando({ tipo: "transferencia", negocio }),
    novoNaEtapa: (etapaId) => setCriando({ etapaId }),
    async emLote(ids: string[], action: BulkDealsAction) {
      const resposta = await enviar<ListDealsResponse>("/api/negocios/lote", "POST", { dealIds: ids, action });
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
        <h1>Pipelines</h1>
        {selecionado ? (
          <div className={estilos.acoes}>
            {podeConfigurar ? (
              <button className="button button--secondary" type="button" onClick={() => setConfigurando("editar")}>
                <Icone nome="engrenagem" /> Configurar pipelines
              </button>
            ) : null}
            <button className="button button--accent" type="button" onClick={() => setCriando({})}>
              <Icone nome="mais" /> Novo negócio
            </button>
          </div>
        ) : null}
      </header>

      {selecionado ? (
        <>
          <NavegacaoPipelines pipelines={ativos} selecionado={selecionado} visao={visao} />
          {aviso ? (
            <p className="aviso aviso--erro aviso-flutuante" role="alert">
              {aviso}
            </p>
          ) : null}
          <QuadroDoPipeline key={selecionado.id} pipeline={selecionado} negocios={negocios} visao={visao} usuarioId={usuario?.id ?? null} acoes={acoes} />
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
              : "Você ainda não está na equipe de nenhum pipeline. Peça ao gerente do CRM para incluir você."}
          </p>
          {canCreateIn.length > 0 ? (
            <button className="button button--accent" type="button" onClick={() => setConfigurando("novo")}>
              <Icone nome="mais" />
              Criar pipeline
            </button>
          ) : podeConfigurar ? (
            <button className="button button--secondary" type="button" onClick={() => setConfigurando("editar")}>
              <Icone nome="engrenagem" />
              Configurar pipelines
            </button>
          ) : null}
        </section>
      )}

      {configurando ? (
        <ConfiguracaoDePipelines
          pipelines={pipelines}
          canCreateIn={canCreateIn}
          inicialId={selecionado?.id ?? null}
          comecarNovo={configurando === "novo"}
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
          responsaveisDeCliente={responsaveisDeCliente}
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
        <TransferirNegocio pipelines={ativos} origem={selecionado} negocio={encerrando.negocio} aoConcluir={concluir} aoFechar={() => setEncerrando(null)} />
      ) : null}
    </div>
  );
}
