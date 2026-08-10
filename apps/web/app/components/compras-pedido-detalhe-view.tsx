"use client";

import type { PedidoDetalhe } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  confirmarRecebimento,
  decidirAprovacao,
  decidirEstoque,
  registrarPagamento,
  selecionarCotacao,
  triagem,
  validarNecessidade,
} from "../lib/compras-client";
import { ETAPAS } from "./compras-view";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

/**
 * Ficha do pedido: dados, itens, comparativo de cotações, linha do tempo das
 * etapas e o painel da etapa corrente.
 *
 * Ação bloqueada pela segregação de função aparece **desabilitada com o
 * motivo**, não sumida: botão que some faz a pessoa procurar onde não existe, e
 * o controle só ensina alguma coisa se explicar por que atrapalhou.
 */

function moeda(valor: string | null): string {
  if (!valor) return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataHora(valor: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function ComprasPedidoDetalheView({
  pedido,
  empresa,
  isLive,
}: {
  pedido: PedidoDetalhe;
  empresa: string;
  isLive: boolean;
}) {
  const router = useRouter();
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cotacaoEscolhida, setCotacaoEscolhida] = useState<string>(pedido.cotacaoSelecionadaId ?? "");
  const [valorFaturado, setValorFaturado] = useState<string>(pedido.valorCotado ?? "");
  const [motivo, setMotivo] = useState("");

  const bloqueio = (acao: string) => pedido.acoesBloqueadas.find((item) => item.acao === acao) ?? null;

  async function executar(acao: () => Promise<{ ok: boolean; message?: string }>) {
    setPendente(true);
    setErro(null);
    const resultado = await acao();
    setPendente(false);
    if (!resultado.ok) {
      setErro(resultado.message ?? "não foi possível concluir a ação");
      return;
    }
    router.refresh();
  }

  const total = (valor: string, frete: string | null) => Number(valor) + Number(frete ?? 0);

  return (
    <>
      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">
              <Link href={`/compras?empresa=${empresa}`}>Compras</Link> · pedido #{pedido.numero}
            </span>
            <h2>{pedido.titulo}</h2>
          </div>
          <div className="row-actions">
            {!isLive ? <StatusPill variant="warning">Dados de exemplo</StatusPill> : null}
            <StatusPill variant="neutral">
              {ETAPAS.find((etapa) => etapa.id === pedido.etapa)?.label ?? pedido.etapa}
            </StatusPill>
            {pedido.situacaoPrazo === "vencida" ? <StatusPill variant="danger">Prazo vencido</StatusPill> : null}
          </div>
        </div>

        <ShellTable caption="Resumo do pedido">
          <tbody>
            <tr>
              <th scope="row">Destino</th>
              <td>
                {pedido.destino === "obra"
                  ? `Obra · ${pedido.obraNome ?? "—"}`
                  : pedido.destino === "cliente"
                    ? `Cliente · ${pedido.clientNome ?? "—"}`
                    : "Interno"}
              </td>
            </tr>
            <tr>
              <th scope="row">Solicitante</th>
              <td>{pedido.solicitanteNome}</td>
            </tr>
            <tr>
              <th scope="row">Responsável de Compras</th>
              <td>{pedido.responsavelNome ?? "—"}</td>
            </tr>
            <tr>
              <th scope="row">Entrega desejada</th>
              <td>{dataHora(pedido.prazoEntregaDesejado)}</td>
            </tr>
            <tr>
              <th scope="row">Orçado · Cotado · Faturado</th>
              <td>
                {moeda(pedido.valorOrcado)} · {moeda(pedido.valorCotado)} · {moeda(pedido.valorFaturado)}
              </td>
            </tr>
            <tr>
              <th scope="row">Prazo da etapa atual</th>
              <td>{dataHora(pedido.prazoEtapaEm)}</td>
            </tr>
          </tbody>
        </ShellTable>
      </ShellCard>

      <ShellCard className="table-card">
        <div className="card-heading">
          <h2>Itens</h2>
        </div>
        <ShellTable caption="Itens do pedido">
          <thead>
            <tr>
              <th>Material</th>
              <th>Quantidade</th>
            </tr>
          </thead>
          <tbody>
            {pedido.itens.map((item) => (
              <tr key={item.id}>
                <td>{item.descricao}</td>
                <td>
                  {Number(item.quantidade).toLocaleString("pt-BR")} {item.unidade ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </ShellTable>
      </ShellCard>

      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">POP §2.3</span>
            <h2>Comparativo de cotações</h2>
          </div>
        </div>
        {/* Frete e prazo ao lado do valor: comparar propostas só pelo preço da
            mercadoria esconde justamente a diferença que costuma decidir. */}
        <ShellTable caption="Cotações anexadas">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Valor</th>
              <th>Frete</th>
              <th>Total</th>
              <th>Prazo</th>
              <th>Condições</th>
              <th>Anexo</th>
            </tr>
          </thead>
          <tbody>
            {pedido.cotacoes.map((cotacao) => (
              <tr key={cotacao.id}>
                <td>
                  {cotacao.fornecedorNome}{" "}
                  {cotacao.selecionada ? <StatusPill variant="success">Selecionada</StatusPill> : null}
                </td>
                <td>{moeda(cotacao.valor)}</td>
                <td>{moeda(cotacao.valorFrete)}</td>
                <td>
                  <strong>{moeda(total(cotacao.valor, cotacao.valorFrete).toFixed(2))}</strong>
                </td>
                <td>{cotacao.prazoEntregaDias !== null ? `${cotacao.prazoEntregaDias} d.u.` : "—"}</td>
                <td>{cotacao.condicoesPagamento ?? "—"}</td>
                <td>{cotacao.arquivoNome}</td>
              </tr>
            ))}
          </tbody>
        </ShellTable>
      </ShellCard>

      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">POP §3 · dias úteis</span>
            <h2>Linha do tempo das etapas</h2>
          </div>
        </div>
        <ShellTable caption="Passagens por etapa">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Entrou</th>
              <th>Prazo</th>
              <th>Saiu</th>
              <th>Cumpriu</th>
            </tr>
          </thead>
          <tbody>
            {pedido.etapas.map((passagem) => (
              <tr key={passagem.id}>
                <td>{ETAPAS.find((etapa) => etapa.id === passagem.etapa)?.label ?? passagem.etapa}</td>
                <td>{dataHora(passagem.entrouEm)}</td>
                <td>
                  {dataHora(passagem.prazoEm)} <span className="card-note">({passagem.prazoDiasUteis} d.u.)</span>
                </td>
                <td>{dataHora(passagem.saiuEm)}</td>
                <td>
                  {passagem.cumpriuPrazo === null ? (
                    "—"
                  ) : passagem.cumpriuPrazo ? (
                    <StatusPill variant="success">Sim</StatusPill>
                  ) : (
                    <StatusPill variant="danger">Não</StatusPill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </ShellTable>
      </ShellCard>

      <ShellCard className="table-card">
        <div className="card-heading">
          <h2>Ação desta etapa</h2>
        </div>
        <div style={{ padding: "0 18px 18px", display: "grid", gap: 12 }}>
          {erro ? (
            <p className="auth-error" role="alert">
              {erro}
            </p>
          ) : null}

          {pedido.etapa === "pedido_gerado" ? (
            <div className="row-actions">
              <button
                className="button button--accent"
                type="button"
                disabled={pendente}
                onClick={() => executar(() => triagem(pedido.id, empresa, {}))}
              >
                Encaminhar para análise de estoque
              </button>
            </div>
          ) : null}

          {pedido.etapa === "analise_estoque" ? (
            <div className="row-actions">
              <button
                className="button button--accent"
                type="button"
                disabled={pendente}
                onClick={() => executar(() => decidirEstoque(pedido.id, empresa, { possuiEmEstoque: true }))}
              >
                SIM · possui em estoque
              </button>
              <button
                className="button"
                type="button"
                disabled={pendente}
                onClick={() => executar(() => decidirEstoque(pedido.id, empresa, { possuiEmEstoque: false }))}
              >
                NÃO · seguir para cotações
              </button>
            </div>
          ) : null}

          {pedido.etapa === "cotacoes" ? (
            <>
              {!pedido.necessidadeValidadaEm ? (
                <div className="row-actions">
                  <button
                    className="button button--accent"
                    type="button"
                    disabled={pendente}
                    onClick={() => executar(() => validarNecessidade(pedido.id, empresa, {}))}
                  >
                    Validar necessidade do material
                  </button>
                </div>
              ) : (
                <div className="row-actions" style={{ alignItems: "center", gap: 10 }}>
                  <label>
                    Cotação escolhida
                    <select value={cotacaoEscolhida} onChange={(e) => setCotacaoEscolhida(e.target.value)}>
                      <option value="">Selecione…</option>
                      {pedido.cotacoes.map((cotacao) => (
                        <option key={cotacao.id} value={cotacao.id}>
                          {cotacao.fornecedorNome} · {moeda(total(cotacao.valor, cotacao.valorFrete).toFixed(2))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button--accent"
                    type="button"
                    disabled={pendente || !cotacaoEscolhida}
                    onClick={() =>
                      executar(() => selecionarCotacao(pedido.id, empresa, { cotacaoId: cotacaoEscolhida }))
                    }
                  >
                    Enviar para aprovação
                  </button>
                </div>
              )}
            </>
          ) : null}

          {pedido.etapa === "aprovacao_compra" ? (
            <>
              {bloqueio("aprovacao") ? (
                <p className="card-note" role="note">
                  Aprovação indisponível: {bloqueio("aprovacao")?.motivo}.
                </p>
              ) : null}
              <label>
                Motivo (obrigatório ao revisar)
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
              </label>
              <div className="row-actions">
                <button
                  className="button button--accent"
                  type="button"
                  disabled={pendente || bloqueio("aprovacao") !== null}
                  onClick={() => executar(() => decidirAprovacao(pedido.id, empresa, { aprovada: true }))}
                >
                  APROVADA
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={pendente || bloqueio("aprovacao") !== null || motivo.trim().length === 0}
                  onClick={() =>
                    executar(() => decidirAprovacao(pedido.id, empresa, { aprovada: false, motivo: motivo.trim() }))
                  }
                >
                  REVISAR
                </button>
              </div>
            </>
          ) : null}

          {pedido.etapa === "pagamento" ? (
            <>
              {bloqueio("pagamento") ? (
                <p className="card-note" role="note">
                  Pagamento indisponível: {bloqueio("pagamento")?.motivo}.
                </p>
              ) : null}
              <label>
                Valor faturado
                <input value={valorFaturado} onChange={(e) => setValorFaturado(e.target.value)} inputMode="decimal" />
              </label>
              <div className="row-actions">
                <button
                  className="button button--accent"
                  type="button"
                  disabled={pendente || bloqueio("pagamento") !== null || !valorFaturado}
                  onClick={() => executar(() => registrarPagamento(pedido.id, empresa, { valorFaturado }))}
                >
                  Registrar pagamento
                </button>
              </div>
            </>
          ) : null}

          {pedido.etapa === "retirada" ? (
            <>
              {/* Quem confirma é quem pediu o material — ver a divergência
                  declarada em docs/processos/compras-suprimentos.md. */}
              <p className="card-note">
                O recebimento é confirmado por <strong>{pedido.solicitanteNome}</strong>, que pediu o material.
              </p>
              {bloqueio("recebimento") ? (
                <p className="card-note" role="note">
                  Recebimento indisponível: {bloqueio("recebimento")?.motivo}.
                </p>
              ) : null}
              <div className="row-actions">
                <button
                  className="button button--accent"
                  type="button"
                  disabled={pendente || bloqueio("recebimento") !== null}
                  onClick={() => executar(() => confirmarRecebimento(pedido.id, empresa, {}))}
                >
                  Confirmar recebimento e CONCLUIR
                </button>
              </div>
            </>
          ) : null}

          {pedido.etapa === "concluido" ? (
            <p className="card-note">
              Aquisição concluída em {dataHora(pedido.concluidoEm)}. O card está na pipeline final.
            </p>
          ) : null}
        </div>
      </ShellCard>
    </>
  );
}
