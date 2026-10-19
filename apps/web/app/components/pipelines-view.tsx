"use client";

import type { CompanyKey, Pipeline } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EMPRESAS_POR_ID } from "../lib/organizacao";
import { hrefDoPipeline } from "../lib/pipelines";
import { ConfiguracaoDePipelines } from "./pipelines/configuracao-de-pipelines";
import { Icone } from "./pipelines/icones";
import { QuadroDoPipeline } from "./pipelines/quadro-do-pipeline";

/**
 * Pipelines de venda: uma aba por pipeline que a pessoa alcança, com os
 * indicadores e as etapas em colunas. A configuração abre num modal pelo botão
 * desta tela (PLU-269); os negócios entram no quadro com a PLU-271.
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
  const [configurando, setConfigurando] = useState<"editar" | "novo" | null>(null);
  const ativos = pipelines.filter((p) => p.archivedAt === null);
  const selecionado = ativos.find((p) => p.id === selecionadoId) ?? ativos[0] ?? null;
  const podeConfigurar = canCreateIn.length > 0 || pipelines.some((p) => p.canConfigure);

  return (
    <div className="pagina-pipelines">
      <header className="cabecalho-pipelines">
        <span className="eyebrow eyebrow--azul">Comercial</span>
        <h1>Pipelines</h1>
        <p>{selecionado?.description ?? "Os processos de venda da Plugga e da Waze Energia, um por aba."}</p>
      </header>

      {selecionado ? (
        <>
          <div className="barra-pipelines">
            <nav className="abas-pipeline" aria-label="Pipelines">
              {ativos.map((p) => (
                <Link key={p.id} href={hrefDoPipeline(p.id)} aria-current={p.id === selecionado.id ? "page" : undefined} className="aba-pipeline">
                  <span className="ponto-cor" style={{ background: p.color }} aria-hidden="true" />
                  {p.name}
                  <span className={`selo-empresa selo-empresa--${p.companyId}`}>{EMPRESAS_POR_ID[p.companyId].nome}</span>
                </Link>
              ))}
            </nav>
            {podeConfigurar ? (
              <button className="button button--secondary" type="button" onClick={() => setConfigurando("editar")}>
                <Icone nome="engrenagem" />
                Configurar pipelines
              </button>
            ) : null}
          </div>
          <QuadroDoPipeline pipeline={selecionado} />
        </>
      ) : (
        <section className="pipelines-vazio">
          <span className="pipelines-vazio-icone" aria-hidden="true">
            <Icone nome="etapas" tamanho={28} />
          </span>
          <h2>{podeConfigurar ? "Crie o primeiro pipeline" : "Nenhum pipeline para você ainda"}</h2>
          <p>
            {podeConfigurar
              ? "Um pipeline é um processo de venda: nome, empresa, etapas e quem trabalha nele. Cada um vira uma aba desta tela."
              : "Você ainda não está na equipe de nenhum pipeline. Peça ao gestor comercial para incluir você."}
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
    </div>
  );
}
