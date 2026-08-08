"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import type { ConsumerUnitSummary, InvoiceReading } from "@plugga/shared";

import { abrirEstudoPelaFatura, lerFaturaEnviada } from "../energia-opm/eficiencia/actions";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

/**
 * Abrir estudo a partir da conta de luz.
 *
 * A ordem importa: o que a pessoa tem na mão é a fatura, não o cadastro da
 * unidade consumidora. Soltar o arquivo é o primeiro passo, e a unidade e a
 * competência saem dele — quando o PDF permite.
 *
 * A tela nunca esconde o que não foi lido. Três quartos das faturas reais são
 * digitalização e não têm camada de texto: nesses casos o campo aceita o
 * arquivo, diz que não deu para ler e leva para a ficha manual. Preencher com
 * zeros seria pior do que não preencher.
 */

const CAMPOS: { nome: string; rotulo: string; passo?: string }[] = [
  { nome: "valorTotal", rotulo: "Valor total da fatura (R$)", passo: "0.01" },
  { nome: "consumoPontaKwh", rotulo: "Consumo ponta (kWh)" },
  { nome: "consumoForaPontaKwh", rotulo: "Consumo fora ponta (kWh)" },
  { nome: "tarifaPonta", rotulo: "Tarifa ponta (R$/kWh)", passo: "0.000001" },
  { nome: "tarifaForaPonta", rotulo: "Tarifa fora ponta (R$/kWh)", passo: "0.000001" },
  { nome: "valorPonta", rotulo: "Valor da energia em ponta (R$)", passo: "0.01" },
  { nome: "valorForaPonta", rotulo: "Valor da energia fora ponta (R$)", passo: "0.01" },
  { nome: "valorDemanda", rotulo: "Valor da demanda (R$)", passo: "0.01" },
  { nome: "demandaContratadaKw", rotulo: "Demanda contratada (kW)" },
  { nome: "demandaMedidaPontaKw", rotulo: "Demanda medida em ponta (kW)" },
  { nome: "demandaMedidaForaPontaKw", rotulo: "Demanda medida fora ponta (kW)" },
  { nome: "tarifaDemanda", rotulo: "Tarifa de demanda (R$/kW)", passo: "0.01" },
  { nome: "valorReativo", rotulo: "Energia reativa (R$)", passo: "0.01" },
  { nome: "valorBeneficioFiscal", rotulo: "Benefício fiscal (R$)", passo: "0.01" },
  { nome: "valorMultasJurosEncargos", rotulo: "Multas, juros e encargos (R$)", passo: "0.01" },
];

const MOTIVO: Record<string, string> = {
  digitalizacao: "A fatura é uma imagem digitalizada, sem texto para ler.",
  sem_itens: "O layout desta distribuidora ainda não é reconhecido.",
  grupo_b: "Esta é uma fatura do Grupo B (baixa tensão); o estudo é para Grupo A.",
  campos_essenciais_ausentes: "A leitura não encontrou consumo e tarifas completos.",
};

const dinheiro = (valor: number): string =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/[\u00a0\u202f]/g, " ");

/** Compara códigos de UC ignorando pontuação: a fatura e o cadastro divergem. */
const soDigitos = (texto: string): string => texto.replace(/\D/g, "");

export function NovaFaturaView({
  consumerUnits,
  onCancelar,
}: {
  consumerUnits: ConsumerUnitSummary[];
  onCancelar: () => void;
}) {
  const router = useRouter();
  const [leitura, setLeitura] = useState<InvoiceReading | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const campoArquivo = useRef<HTMLInputElement>(null);

  const ucCasada = leitura?.unidadeConsumidoraCodigo
    ? consumerUnits.find(
        (uc) => soDigitos(uc.code) === soDigitos(leitura.unidadeConsumidoraCodigo ?? ""),
      )
    : undefined;

  function enviar(arquivo: File) {
    setErro(null);
    const dados = new FormData();
    dados.append("arquivo", arquivo);

    iniciar(async () => {
      const resultado = await lerFaturaEnviada(dados);
      if (resultado.ok) setLeitura(resultado.leitura);
      else setErro(resultado.erro);
    });
  }

  function abrir(formData: FormData) {
    setErro(null);
    iniciar(async () => {
      const resultado = await abrirEstudoPelaFatura(formData);
      if (resultado.ok) router.push(`/energia-opm/eficiencia/${resultado.id}`);
      else setErro(resultado.erro);
    });
  }

  if (!leitura) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Passo 1</span>
            <h2>Solte a conta de luz</h2>
          </div>
          <button className="button" type="button" onClick={onCancelar}>
            Cancelar
          </button>
        </div>

        <div
          className={`solta-fatura${arrastando ? " solta-fatura--ativa" : ""}`}
          onDragOver={(evento) => {
            evento.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(evento) => {
            evento.preventDefault();
            setArrastando(false);
            const arquivo = evento.dataTransfer.files[0];
            if (arquivo) enviar(arquivo);
          }}
          onClick={() => campoArquivo.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(evento) => {
            if (evento.key === "Enter" || evento.key === " ") campoArquivo.current?.click();
          }}
        >
          <strong>{pendente ? "Lendo a fatura…" : "Arraste o PDF aqui"}</strong>
          <span>ou clique para escolher o arquivo</span>
          <input
            ref={campoArquivo}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) enviar(arquivo);
            }}
          />
        </div>

        <p className="card-note">
          A unidade consumidora e a competência saem da própria fatura. Se ela for uma
          digitalização, o estudo continua — a ficha é preenchida à mão.
        </p>
        {erro ? <p className="auth-error">{erro}</p> : null}
      </ShellCard>
    );
  }

  const confirmados = leitura.itens.filter((item) => item.veredicto === "confirmado");
  const divergentes = leitura.itens.filter((item) => item.veredicto === "divergente");

  return (
    <>
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Passo 2 · {leitura.arquivoNome}</span>
            <h2>Confira o que foi lido</h2>
          </div>
          <div className="page-actions">
            <StatusPill variant={leitura.aproveitavel ? "success" : "warning"}>
              {leitura.aproveitavel
                ? `${confirmados.length} itens conferidos`
                : "preenchimento manual"}
            </StatusPill>
            <button className="button" type="button" onClick={() => setLeitura(null)}>
              Trocar arquivo
            </button>
          </div>
        </div>

        {!leitura.aproveitavel ? (
          <p className="card-note">
            {MOTIVO[leitura.motivo ?? ""] ?? "Não foi possível ler esta fatura."} Preencha os
            campos abaixo com o que está no papel — o cálculo é o mesmo.
          </p>
        ) : (
          <p className="card-note">
            Cada linha foi conferida pela própria fatura: <b>quantidade × tarifa = valor</b>. O que
            não fechou aparece em destaque e não foi aproveitado.
          </p>
        )}

        {leitura.itens.length > 0 ? (
          <ShellTable caption="Itens lidos da fatura">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantidade</th>
                <th>Tarifa</th>
                <th>Valor</th>
                <th>Conferência</th>
              </tr>
            </thead>
            <tbody>
              {leitura.itens.map((item, i) => (
                <tr key={`${item.rotulo}-${i}`}>
                  <td>{item.rotulo}</td>
                  <td>
                    {item.quantidade === null
                      ? "—"
                      : `${item.quantidade.toLocaleString("pt-BR")} ${item.unidade ?? ""}`}
                  </td>
                  <td>{item.tarifa === null ? "—" : item.tarifa.toFixed(6)}</td>
                  <td>{dinheiro(item.valor)}</td>
                  <td>
                    {item.veredicto === "confirmado" ? (
                      <StatusPill variant="success">confere</StatusPill>
                    ) : item.veredicto === "divergente" ? (
                      <StatusPill variant="danger">
                        esperado {dinheiro(item.esperado ?? 0)}
                      </StatusPill>
                    ) : (
                      <StatusPill variant="neutral">sem conferência</StatusPill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ShellTable>
        ) : null}

        {divergentes.length > 0 ? (
          <p className="card-note">
            <b>{divergentes.length} item(ns) não fecharam</b> e ficaram de fora da ficha. É assim
            que erro de leitura é pego antes de virar número no relatório do cliente.
          </p>
        ) : null}
      </ShellCard>

      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Passo 3</span>
            <h2>Complete e abra o estudo</h2>
          </div>
        </div>

        <form className="fatura-form" action={abrir}>
          <label>
            <span>Unidade consumidora</span>
            <select
              name="consumerUnitId"
              required
              defaultValue={ucCasada?.id ?? ""}
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
            <small>
              {leitura.unidadeConsumidoraCodigo
                ? ucCasada
                  ? `Identificada na fatura: ${leitura.unidadeConsumidoraCodigo}`
                  : `A fatura diz ${leitura.unidadeConsumidoraCodigo}, que não está cadastrada — escolha ou cadastre a UC.`
                : "A fatura não trouxe o número da UC."}
            </small>
          </label>
          <input type="hidden" name="clientId" defaultValue={ucCasada?.clientId ?? ""} />

          <label>
            <span>Mês</span>
            <input
              name="competenceMonth"
              type="number"
              min={1}
              max={12}
              defaultValue={leitura.competenceMonth ?? ""}
              required
            />
          </label>
          <label>
            <span>Ano</span>
            <input
              name="competenceYear"
              type="number"
              min={2020}
              max={2100}
              defaultValue={leitura.competenceYear ?? ""}
              required
            />
          </label>

          {CAMPOS.map((campo) => {
            const lido = leitura.invoice[campo.nome as keyof typeof leitura.invoice];
            return (
              <label key={campo.nome} className={lido === undefined ? "campo-pendente" : undefined}>
                <span>{campo.rotulo}</span>
                <input
                  name={campo.nome}
                  type="number"
                  step={campo.passo ?? "1"}
                  min="0"
                  defaultValue={lido ?? 0}
                />
                {lido === undefined ? <small>não veio da fatura</small> : null}
              </label>
            );
          })}

          <label className="campo-largo">
            <span>Histórico de demanda registrada, mês a mês (kW)</span>
            <input name="demandHistory" type="text" placeholder="634, 704, 705, 698, 668, 586" />
            <small>Separe por vírgula. Com doze meses a análise deixa de ser preliminar.</small>
          </label>
          <label className="campo-largo campo-checkbox">
            <input name="hasLoadProfile" type="checkbox" />
            <span>Tenho memória de massa de 15 minutos</span>
          </label>

          <button className="button button--accent" type="submit" disabled={pendente}>
            {pendente ? "Abrindo…" : "Abrir estudo e calcular"}
          </button>
          {erro ? <p className="auth-error">{erro}</p> : null}
        </form>
      </ShellCard>
    </>
  );
}
