"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { EnergyStudyDetail, ReconciledInvoiceItem } from "@plugga/shared";

import { aprovar, enviarFatura, marcarEnviado, recalcular } from "../energia-opm/eficiencia/actions";
import {
  avaliarConciliacaoLocal,
  camposDaFicha,
} from "./conciliacao-model";
import { EditorConciliacao } from "./conciliacao-editor";
import { ROTULO_DE_ESTADO, formatarCompetencia, formatarDinheiro } from "./estudos-view";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

/**
 * Detalhe do estudo. A tela muda conforme o estado, porque a pergunta de quem
 * abre também muda: sem fatura, o que falta é o dado; com validação limpa, o
 * que falta é a aprovação; bloqueado, o que falta é entender o que travou.
 */

const numero = (valor: number | null | undefined, casas = 0): string =>
  valor === null || valor === undefined
    ? "—"
    : valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

// `minimo` presente onde o contrato (invoiceDataSchema) exige positivo:
// min=0 deixaria o navegador aceitar o que a API recusa com 400.
const CAMPOS_DA_FATURA: { nome: string; rotulo: string; passo?: string; minimo?: string }[] = [
  { nome: "valorTotal", rotulo: "Valor total da fatura (R$)", passo: "0.01", minimo: "0.01" },
  { nome: "consumoPontaKwh", rotulo: "Consumo ponta (kWh)" },
  { nome: "consumoForaPontaKwh", rotulo: "Consumo fora ponta (kWh)" },
  { nome: "tarifaPonta", rotulo: "Tarifa ponta (R$/kWh)", passo: "0.000001" },
  { nome: "tarifaForaPonta", rotulo: "Tarifa fora ponta (R$/kWh)", passo: "0.000001" },
  { nome: "valorPonta", rotulo: "Valor da energia em ponta (R$)", passo: "0.01" },
  { nome: "valorForaPonta", rotulo: "Valor da energia fora ponta (R$)", passo: "0.01" },
  { nome: "valorDemanda", rotulo: "Valor da demanda (R$)", passo: "0.01" },
  { nome: "demandaContratadaKw", rotulo: "Demanda contratada (kW)", minimo: "0.01" },
  { nome: "demandaMedidaPontaKw", rotulo: "Demanda medida em ponta (kW)" },
  { nome: "demandaMedidaForaPontaKw", rotulo: "Demanda medida fora ponta (kW)" },
  { nome: "tarifaDemanda", rotulo: "Tarifa de demanda (R$/kW)", passo: "0.01" },
  { nome: "valorReativo", rotulo: "Energia reativa (R$)", passo: "0.01" },
  { nome: "valorBeneficioFiscal", rotulo: "Benefício fiscal (R$)", passo: "0.01" },
  { nome: "valorMultasJurosEncargos", rotulo: "Multas, juros e encargos (R$)", passo: "0.01" },
];

export function EstudoDetalheView({ estudo }: { estudo: EnergyStudyDetail }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [pendente, iniciar] = useTransition();
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  // Ficha controlada por estado: o React 19 reseta o <form action> quando a
  // ação termina, inclusive em erro — com defaultValue, um 400 apagava tudo
  // que a pessoa digitou lendo o papel. Campo controlado sobrevive ao reset.
  const [ficha, setFicha] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {
      demandHistory: estudo.demandHistory.join(", "),
      hasLoadProfile: estudo.calculationMode === "memoria_massa" ? "on" : "",
      distribuidora: estudo.invoiceContext?.distribuidora ?? "",
      regime: estudo.invoiceContext?.regime ?? "cativo",
      modalidade: estudo.invoiceContext?.modalidade ?? "verde",
      vencimento: estudo.invoiceContext?.vencimento ?? "",
    };
    for (const campo of CAMPOS_DA_FATURA) {
      base[campo.nome] = String(
        estudo.invoice?.[campo.nome as keyof typeof estudo.invoice] ?? 0,
      );
    }
    return base;
  });
  const [itensConciliacao, setItensConciliacao] = useState<ReconciledInvoiceItem[]>(() =>
    estudo.invoiceContext?.itens.filter((item) => item.compoeTotal) ?? [],
  );
  const alterarCampo = (nome: string, valor: string) =>
    setFicha((atual) => ({ ...atual, [nome]: valor }));

  const rodar = (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) => {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (resultado.ok) router.refresh();
      else setErro(resultado.erro);
    });
  };

  // A rota devolve o erro como text/plain: um <a href> cru navegaria para essa
  // mensagem e a pessoa perderia a tela do estudo. Buscando no clique, o erro
  // cai no aviso do card e o sucesso vira download de verdade.
  async function baixarPdf() {
    setErro(null);
    setBaixandoPdf(true);
    try {
      const resposta = await fetch(`/api/energia/estudos/${estudo.id}/documento/pdf`);
      if (!resposta.ok) {
        setErro(await resposta.text().catch(() => "não foi possível gerar o PDF"));
        return;
      }
      const nome =
        /filename="([^"]+)"/.exec(resposta.headers.get("content-disposition") ?? "")?.[1] ??
        "estudo.pdf";
      const url = URL.createObjectURL(await resposta.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("não foi possível falar com a API para gerar o PDF");
    } finally {
      setBaixandoPdf(false);
    }
  }

  const rotulo = ROTULO_DE_ESTADO[estudo.status];
  const temProblemas = (estudo.validationIssues?.length ?? 0) > 0;
  const terminal = ["enviado_cliente", "arquivado", "cancelado"].includes(estudo.status);
  const podeConciliar =
    !terminal && (estudo.invoiceContext === null || estudo.status === "bloqueado");
  const avaliacaoConciliacao = avaliarConciliacaoLocal(
    itensConciliacao,
    camposDaFicha(ficha),
  );

  return (
    <>
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">
              {estudo.consumerUnitCode} · {formatarCompetencia(estudo.competenceMonth, estudo.competenceYear)}
            </span>
            <h2>{estudo.clientName}</h2>
          </div>
          <StatusPill variant={rotulo.variante}>{rotulo.texto}</StatusPill>
        </div>
        <p className="card-note">
          Premissas <b>{estudo.premiseVersion}</b> · modo{" "}
          {estudo.calculationMode === "preliminar" ? "preliminar" : "com memória de massa"}
          {estudo.estudo ? ` · ${estudo.estudo.modo === "peak_shaving" ? "peak shaving" : "Solar+BESS"}` : ""}
        </p>
        {erro ? <p className="auth-error">{erro}</p> : null}
      </ShellCard>

      {estudo.trafficLightResult ? (
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Governança do PRD</span>
              <h2>Semáforo da auditoria</h2>
            </div>
            <StatusPill
              variant={
                estudo.trafficLightResult.faixa === "verde"
                  ? "success"
                  : estudo.trafficLightResult.faixa === "amarelo"
                    ? "warning"
                    : "danger"
              }
            >
              {estudo.trafficLightResult.faixa.toUpperCase()}
            </StatusPill>
          </div>
          <p className="card-note">
            Tipo: <b>{estudo.trafficLightResult.chaveTipo}</b>.{" "}
            {estudo.trafficLightResult.faixa === "verde"
              ? "Tipo conhecido e travas aprovadas: o relatório está liberado."
              : estudo.trafficLightResult.faixa === "amarelo"
                ? "Tipo novo: confira os quatro números e registre a aprovação antes da entrega."
                : "O pipeline parou; corrija a origem e recalcule."}
          </p>
          <div className="stat-grid">
            <div className="shell-card"><span className="stat-label">Total da fatura</span><strong className="stat-value">{formatarDinheiro(estudo.trafficLightResult.quatroNumeros.totalFatura)}</strong></div>
            <div className="shell-card"><span className="stat-label">Consumo ponta</span><strong className="stat-value">{numero(estudo.trafficLightResult.quatroNumeros.consumoPontaKwh)} kWh</strong></div>
            <div className="shell-card"><span className="stat-label">TIR</span><strong className="stat-value">{estudo.trafficLightResult.quatroNumeros.tirAnual === null ? "—" : `${numero(estudo.trafficLightResult.quatroNumeros.tirAnual * 100, 2)}% a.a.`}</strong></div>
            <div className="shell-card"><span className="stat-label">Payback</span><strong className="stat-value">{estudo.trafficLightResult.quatroNumeros.paybackAnos === null ? "—" : `${numero(estudo.trafficLightResult.quatroNumeros.paybackAnos, 1)} anos`}</strong></div>
          </div>
          {estudo.reconciliationProof ? (
            <p className="card-note">
              Trava 1: soma dos itens {formatarDinheiro(estudo.reconciliationProof.somaItens)} = total {formatarDinheiro(estudo.reconciliationProof.total)} · {estudo.reconciliationProof.itensConferidos} item(ns) com quantidade × tarifa conferidos.
            </p>
          ) : null}
        </ShellCard>
      ) : null}

      {/* Novo ou legado: antes de calcular, a fatura precisa de prova semântica. */}
      {podeConciliar ? (
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Conciliação obrigatória</span>
              <h2>{estudo.invoice ? "Reconcilie a fatura existente" : "Ficha da fatura"}</h2>
            </div>
          </div>
          <p className="card-note">
            Confira os campos e classifique as linhas cobradas. Consumo, demanda, reativos e
            encargos precisam concordar com a ficha; fechar apenas o valor total não libera o
            cálculo.
          </p>
          <form
            className="fatura-form"
            action={(formData) => rodar(() => enviarFatura(estudo.id, formData))}
          >
            <input
              type="hidden"
              name="contextItems"
              value={JSON.stringify(avaliacaoConciliacao.itens)}
              readOnly
            />
            <input
              type="hidden"
              name="origem"
              value={estudo.invoiceContext?.origem ?? "manual"}
              readOnly
            />
            <input
              type="hidden"
              name="arquivoNome"
              value={estudo.invoiceContext?.arquivoNome ?? ""}
              readOnly
            />
            <input
              type="hidden"
              name="arquivoChave"
              value={estudo.invoiceContext?.arquivoChave ?? ""}
              readOnly
            />
            <label>
              <span>Distribuidora</span>
              <input
                name="distribuidora"
                type="text"
                value={ficha.distribuidora ?? ""}
                onChange={(evento) => alterarCampo("distribuidora", evento.target.value)}
                required
              />
            </label>
            <label>
              <span>Regime</span>
              <select
                name="regime"
                value={ficha.regime ?? "cativo"}
                onChange={(evento) => alterarCampo("regime", evento.target.value)}
              >
                <option value="cativo">Cativo</option>
                <option value="mercado_livre">Mercado Livre</option>
              </select>
            </label>
            <label>
              <span>Modalidade</span>
              <select
                name="modalidade"
                value={ficha.modalidade ?? "verde"}
                onChange={(evento) => alterarCampo("modalidade", evento.target.value)}
              >
                <option value="verde">Verde</option>
                <option value="azul">Azul</option>
              </select>
            </label>
            <label>
              <span>Vencimento</span>
              <input
                name="vencimento"
                type="text"
                value={ficha.vencimento ?? ""}
                onChange={(evento) => alterarCampo("vencimento", evento.target.value)}
              />
            </label>
            {CAMPOS_DA_FATURA.map((campo) => (
              <label key={campo.nome}>
                <span>{campo.rotulo}</span>
                <input
                  name={campo.nome}
                  type="number"
                  step={campo.passo ?? "1"}
                  min={campo.minimo ?? "0"}
                  value={ficha[campo.nome] ?? ""}
                  onChange={(evento) => alterarCampo(campo.nome, evento.target.value)}
                />
              </label>
            ))}
            <label className="campo-largo">
              <span>Histórico de demanda registrada, mês a mês (kW)</span>
              <input
                name="demandHistory"
                type="text"
                placeholder="634, 704, 705, 698, 668, 586"
                value={ficha.demandHistory ?? ""}
                onChange={(evento) => alterarCampo("demandHistory", evento.target.value)}
              />
              <small>
                Separe por vírgula. Com doze meses a análise deixa de ser preliminar.
              </small>
            </label>
            <label className="campo-largo campo-checkbox">
              <input
                name="hasLoadProfile"
                type="checkbox"
                checked={ficha.hasLoadProfile === "on"}
                onChange={(evento) =>
                  alterarCampo("hasLoadProfile", evento.target.checked ? "on" : "")
                }
              />
              <span>Tenho memória de massa de 15 minutos</span>
            </label>
            <div className="campo-largo">
              <h3>Itens cobrados</h3>
              <p className="card-note">
                A categoria liga cada linha aos campos críticos usados pelo motor de cálculo.
              </p>
              <EditorConciliacao
                itens={itensConciliacao}
                onChange={setItensConciliacao}
                avaliacao={avaliacaoConciliacao}
              />
            </div>
            <button
              className="button button--accent"
              type="submit"
              disabled={pendente || !avaliacaoConciliacao.pronta}
            >
              {pendente ? "Calculando…" : "Salvar e calcular"}
            </button>
          </form>
        </ShellCard>
      ) : null}

      {/* Bloqueado: o que importa é o motivo, não os números. */}
      {temProblemas ? (
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Validação</span>
              <h2>O documento não passou</h2>
            </div>
            <StatusPill variant="danger">{estudo.validationIssues?.length} problema(s)</StatusPill>
          </div>
          <p className="card-note">
            O estudo não avança para aprovação enquanto houver problema em aberto. Corrija a
            origem e recalcule.
          </p>
          <ShellTable caption="Problemas de validação">
            <thead>
              <tr>
                <th>Regra</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {estudo.validationIssues?.map((problema, i) => (
                <tr key={`${problema.regra}-${i}`}>
                  <td>{problema.regra.replace(/_/g, " ")}</td>
                  <td>{problema.detalhe}</td>
                </tr>
              ))}
            </tbody>
          </ShellTable>
          <p className="card-note">
            <button className="button" type="button" disabled={pendente} onClick={() => rodar(() => recalcular(estudo.id))}>
              {pendente ? "Recalculando…" : "Recalcular"}
            </button>
          </p>
        </ShellCard>
      ) : null}

      {estudo.estudo ? (
        <>
          <ShellCard className="panel-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Resultado</span>
                <h2>Oportunidade</h2>
              </div>
            </div>
            <div className="stat-grid">
              <div className="shell-card">
                <span className="stat-label">Economia mensal</span>
                <strong className="stat-value">
                  {formatarDinheiro(estudo.estudo.economiaMensal)}
                </strong>
                <span className="stat-note">
                  ano 1: {formatarDinheiro(estudo.estudo.economiaAno1)}
                </span>
              </div>
              <div className="shell-card">
                <span className="stat-label">Investimento</span>
                <strong className="stat-value">
                  {formatarDinheiro(estudo.estudo.capexTotal)}
                </strong>
                <span className="stat-note">
                  {estudo.estudo.unidadesBess} bateria(s) + {numero(estudo.estudo.solarKwp, 1)} kWp
                  {estudo.estudo.regraDoKwp === "aprovado" ? " (kWp aprovado)" : " (pior mês)"}
                </span>
              </div>
              <div className="shell-card">
                <span className="stat-label">Payback</span>
                <strong className="stat-value">
                  {estudo.estudo.paybackAnos === null
                    ? "acima do horizonte"
                    : `${numero(estudo.estudo.paybackAnos, 1)} anos`}
                </strong>
                <span className="stat-note">
                  TIR{" "}
                  {estudo.estudo.tirAa === null
                    ? "—"
                    : `${numero(estudo.estudo.tirAa * 100, 2)}% ao ano`}
                </span>
              </div>
              <div className="shell-card">
                <span className="stat-label">Acumulado em 20 anos</span>
                <strong className="stat-value">
                  {formatarDinheiro(estudo.estudo.acumulado20Anos)}
                </strong>
                <span className="stat-note">
                  fatura projetada: {formatarDinheiro(estudo.estudo.faturaProjetada)}
                </span>
              </div>
            </div>
            <ShellTable caption="Cenários comparados">
              <thead>
                <tr>
                  <th>Cenário</th>
                  <th>Investimento</th>
                  <th>Economia ano 1</th>
                  <th>TIR</th>
                  <th>Payback</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Apenas BESS</td>
                  <td>{formatarDinheiro(estudo.estudo.bessPuro.capexTotal)}</td>
                  <td>{formatarDinheiro(estudo.estudo.bessPuro.economiaAno1)}</td>
                  <td>
                    {estudo.estudo.bessPuro.tirAa === null
                      ? "—"
                      : `${numero(estudo.estudo.bessPuro.tirAa * 100, 2)}%`}
                  </td>
                  <td>
                    {estudo.estudo.bessPuro.paybackAnos === null
                      ? "—"
                      : `${numero(estudo.estudo.bessPuro.paybackAnos, 1)} anos`}
                  </td>
                </tr>
                <tr>
                  <td>
                    <b>Solar + BESS (apresentado)</b>
                  </td>
                  <td>{formatarDinheiro(estudo.estudo.capexTotal)}</td>
                  <td>{formatarDinheiro(estudo.estudo.economiaAno1)}</td>
                  <td>
                    {estudo.estudo.tirAa === null
                      ? "—"
                      : `${numero(estudo.estudo.tirAa * 100, 2)}%`}
                  </td>
                  <td>
                    {estudo.estudo.paybackAnos === null
                      ? "—"
                      : `${numero(estudo.estudo.paybackAnos, 1)} anos`}
                  </td>
                </tr>
              </tbody>
            </ShellTable>
          </ShellCard>

          {estudo.hasDocument ? (
            <ShellCard className="panel-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Documento</span>
                  <h2>Relatório do cliente</h2>
                </div>
                <div className="page-actions">
                  <a
                    className="button"
                    href={`/api/energia/estudos/${estudo.id}/documento`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir relatório
                  </a>
                  {estudo.hasMobileDocument ? (
                    <a
                      className="button"
                      href={`/api/energia/estudos/${estudo.id}/documento/celular`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir versão celular
                    </a>
                  ) : null}
                  <button
                    className="button button--accent"
                    type="button"
                    disabled={baixandoPdf}
                    onClick={() => void baixarPdf()}
                  >
                    {baixandoPdf ? "Gerando PDF…" : "Baixar PDF"}
                  </button>
                </div>
              </div>
              <p className="card-note">
                O documento passou na validação e está pronto. Confira no navegador antes de
                aprovar — a aprovação é registrada com o seu nome. O PDF é o arquivo que vai para
                o cliente e leva alguns segundos para ser gerado.
              </p>

              {estudo.status === "em_validacao" && estudo.trafficLight === "amarelo" ? (
                <div className="aprovacao">
                  <label>
                    <span>Observação da aprovação (opcional)</span>
                    <input
                      type="text"
                      value={nota}
                      onChange={(evento) => setNota(evento.target.value)}
                      placeholder="conferido contra a fatura"
                    />
                  </label>
                  <button
                    className="button button--accent"
                    type="button"
                    disabled={pendente}
                    onClick={() => rodar(() => aprovar(estudo.id, nota))}
                  >
                    {pendente ? "Aprovando…" : "Aprovar"}
                  </button>
                </div>
              ) : null}

              {estudo.status === "aprovado_internamente" ||
              (estudo.status === "em_validacao" && estudo.trafficLight === "verde") ? (
                <div className="aprovacao">
                  <p className="card-note">
                    {estudo.trafficLight === "verde"
                      ? "Faixa verde: travas aprovadas e tipo conhecido."
                      : `Aprovado em ${new Date(estudo.approvedAt ?? "").toLocaleString("pt-BR")}.`} Marque
                    como entregue depois de compartilhar os dois HTMLs e o PDF com o cliente.
                  </p>
                  <button
                    className="button button--accent"
                    type="button"
                    disabled={pendente}
                    onClick={() => rodar(() => marcarEnviado(estudo.id))}
                  >
                    {pendente ? "Registrando…" : "Marcar como entregue"}
                  </button>
                </div>
              ) : null}

              {estudo.status === "enviado_cliente" ? (
                <p className="card-note">
                  Enviado ao cliente em {new Date(estudo.sentAt ?? "").toLocaleString("pt-BR")}.
                </p>
              ) : null}
            </ShellCard>
          ) : null}
        </>
      ) : null}
    </>
  );
}
