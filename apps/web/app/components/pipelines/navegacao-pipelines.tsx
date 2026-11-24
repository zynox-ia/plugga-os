"use client";

import type { Pipeline } from "@plugga/shared";
import { ChartNoAxesCombined, Check, ChevronDown, Kanban, List } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { hrefDaVisao, type Visao } from "../../lib/negocios";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { Button, IconSettings } from "../ui";
import estilos from "./tela-pipelines.module.css";

const VISOES: { valor: Visao; rotulo: string; icone: (props: { size?: number; className?: string }) => ReactNode }[] = [
  { valor: "kanban", rotulo: "Quadro", icone: Kanban },
  { valor: "lista", rotulo: "Todos os negócios", icone: List },
  { valor: "previsao", rotulo: "Previsão", icone: ChartNoAxesCombined },
];

export function NavegacaoPipelines({
  pipelines,
  selecionado,
  visao,
  podeConfigurar = false,
  carregandoConfiguracao = false,
  aoConfigurar,
  rolagem,
}: {
  pipelines: Pipeline[];
  selecionado: Pipeline;
  visao: Visao;
  podeConfigurar?: boolean;
  carregandoConfiguracao?: boolean;
  aoConfigurar?: () => void;
  rolagem?: ReactNode;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    function aoPressionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoPressionarTecla);
    };
  }, [aberto]);

  function selecionarPipeline(pipelineId: string) {
    setAberto(false);
    router.push(hrefDaVisao(pipelineId, visao), { scroll: false });
  }

  const empresaSelecionada = EMPRESAS_POR_ID[selecionado.companyId]?.nome ?? selecionado.companyId;

  return (
    <div className={`${estilos.navegacao} plg-item`}>
      {/* Alternador de Visão (Segmented Control: Kanban / Lista) à esquerda */}
      <nav className={estilos.visoes} aria-label="Visualização dos negócios">
        {VISOES.map((opcao) => {
          const IconeComp = opcao.icone;
          return (
            <Link
              key={opcao.valor}
              href={hrefDaVisao(selecionado.id, opcao.valor)}
              aria-current={visao === opcao.valor ? "page" : undefined}
              scroll={false}
            >
              <IconeComp size={15} aria-hidden="true" />
              <span>{opcao.rotulo}</span>
            </Link>
          );
        })}
      </nav>

      {rolagem}

      {/* Ações da direita: Botão Configurar Pipelines + Seletor de Funil */}
      <div className={estilos.navegacaoDireita}>
        {podeConfigurar && aoConfigurar ? (
          <Button
            variant="secondary"
            icon={<IconSettings />}
            loading={carregandoConfiguracao}
            onClick={aoConfigurar}
          >
            Configurar pipelines
          </Button>
        ) : null}

        <div className={estilos.seletorContainer} ref={containerRef}>
        <button
          type="button"
          className={estilos.seletorTrigger}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-label={`Funil atual: ${selecionado.name}. Clique para alternar funis.`}
          onClick={() => setAberto((prev) => !prev)}
        >
          <span
            className={estilos.seletorCorDot}
            style={{ backgroundColor: selecionado.color || "#0077FF" }}
            aria-hidden="true"
          />
          <span className={estilos.seletorLabel}>{selecionado.name}</span>
          <span className={estilos.seletorEmpresa}>· {empresaSelecionada}</span>
          <ChevronDown
            size={15}
            className={`${estilos.seletorChevron} ${aberto ? estilos.seletorChevronAberto : ""}`}
            aria-hidden="true"
          />
        </button>

        {/* Fallback acessível para automações e leitores de tela */}
        <select
          aria-label="Selecionar pipeline"
          className="sr-only"
          value={selecionado.id}
          onChange={(e) => router.push(hrefDaVisao(e.target.value, visao), { scroll: false })}
        >
          {pipelines.map((pipeline) => (
            <option key={pipeline.id} value={pipeline.id}>
              {pipeline.name} · {EMPRESAS_POR_ID[pipeline.companyId]?.nome ?? pipeline.companyId}
            </option>
          ))}
        </select>

        {aberto && (
          <div className={`${estilos.popoverFunis} plg-surge plg-surge--direita`} role="listbox" aria-label="Funis de vendas disponíveis">
            <div className={estilos.popoverHeader}>
              <span className={estilos.popoverHeaderTitulo}>Funis disponíveis</span>
              <span className={estilos.popoverHeaderContador}>
                {pipelines.length} {pipelines.length === 1 ? "funil" : "funis"}
              </span>
            </div>
            {pipelines.map((pipeline) => {
              const ativo = pipeline.id === selecionado.id;
              const empresa = EMPRESAS_POR_ID[pipeline.companyId]?.nome ?? pipeline.companyId;
              return (
                <button
                  key={pipeline.id}
                  type="button"
                  role="option"
                  aria-selected={ativo}
                  className={`${estilos.popoverItem} ${ativo ? estilos.popoverItemAtivo : ""}`}
                  onClick={() => selecionarPipeline(pipeline.id)}
                >
                  <div className={estilos.popoverItemTexto}>
                    <span className={estilos.popoverItemNome}>{pipeline.name}</span>
                    <span className={estilos.popoverItemEmpresa}>{empresa}</span>
                  </div>
                  {ativo && <Check size={16} className={estilos.popoverItemCheck} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
