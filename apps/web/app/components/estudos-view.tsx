"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ConsumerUnitSummary, EnergyStudyStatus, EnergyStudySummary } from "@plugga/shared";

import { NovaFaturaView } from "./nova-fatura-view";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

/**
 * Lista dos estudos de eficiência energética.
 *
 * O estado é o eixo da tela: quem opera precisa ver de relance o que está
 * parado esperando dado, o que travou na validação e o que já pode ir ao
 * cliente. Por isso o estado vem antes dos números.
 */

const ROTULO: Record<EnergyStudyStatus, { texto: string; variante: "neutral" | "success" | "warning" | "danger" }> = {
  rascunho: { texto: "Rascunho", variante: "neutral" },
  aguardando_dados: { texto: "Aguardando fatura", variante: "warning" },
  dados_recebidos: { texto: "Dados recebidos", variante: "neutral" },
  em_extracao: { texto: "Em extração", variante: "neutral" },
  em_auditoria: { texto: "Em auditoria", variante: "neutral" },
  em_calculo: { texto: "Calculando", variante: "neutral" },
  relatorio_gerado: { texto: "Documento gerado", variante: "neutral" },
  em_validacao: { texto: "Pronto para aprovação", variante: "success" },
  bloqueado: { texto: "Bloqueado", variante: "danger" },
  aprovado_internamente: { texto: "Aprovado", variante: "success" },
  enviado_cliente: { texto: "Enviado ao cliente", variante: "success" },
  arquivado: { texto: "Arquivado", variante: "neutral" },
  cancelado: { texto: "Cancelado", variante: "neutral" },
};

const dinheiro = (valor: number | null): string =>
  valor === null
    ? "—"
    : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/[\u00a0\u202f]/g, " ");

const competencia = (mes: number, ano: number): string => `${String(mes).padStart(2, "0")}/${ano}`;

export function EstudosView({
  items,
  consumerUnits,
  isLive,
}: {
  items: EnergyStudySummary[];
  consumerUnits: ConsumerUnitSummary[];
  isLive: boolean;
}) {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);

  return (
    <>
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Energia · Eficiência energética</span>
            <h2>Estudos</h2>
          </div>
          <div className="page-actions">
            <StatusPill variant={isLive ? "success" : "warning"}>
              {isLive ? "Dados reais" : "API indisponível"}
            </StatusPill>
            <button
              className="button button--accent"
              type="button"
              onClick={() => setAbrindo((atual) => !atual)}
              disabled={consumerUnits.length === 0}
            >
              {abrindo ? "Cancelar" : "Novo estudo pela fatura"}
            </button>
          </div>
        </div>

        {consumerUnits.length === 0 ? (
          <p className="card-note">
            Nenhuma unidade consumidora cadastrada. O estudo parte sempre de uma UC, então
            cadastre a unidade antes de abrir o primeiro estudo.
          </p>
        ) : null}

        {abrindo ? (
          <NovaFaturaView consumerUnits={consumerUnits} onCancelar={() => setAbrindo(false)} />
        ) : null}

        {items.length === 0 ? (
          <p className="card-note">
            Nenhum estudo ainda. Abra o primeiro soltando a conta de luz do cliente.
          </p>
        ) : (
          <ShellTable caption="Estudos de eficiência energética">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>UC</th>
                <th>Competência</th>
                <th>Estado</th>
                <th>Semáforo</th>
                <th>Economia mensal</th>
                <th>Investimento</th>
              </tr>
            </thead>
            <tbody>
              {items.map((estudo) => (
                <tr
                  key={estudo.id}
                  className="linha-clicavel"
                  onClick={() => router.push(`/energia-opm/eficiencia/${estudo.id}`)}
                >
                  <td>{estudo.clientName}</td>
                  <td>{estudo.consumerUnitCode}</td>
                  <td>{competencia(estudo.competenceMonth, estudo.competenceYear)}</td>
                  <td>
                    <StatusPill variant={ROTULO[estudo.status].variante}>
                      {ROTULO[estudo.status].texto}
                    </StatusPill>
                  </td>
                  <td>
                    {estudo.trafficLight ? (
                      <StatusPill
                        variant={
                          estudo.trafficLight === "verde"
                            ? "success"
                            : estudo.trafficLight === "amarelo"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {estudo.trafficLight}
                      </StatusPill>
                    ) : "—"}
                  </td>
                  <td>{dinheiro(estudo.economiaMensal)}</td>
                  <td>{dinheiro(estudo.capexTotal)}</td>
                </tr>
              ))}
            </tbody>
          </ShellTable>
        )}
      </ShellCard>
    </>
  );
}

export { ROTULO as ROTULO_DE_ESTADO, dinheiro as formatarDinheiro, competencia as formatarCompetencia };
