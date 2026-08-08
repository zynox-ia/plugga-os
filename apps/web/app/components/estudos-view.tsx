"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ConsumerUnitSummary, EnergyStudyStatus, EnergyStudySummary } from "@plugga/shared";

import { criarEstudo } from "../energia-opm/eficiencia/actions";
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
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const agora = new Date();
  // Mês anterior como padrão: fatura do mês corrente ainda não fechou.
  const mesPadrao = agora.getMonth() === 0 ? 12 : agora.getMonth();
  const anoPadrao = agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear();

  function submeter(formData: FormData) {
    setErro(null);
    iniciar(async () => {
      const resultado = await criarEstudo(formData);
      if (resultado.ok) {
        setAbrindo(false);
        router.refresh();
      } else {
        setErro(resultado.erro);
      }
    });
  }

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
              {abrindo ? "Cancelar" : "Novo estudo"}
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
          <form className="estudo-form" action={submeter}>
            <label>
              <span>Unidade consumidora</span>
              <select
                name="consumerUnitId"
                required
                onChange={(evento) => {
                  const uc = consumerUnits.find((item) => item.id === evento.target.value);
                  const campo = evento.currentTarget.form?.elements.namedItem("clientId");
                  if (campo instanceof HTMLInputElement) campo.value = uc?.clientId ?? "";
                }}
              >
                <option value="">Selecione…</option>
                {consumerUnits.map((uc) => (
                  <option key={uc.id} value={uc.id}>
                    {uc.code} · {uc.clientName}
                  </option>
                ))}
              </select>
            </label>
            {/* O cliente vem da UC escolhida: uma UC pertence a um cliente só,
                então pedir os dois seria abrir espaço para incoerência. */}
            <input type="hidden" name="clientId" defaultValue="" />
            <label>
              <span>Mês</span>
              <input name="competenceMonth" type="number" min={1} max={12} defaultValue={mesPadrao} required />
            </label>
            <label>
              <span>Ano</span>
              <input name="competenceYear" type="number" min={2020} max={2100} defaultValue={anoPadrao} required />
            </label>
            <button className="button button--accent" type="submit" disabled={pendente}>
              {pendente ? "Abrindo…" : "Abrir estudo"}
            </button>
            {erro ? <p className="auth-error">{erro}</p> : null}
          </form>
        ) : null}

        {items.length === 0 ? (
          <p className="card-note">
            Nenhum estudo ainda. Abra o primeiro escolhendo a unidade consumidora e a competência
            da fatura.
          </p>
        ) : (
          <ShellTable caption="Estudos de eficiência energética">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>UC</th>
                <th>Competência</th>
                <th>Estado</th>
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
