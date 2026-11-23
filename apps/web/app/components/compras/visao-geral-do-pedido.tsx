"use client";

import { etapasDeCompra, rotulosDaEtapaDeCompra, rotulosDaFormaDePagamento, rotulosDoDestinoDeCompra, type AcaoDoPedido, type FormaDePagamento, type PedidoDeCompra } from "@plugga/shared";
import { ArrowRight, Ban, Check, Send, ShoppingCart, Truck, Undo2, Wallet, X } from "lucide-react";
import { useState } from "react";

import { dataEmManaus, decimalDigitado, ROTULO_DA_EMPRESA, diaCurto, diaLegivel, valorEmReais } from "../../lib/compras";
import { etapasPuladas, prazoDaEtapaAtual } from "../../lib/ficha-do-pedido";
import { Avatar } from "../pipelines/icones";
import visao from "../pipelines/resumo-do-lead.module.css";
import { Button } from "../ui";
import { displayCurrency } from "../ui/currency-value";
import { AcaoDaEtapa, PainelDoPasso } from "./acao-da-etapa";
import styles from "./ficha-do-pedido.module.css";

const TOM = { ok: styles.prazoOk, hoje: styles.prazoHoje, vencido: styles.prazoVencido } as const;

function Trilha({ pedido }: { pedido: PedidoDeCompra }) {
  const atual = etapasDeCompra.indexOf(pedido.etapa);
  const puladas = etapasPuladas(pedido);
  const cancelado = pedido.situacao === "cancelado";
  return <ol className={`${visao.trilha} ${styles.trilha}`} aria-label="Etapas do pedido">
    {etapasDeCompra.map((etapa, i) => {
      const pulada = puladas.has(etapa);
      const aqui = etapa === pedido.etapa;
      const passou = (i < atual || pedido.etapa === "concluido") && !pulada;
      return <li key={etapa} aria-current={aqui && !cancelado ? "step" : undefined} data-anterior={(passou && !aqui) || undefined}
        data-pulada={pulada || undefined} data-cancelada={(aqui && cancelado) || undefined}>
        <button type="button" disabled>
          <span className={visao.marcador} aria-hidden="true">{aqui && cancelado ? <X size={12} /> : passou && !aqui ? <Check size={12} /> : i + 1}</span>
          <span>{rotulosDaEtapaDeCompra[etapa]}
            {pulada ? <small className={styles.nota}>pulada</small> : null}
            {aqui && cancelado ? <small className={`${styles.nota} ${styles.notaPerigo}`}>cancelado aqui</small> : null}
          </span>
        </button>
      </li>;
    })}
  </ol>;
}

/** Visão geral da ficha: indicadores e trilha, o que falta para avançar, a ação da etapa, os dados e o rodapé com as ações. */
export function VisaoGeralDoPedido({ pedido, hoje, ocupado, aoAgir, aoPedirMotivo, aoVerCotacoes, aoNovaCotacao, aoComprovante }: {
  pedido: PedidoDeCompra; hoje: string; ocupado: boolean;
  aoAgir: (acao: AcaoDoPedido) => void; aoPedirMotivo: (acao: "cancelar" | "revisar") => void;
  aoVerCotacoes: () => void; aoNovaCotacao: () => void; aoComprovante: (arquivo: File) => void;
}) {
  const escolhida = pedido.cotacoes.find((c) => c.id === pedido.cotacaoSelecionadaId);
  const [forma, setForma] = useState<FormaDePagamento | null>(pedido.pagamento?.forma ?? null);
  const [valorFaturado, setValorFaturado] = useState(() => (pedido.valorCotado ? displayCurrency(Number(pedido.valorCotado).toFixed(2)) : ""));
  const [erros, setErros] = useState<{ forma?: string; valor?: string }>({});
  const pode = (a: PedidoDeCompra["acoesPermitidas"][number]) => pedido.acoesPermitidas.includes(a);
  const prazo = prazoDaEtapaAtual(pedido, hoje);
  const valor = pedido.valorFaturado ?? pedido.valorCotado ?? pedido.valorOrcado;
  const rotuloDoValor = pedido.valorFaturado ? "Valor faturado" : pedido.valorCotado ? "Cotação vencedora (com frete)" : "Valor orçado";
  const destino = pedido.destino.obra?.nome ?? pedido.destino.cliente?.nome;
  const encerrado = pedido.situacao !== "em_andamento";

  function pagar() {
    if (!forma) { setErros({ forma: "escolha a forma de pagamento." }); return; }
    setErros({}); aoAgir({ acao: "registrar_pagamento", forma });
  }
  function receber() {
    if (pedido.origemAtendimento === "estoque") { aoAgir({ acao: "confirmar_recebimento" }); return; }
    const v = decimalDigitado(valorFaturado);
    if (!v || Number(v) <= 0) { setErros({ valor: "informe o valor da nota, como 1.450,00." }); return; }
    setErros({}); aoAgir({ acao: "confirmar_recebimento", valorFaturado: v });
  }

  const principal = pedido.etapa === "pedido_gerado" && pode("iniciar_analise") ? <Button icon={<ArrowRight size={15} />} disabled={ocupado} onClick={() => aoAgir({ acao: "iniciar_analise" })}>Iniciar análise de estoque</Button>
    : pedido.etapa === "cotacoes" && pode("enviar_para_aprovacao") ? <Button icon={<Send size={15} />} disabled={ocupado || !escolhida} title={escolhida ? undefined : "Escolha a vencedora antes"} onClick={() => aoAgir({ acao: "enviar_para_aprovacao" })}>Enviar para aprovação</Button>
    : pedido.etapa === "aprovacao_compra" ? <>
      {pode("revisar") ? <Button variant="secondary" icon={<Undo2 size={15} />} disabled={ocupado} onClick={() => aoPedirMotivo("revisar")}>Revisar cotações</Button> : null}
      {pode("aprovar") ? <Button icon={<Check size={15} />} disabled={ocupado} onClick={() => aoAgir({ acao: "aprovar" })}>Aprovar compra</Button> : null}
    </>
    : pedido.etapa === "pagamento" && pode("registrar_pagamento") ? <Button icon={<Wallet size={15} />} disabled={ocupado} onClick={pagar}>Registrar pagamento</Button>
    : pedido.etapa === "retirada" && pode("confirmar_recebimento") ? <Button icon={<Truck size={15} />} disabled={ocupado} onClick={receber}>Confirmar recebimento</Button>
    : null;

  return <div className={visao.resumo}>
    <section aria-label="Indicadores do pedido" className={visao.indicadores}>
      <header className={visao.identidade}>
        <span className={visao.iconeNegocio} aria-hidden="true"><ShoppingCart size={18} /></span>
        <div className={visao.identidadeTexto}>
          <p className={visao.muted}>Aberto em {dataEmManaus(pedido.createdAt)} por {pedido.solicitante.nome}</p>
          <span className={visao.etapaAtual}>{pedido.situacao === "cancelado" ? "Cancelado" : rotulosDaEtapaDeCompra[pedido.etapa]}</span>
        </div>
        <div className={`${visao.valor} ${styles.valorDoPedido}`}>
          <span className={valor ? undefined : visao.valorVazio}><span className="sr-only">{rotuloDoValor}: </span>{valorEmReais(valor) ?? "Sem valor"}</span>
          {prazo ? <small className={TOM[prazo.tom]}>{prazo.tom === "ok" ? `No prazo · até ${diaCurto(prazo.ate)}` : prazo.texto}</small> : <small>{rotuloDoValor}</small>}
        </div>
      </header>
      <Trilha pedido={pedido} />
    </section>

    <PainelDoPasso pedido={pedido} hoje={hoje} />

    <AcaoDaEtapa pedido={pedido} ocupado={ocupado}
      estado={{ forma, valorFaturado, erroForma: erros.forma, erroValor: erros.valor, aoForma: setForma, aoValorFaturado: setValorFaturado }}
      aoDecidir={(origem) => aoAgir({ acao: "decidir_estoque", origem })} aoVerCotacoes={aoVerCotacoes} aoNovaCotacao={aoNovaCotacao} aoComprovante={aoComprovante} />

    <section aria-label="Dados do pedido">
      <dl className={visao.grade}>
        <div><dt>Empresa</dt><dd>{ROTULO_DA_EMPRESA[pedido.empresa]}</dd></div>
        <div><dt>Solicitante</dt><dd>{pedido.solicitante.nome}</dd></div>
        <div><dt>Responsável</dt><dd className={visao.responsavel}>{pedido.responsavel ? <><Avatar id={pedido.responsavel.id} nome={pedido.responsavel.nome} tamanho="pequeno" />{pedido.responsavel.nome}</> : "Sem responsável"}</dd></div>
        <div><dt>Destino</dt><dd>{rotulosDoDestinoDeCompra[pedido.destino.tipo]}{destino ? ` · ${destino}` : ""}</dd></div>
        <div><dt>Entrega desejada</dt><dd>{diaLegivel(pedido.prazoEntregaDesejado)}</dd></div>
        <div><dt>Estoque ou compra</dt><dd>{pedido.origemAtendimento === "estoque" ? "Atendido pelo estoque" : pedido.origemAtendimento === "aquisicao" ? "Compra externa" : "A decidir na análise"}{pedido.marcos.estoqueDecidido?.por ? <small>Decidido por {pedido.marcos.estoqueDecidido.por.nome}</small> : null}</dd></div>
        <div><dt>Valor orçado</dt><dd>{valorEmReais(pedido.valorOrcado) ?? "Não informado"}</dd></div>
        <div><dt>{pedido.valorFaturado ? "Valor faturado" : "Cotação vencedora"}</dt><dd>{pedido.valorFaturado ? valorEmReais(pedido.valorFaturado) : escolhida ? <>{valorEmReais(escolhida.valorTotal)}<small>{escolhida.fornecedor.nome}{pedido.pagamento ? ` · pago por ${rotulosDaFormaDePagamento[pedido.pagamento.forma]} em ${dataEmManaus(pedido.pagamento.registrado.em)}` : escolhida.prazoEntregaDias ? ` · entrega em ${escolhida.prazoEntregaDias} dias úteis` : ""}</small></> : "—"}</dd></div>
      </dl>
    </section>

    <section className={visao.secao} aria-label="Observações">
      <h3>Observações</h3>
      <p className={visao.notas}>{pedido.descricao || "Sem observações."}</p>
    </section>

    {!encerrado && (pode("cancelar") || principal) ? <footer className={styles.rodape}>
      {pode("cancelar") ? <Button variant="secondary" className={styles.perigo} icon={<Ban size={15} />} disabled={ocupado} onClick={() => aoPedirMotivo("cancelar")}>Cancelar pedido</Button> : null}
      <span className={styles.espaco} />
      {principal}
    </footer> : null}
  </div>;
}
