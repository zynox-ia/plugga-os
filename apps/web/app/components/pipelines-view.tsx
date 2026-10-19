"use client";

import type { CompanyKey, Pipeline } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";

import { formatarBRL } from "../lib/format";
import { EMPRESAS_POR_ID } from "../lib/organizacao";
import { hrefDoPipeline } from "../lib/pipelines";
import { ConfiguracaoDePipelines } from "./pipelines/configuracao-de-pipelines";
import { ShellCard } from "./plugga-shell";

const comCor = (cor: string) => ({ "--cor": cor }) as CSSProperties;

/**
 * Pipelines de venda: uma aba por pipeline que a pessoa alcança, com as etapas
 * em colunas. A configuração abre num modal pelo botão desta tela (PLU-269);
 * os negócios entram no quadro com a PLU-271.
 */
export function PipelinesView({
  pipelines,
  canCreateIn,
  selecionadoId,
}: {
  pipelines: Pipeline[];
  canCreateIn: CompanyKey[];
  selecionadoId: string | null;
}) {
  const router = useRouter();
  const [configurando, setConfigurando] = useState(false);
  const ativos = pipelines.filter((p) => p.archivedAt === null);
  const selecionado = ativos.find((p) => p.id === selecionadoId) ?? ativos[0] ?? null;
  const podeConfigurar = canCreateIn.length > 0 || pipelines.some((p) => p.canConfigure);

  return (
    <ShellCard className="panel-card pipelines">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Comercial</span>
          <h2>Pipelines</h2>
        </div>
        {podeConfigurar ? (
          <button className="button button--secondary" type="button" onClick={() => setConfigurando(true)}>
            Configurar pipelines
          </button>
        ) : null}
      </div>

      {selecionado ? (
        <>
          <nav className="abas-pipeline" aria-label="Pipelines">
            {ativos.map((p) => (
              <Link key={p.id} href={hrefDoPipeline(p.id)} aria-current={p.id === selecionado.id ? "page" : undefined} style={comCor(p.color)}>
                <span className="ponto-cor" aria-hidden="true" />
                {p.name}
                <span className={`selo-empresa selo-empresa--${p.companyId}`}>{EMPRESAS_POR_ID[p.companyId].nome}</span>
              </Link>
            ))}
          </nav>
          <Quadro pipeline={selecionado} />
        </>
      ) : (
        <div className="pipelines-vazio" role="status">
          <h3>Nenhum pipeline por aqui ainda</h3>
          <p className="ficha-vazio">
            {podeConfigurar
              ? "Crie o primeiro pipeline em Configurar pipelines: nome, empresa, etapas e quem trabalha nele."
              : "Você ainda não está na equipe de nenhum pipeline. Peça ao gestor comercial para incluir você."}
          </p>
        </div>
      )}

      {configurando ? (
        <ConfiguracaoDePipelines
          pipelines={pipelines}
          canCreateIn={canCreateIn}
          inicialId={selecionado?.id ?? null}
          aoFechar={() => {
            setConfigurando(false);
            router.refresh();
          }}
        />
      ) : null}
    </ShellCard>
  );
}

function Quadro({ pipeline }: { pipeline: Pipeline }) {
  return (
    <section className="quadro-pipeline" aria-label={`Quadro do pipeline ${pipeline.name}`}>
      {pipeline.description ? <p className="card-note">{pipeline.description}</p> : null}
      <div className="quadro-colunas">
        {pipeline.stages.map((etapa) => (
          <section key={etapa.id} className="coluna-etapa" aria-labelledby={`etapa-${etapa.id}`} style={comCor(etapa.color)}>
            <header>
              <h3 id={`etapa-${etapa.id}`}>{etapa.name}</h3>
              <span className="coluna-resumo">
                0 negócios · <span title={pipeline.valueLabel}>{formatarBRL(0)}</span>
              </span>
            </header>
            <p className="coluna-vazia">Nenhum negócio</p>
          </section>
        ))}
      </div>
      <div className="desfechos" aria-label="Desfechos">
        <span className="desfecho desfecho--ganho">✓ {pipeline.wonLabel}</span>
        <span className="desfecho desfecho--perdido">✕ {pipeline.lostLabel}</span>
      </div>
      <p className="card-note">Os negócios entram neste quadro com a criação de negócios, a próxima entrega do Comercial.</p>
    </section>
  );
}
