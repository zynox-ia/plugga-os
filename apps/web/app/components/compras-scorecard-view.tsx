import type { DiagnosticoCompras, FarolEos, ScorecardCompras } from "@plugga/shared";
import Link from "next/link";

import { ETAPAS } from "./compras-view";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

/**
 * Scorecard semanal de Compras — POP §4.
 *
 * Três indicadores principais: um financeiro, um de pessoa, um de processo. O
 * bloco de diagnóstico abre quando algum farol sai do verde, que é exatamente o
 * gatilho que o §4.1 e o §4.3 descrevem.
 */

const VARIANTE: Record<FarolEos, "success" | "warning" | "danger" | "neutral"> = {
  verde: "success",
  amarelo: "warning",
  vermelho: "danger",
  fora_da_regua: "neutral",
};

const ROTULO: Record<FarolEos, string> = {
  verde: "Verde",
  amarelo: "Atenção",
  vermelho: "Crítico",
  fora_da_regua: "Fora da régua",
};

function pct(valor: number | null): string {
  return valor === null ? "—" : `${valor.toFixed(2).replace(".", ",")}%`;
}

function moeda(valor: string): string {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Farol({ farol }: { farol: FarolEos | null }) {
  if (!farol) return <StatusPill variant="neutral">Sem base</StatusPill>;
  return <StatusPill variant={VARIANTE[farol]}>{ROTULO[farol]}</StatusPill>;
}

export function ComprasScorecardView({
  scorecard,
  diagnostico,
  empresa,
  isLive,
}: {
  scorecard: ScorecardCompras;
  diagnostico: DiagnosticoCompras | null;
  empresa: string;
  isLive: boolean;
}) {
  const global = scorecard.assertividadeGlobal;
  const foraDoVerde =
    global.farol !== null && global.farol !== "verde"
      ? true
      : scorecard.cumprimentoSla.some((linha) => linha.farol !== null && linha.farol !== "verde");

  return (
    <>
      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">
              <Link href={`/compras?empresa=${empresa}`}>Compras</Link> · POP §4
            </span>
            <h2>Scorecard de Compras</h2>
          </div>
          <div className="row-actions">
            {!isLive ? <StatusPill variant="warning">Dados de exemplo</StatusPill> : null}
            {scorecard.dispensasDeSegregacao > 0 ? (
              <StatusPill variant="warning">
                {scorecard.dispensasDeSegregacao} dispensa(s) de segregação
              </StatusPill>
            ) : null}
          </div>
        </div>

        <ShellTable caption="4.1 Assertividade Global — Faturado ÷ Orçado">
          <thead>
            <tr>
              <th>4.1 Assertividade Global · financeiro</th>
              <th>Orçado</th>
              <th>Faturado</th>
              <th>Pedidos</th>
              <th>Farol</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>{pct(global.percentual)}</strong>
              </td>
              <td>{moeda(global.totalOrcado)}</td>
              <td>{moeda(global.totalFaturado)}</td>
              <td>{global.pedidosConsiderados}</td>
              <td>
                <Farol farol={global.farol} />
              </td>
            </tr>
          </tbody>
        </ShellTable>
        {global.farol === "fora_da_regua" ? (
          <p className="card-note">
            Faturado acima do orçado. A faixa verde do POP vai de 95% a 100%, então isto está fora da régua
            documentada — abra o diagnóstico abaixo para localizar o desvio.
          </p>
        ) : null}
      </ShellCard>

      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">4.2 · pessoa (accountability)</span>
            <h2>% Backlog Crítico</h2>
          </div>
        </div>
        {/* Sem farol de propósito: o POP não define faixas para este indicador,
            e inventar cor seria acrescentar régua ao documento. */}
        <ShellTable caption="Backlog crítico por executor">
          <thead>
            <tr>
              <th>Executor</th>
              <th>Emitidas</th>
              <th>Concluídas</th>
              <th>Pendentes no prazo</th>
              <th>Pendentes vencidas</th>
              <th>% backlog crítico</th>
            </tr>
          </thead>
          <tbody>
            {scorecard.backlogCritico.porExecutor.map((linha) => (
              <tr key={linha.responsavelId ?? "sem-responsavel"}>
                <td>{linha.responsavelNome ?? "Sem responsável"}</td>
                <td>{linha.emitidas}</td>
                <td>{linha.concluidas}</td>
                <td>{linha.pendentesNoPrazo}</td>
                <td>
                  <strong>{linha.pendentesVencidas}</strong>
                </td>
                <td>{pct(linha.percentualBacklogCritico)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total do setor</strong>
              </td>
              <td>{scorecard.backlogCritico.total.emitidas}</td>
              <td>{scorecard.backlogCritico.total.concluidas}</td>
              <td>{scorecard.backlogCritico.total.pendentesNoPrazo}</td>
              <td>{scorecard.backlogCritico.total.pendentesVencidas}</td>
              <td>{pct(scorecard.backlogCritico.total.percentualBacklogCritico)}</td>
            </tr>
          </tbody>
        </ShellTable>
        <p className="card-note">
          O POP não define faixas de farol para este indicador, então ele sai como número. As pendências são da
          coorte emitida no período — por isso concluídas, no prazo e vencidas somam exatamente as emitidas.
        </p>
      </ShellCard>

      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">4.3 · processo</span>
            <h2>Cumprimento de SLA por etapa</h2>
          </div>
        </div>
        <ShellTable caption="Cumprimento de SLA por etapa">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Concluídas</th>
              <th>No prazo</th>
              <th>% cumprimento</th>
              <th>Farol</th>
            </tr>
          </thead>
          <tbody>
            {scorecard.cumprimentoSla.map((linha) => (
              <tr key={linha.etapa}>
                <td>{ETAPAS.find((etapa) => etapa.id === linha.etapa)?.label ?? linha.etapa}</td>
                <td>{linha.concluidas}</td>
                <td>{linha.noPrazo}</td>
                <td>{pct(linha.percentual)}</td>
                <td>
                  <Farol farol={linha.farol} />
                </td>
              </tr>
            ))}
          </tbody>
        </ShellTable>
      </ShellCard>

      {foraDoVerde && diagnostico ? (
        <ShellCard className="table-card" tone="warm">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Ferramenta de diagnóstico · fora do scorecard</span>
              <h2>Onde está o desvio</h2>
            </div>
          </div>
          <ShellTable caption="Assertividades de apoio e indicador cruzado">
            <tbody>
              <tr>
                <th scope="row">Orçamentária · Cotado ÷ Orçado</th>
                <td>{pct(diagnostico.assertividadeOrcamentaria.percentual)}</td>
                <td className="card-note">
                  Cotado acima do orçado indica custo que subiu antes da proposta fechar.
                </td>
              </tr>
              <tr>
                <th scope="row">Execução · Faturado ÷ Cotado</th>
                <td>{pct(diagnostico.assertividadeExecucao.percentual)}</td>
                <td className="card-note">
                  Faturado abaixo do cotado indica perda de escopo ou cancelamento parcial.
                </td>
              </tr>
              <tr>
                <th scope="row">Tempo médio de análise</th>
                <td>{diagnostico.indicadorCruzado.tempoMedioAnaliseDiasUteis ?? "—"} d.u.</td>
                <td className="card-note">Corte do POP: acima de 2 dias úteis é ALTO (problema interno).</td>
              </tr>
              <tr>
                <th scope="row">Tempo médio de aquisição</th>
                <td>{diagnostico.indicadorCruzado.tempoMedioAquisicaoDiasUteis ?? "—"} d.u.</td>
                <td className="card-note">
                  Corte do POP: acima de 9 dias úteis é ALTO (mercado ou alçada). Inclui o tempo gasto em REVISAR.
                </td>
              </tr>
              <tr>
                <th scope="row">Quadrante</th>
                <td colSpan={2}>{diagnostico.indicadorCruzado.quadrante ?? "sem base no período"}</td>
              </tr>
            </tbody>
          </ShellTable>
        </ShellCard>
      ) : null}
    </>
  );
}
