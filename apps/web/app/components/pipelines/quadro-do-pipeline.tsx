import type { Pipeline } from "@plugga/shared";
import type { CSSProperties, ReactNode } from "react";

import { formatarBRL } from "../../lib/format";
import { Avatar, Icone, type NomeDoIcone } from "./icones";

const comCor = (cor: string) => ({ "--cor": cor }) as CSSProperties;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function Indicador({ icone, rotulo, children, detalhe }: { icone: NomeDoIcone; rotulo: string; children: ReactNode; detalhe: ReactNode }) {
  return (
    <div className="indicador-pipeline">
      <span className="indicador-icone" aria-hidden="true">
        <Icone nome={icone} tamanho={18} />
      </span>
      <div className="indicador-texto">
        <span className="indicador-rotulo">{rotulo}</span>
        <span className="indicador-valor">{children}</span>
        <span className="indicador-detalhe">{detalhe}</span>
      </div>
    </div>
  );
}

/**
 * Indicadores e colunas do pipeline escolhido. Ainda sem negócios: as colunas
 * mostram a estrutura (etapa, contagem, soma e prazo de parado) que a PLU-271
 * vai preencher.
 */
export function QuadroDoPipeline({ pipeline }: { pipeline: Pipeline }) {
  const comAlerta = pipeline.stages.filter((etapa) => etapa.staleAfterDays !== null).length;
  const gestores = pipeline.members.filter((m) => m.role === "gestor").length;

  return (
    <div className="quadro-pipeline" style={comCor(pipeline.color)}>
      <section className="indicadores-pipeline" aria-label={`Resumo do pipeline ${pipeline.name}`}>
        <Indicador icone="negocios" rotulo="Negócios abertos" detalhe="Nenhum negócio ainda">
          0
        </Indicador>
        <Indicador icone="valor" rotulo={pipeline.valueLabel} detalhe="Soma dos negócios abertos">
          {formatarBRL(0)}
        </Indicador>
        <Indicador icone="etapas" rotulo="Etapas" detalhe={comAlerta > 0 ? `${comAlerta} com alerta de parado` : "Sem alerta de parado"}>
          {pipeline.stages.length}
        </Indicador>
        <Indicador
          icone="equipe"
          rotulo="Equipe"
          detalhe={pipeline.members.length > 0 ? plural(gestores, "gestor", "gestores") + " do pipeline" : "Ninguém na equipe ainda"}
        >
          {pipeline.members.length > 0 ? (
            <span className="pilha-avatares">
              {pipeline.members.slice(0, 5).map((m) => (
                <Avatar key={m.userId} id={m.userId} nome={m.name} tamanho="pequeno" />
              ))}
              {pipeline.members.length > 5 ? <span className="avatar-mais">+{pipeline.members.length - 5}</span> : null}
            </span>
          ) : (
            "0"
          )}
        </Indicador>
      </section>

      <section className="painel-quadro" aria-label={`Quadro do pipeline ${pipeline.name}`}>
        <div className="quadro-aviso">
          <Icone nome="info" />
          <span>Nenhum negócio neste pipeline ainda. A criação de negócios chega na próxima entrega do Comercial.</span>
        </div>

        <div className="quadro-colunas">
          {pipeline.stages.map((etapa, i) => (
            <section key={etapa.id} className="coluna-etapa" aria-labelledby={`etapa-${etapa.id}`} style={comCor(etapa.color)}>
              <header className="coluna-topo">
                <div className="coluna-titulo">
                  <span className="coluna-ordem" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 id={`etapa-${etapa.id}`}>{etapa.name}</h3>
                  <span className="coluna-contagem" aria-label="0 negócios">
                    0
                  </span>
                </div>
                <div className="coluna-meta">
                  <span className="coluna-soma">{formatarBRL(0)}</span>
                  {etapa.staleAfterDays !== null ? (
                    <span className="coluna-parado" title={`O negócio aparece como parado depois de ${etapa.staleAfterDays} dias nesta etapa`}>
                      <Icone nome="relogio" tamanho={12} />
                      {etapa.staleAfterDays}d
                    </span>
                  ) : null}
                </div>
              </header>
              <div className="coluna-corpo">
                <p className="coluna-vazia">Sem negócios nesta etapa</p>
              </div>
            </section>
          ))}
        </div>

        <footer className="quadro-rodape">
          <span className="quadro-rodape-rotulo">Desfechos</span>
          <span className="desfecho desfecho--ganho">
            <Icone nome="check" tamanho={14} />
            {pipeline.wonLabel}
          </span>
          <span className="desfecho desfecho--perdido">
            <Icone nome="x" tamanho={14} />
            {pipeline.lostLabel}
          </span>
          <span className="quadro-rodape-dica">Ganho e Perdido encerram o negócio; não são etapas.</span>
        </footer>
      </section>
    </div>
  );
}
