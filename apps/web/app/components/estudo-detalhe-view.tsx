"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { EnergyStudyDetail } from "@plugga/shared";

import { aprovar, enviarFatura, marcarEnviado, recalcular } from "../energia-opm/eficiencia/actions";
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
          {estudo.demand?.preliminar
            ? " · análise de demanda preliminar, faltam 12 meses de histórico"
            : ""}
        </p>
        {erro ? <p className="auth-error">{erro}</p> : null}
      </ShellCard>

      {/* Sem fatura o estudo não tem o que calcular: a ficha é a única ação. */}
      {estudo.invoice === null ? (
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Passo 1</span>
              <h2>Ficha da fatura</h2>
            </div>
          </div>
          <p className="card-note">
            Digite os valores da fatura da distribuidora. Ao salvar, o cálculo roda e o documento
            é gerado automaticamente.
          </p>
          <form
            className="fatura-form"
            action={(formData) => rodar(() => enviarFatura(estudo.id, formData))}
          >
            {CAMPOS_DA_FATURA.map((campo) => (
              <label key={campo.nome}>
                <span>{campo.rotulo}</span>
                <input name={campo.nome} type="number" step={campo.passo ?? "1"} min={campo.minimo ?? "0"} defaultValue="0" />
              </label>
            ))}
            <label className="campo-largo">
              <span>Histórico de demanda registrada, mês a mês (kW)</span>
              <input name="demandHistory" type="text" placeholder="634, 704, 705, 698, 668, 586" />
              <small>
                Separe por vírgula. Com doze meses a análise deixa de ser preliminar.
              </small>
            </label>
            <label className="campo-largo campo-checkbox">
              <input name="hasLoadProfile" type="checkbox" />
              <span>Tenho memória de massa de 15 minutos</span>
            </label>
            <button className="button button--accent" type="submit" disabled={pendente}>
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

      {estudo.audit && estudo.financial && estudo.savings && estudo.sizing ? (
        <>
          <ShellCard className="panel-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Resultado</span>
                <h2>Auditoria e oportunidade</h2>
              </div>
            </div>
            <div className="stat-grid">
              <div className="shell-card">
                <span className="stat-label">Economia mensal</span>
                <strong className="stat-value">{formatarDinheiro(estudo.savings.economiaMensal)}</strong>
                <span className="stat-note">ano 1: {formatarDinheiro(estudo.savings.economiaAno1)}</span>
              </div>
              <div className="shell-card">
                <span className="stat-label">Investimento</span>
                <strong className="stat-value">{formatarDinheiro(estudo.financial.capexTotal)}</strong>
                <span className="stat-note">
                  {numero(estudo.sizing.fvKwp)} kWp + {estudo.sizing.bessUnidades} bateria(s)
                </span>
              </div>
              <div className="shell-card">
                <span className="stat-label">Retorno simples</span>
                <strong className="stat-value">{numero(estudo.financial.paybackSimplesAnos, 1)} anos</strong>
                <span className="stat-note">
                  descontado:{" "}
                  {estudo.financial.paybackDescontadoAnos === null
                    ? "acima do horizonte"
                    : `${numero(estudo.financial.paybackDescontadoAnos, 1)} anos`}
                </span>
              </div>
              <div className="shell-card">
                <span className="stat-label">Valor presente líquido</span>
                <strong className="stat-value">{formatarDinheiro(estudo.financial.vpl)}</strong>
                <span className="stat-note">
                  TIR {estudo.financial.tir === null ? "—" : `${numero(estudo.financial.tir * 100, 2)}%`}
                </span>
              </div>
            </div>
            <ShellTable caption="Leitura da fatura">
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Custo do kWh em ponta</td>
                  <td>{formatarDinheiro(estudo.audit.custoKwhPonta)}</td>
                </tr>
                <tr>
                  <td>Custo do kWh fora ponta</td>
                  <td>{formatarDinheiro(estudo.audit.custoKwhForaPonta)}</td>
                </tr>
                <tr>
                  <td>Custo médio total da fatura</td>
                  <td>{formatarDinheiro(estudo.audit.custoMedioTotal)}</td>
                </tr>
                <tr>
                  <td>Energia reativa</td>
                  <td>
                    {numero(estudo.audit.reativoPercentual, 2)}% · {estudo.audit.reativoDiagnostico}
                  </td>
                </tr>
                {estudo.demand ? (
                  <tr>
                    <td>Demanda ociosa</td>
                    <td>
                      {formatarDinheiro(estudo.demand.ociosidadeMensal)}/mês ·{" "}
                      {estudo.demand.recomendado
                        ? `ajuste recomendado: ${estudo.demand.recomendado}`
                        : "contrato aderente, sem ajuste recomendado"}
                    </td>
                  </tr>
                ) : null}
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

              {estudo.status === "em_validacao" ? (
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

              {estudo.status === "aprovado_internamente" ? (
                <div className="aprovacao">
                  <p className="card-note">
                    Aprovado em {new Date(estudo.approvedAt ?? "").toLocaleString("pt-BR")}. Marque
                    como enviado depois de entregar ao cliente.
                  </p>
                  <button
                    className="button button--accent"
                    type="button"
                    disabled={pendente}
                    onClick={() => rodar(() => marcarEnviado(estudo.id))}
                  >
                    {pendente ? "Registrando…" : "Marcar como enviado"}
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
