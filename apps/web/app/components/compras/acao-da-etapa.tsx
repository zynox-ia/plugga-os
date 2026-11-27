"use client";

import { formasDePagamento, rotulosDaEtapaDeCompra, rotulosDaFormaDePagamento, type AtendimentoPeloEstoque, type FormaDePagamento, type PedidoDeCompra } from "@plugga/shared";
import { Ban, CheckCircle2, Clock, Eye, Paperclip, Plus, ShoppingCart, Sparkles, Truck, UserRound, Wallet, Warehouse, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { enviar } from "../../lib/clientes";
import { AREA_DA_ETAPA, dataEmManaus, diaCurto, hojeEmManaus, pendenciasDaEtapa, tamanhoDoArquivo, urlDoArquivo, valorEmReais } from "../../lib/compras";
import { comparacaoComOrcado, diaDoIso, opcaoDoEstoque, prazoDaEtapaAtual, tituloDoConcluido } from "../../lib/ficha-do-pedido";
import visao from "../pipelines/resumo-do-lead.module.css";
import { EntradaNoEstoqueDoRecebimento, type EstadoDaEntrada } from "../suprimentos/ligacao-com-estoque";
import { Button, DatePicker, FileDropzone, TextField } from "../ui";
import { Segmentado } from "./campos-de-compra";
import { CoberturaDoEstoque } from "./cobertura-do-estoque";
import styles from "./ficha-do-pedido.module.css";

const TOM_DO_PRAZO = { ok: styles.prazoOk, hoje: styles.prazoHoje, vencido: styles.prazoVencido } as const;

/** O que falta para avançar: prazo da etapa, área da vez e checklist (protótipo aprovado). */
export function PainelDoPasso({ pedido, hoje }: { pedido: PedidoDeCompra; hoje: string }) {
  if (pedido.situacao !== "em_andamento" || pedido.etapa === "concluido") return null;
  const itens = pendenciasDaEtapa(pedido);
  const feitos = itens.filter((i) => i.feito || i.opcional).length;
  const prazo = prazoDaEtapaAtual(pedido, hoje);
  const escolhida = pedido.cotacoes.find((c) => c.id === pedido.cotacaoSelecionadaId);
  const comparacao = pedido.etapa === "cotacoes" || pedido.etapa === "aprovacao_compra" ? comparacaoComOrcado(pedido.valorOrcado, escolhida?.valorTotal ?? null) : null;
  return <section className={styles.passo} aria-label="O que falta para avançar">
    <div className={styles.passoTopo}>
      <div>
        <span className={styles.passoRotulo}>O que falta para avançar</span>
        {prazo ? <p><strong className={prazo.tom === "ok" ? undefined : TOM_DO_PRAZO[prazo.tom]}>{prazo.texto}</strong>{prazo.tom === "ok" ? <span className={styles.muted}> · até {diaCurto(prazo.ate)}</span> : null}</p> : null}
      </div>
      <span className={styles.passoQuem}><UserRound size={13} aria-hidden="true" /><span><span className="sr-only">Área da vez: </span>{AREA_DA_ETAPA[pedido.etapa]}</span></span>
    </div>
    <div className={styles.passoBarra} role="progressbar" aria-label="Itens desta etapa concluídos" aria-valuemin={0} aria-valuemax={itens.length} aria-valuenow={feitos}>
      <span style={{ width: `${itens.length ? (feitos / itens.length) * 100 : 0}%` }} />
    </div>
    <ul className={styles.passoLista}>
      {itens.map((i) => <li key={i.texto} data-feito={i.feito || undefined} data-opcional={i.opcional || undefined}>
        {i.feito ? <CheckCircle2 size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
        <span><span className="sr-only">{i.feito ? "Feito: " : "Falta: "}</span>{i.texto}</span>
        {i.opcional && !i.feito ? <small>opcional</small> : null}
      </li>)}
    </ul>
    {comparacao ? <p className={styles.comparativo}>Cotação vencedora <strong className={comparacao.abaixo ? styles.prazoOk : styles.prazoVencido}>{comparacao.diferenca} {comparacao.abaixo ? "abaixo" : "acima"}</strong> do valor orçado.</p> : null}
  </section>;
}

function Destaque({ icone: Icone, titulo, tom, children }: { icone: LucideIcon; titulo: string; tom?: "perigo" | "ok"; children: ReactNode }) {
  return <section className={`${visao.destaque} ${styles.acao} ${tom === "perigo" ? styles.acaoPerigo : tom === "ok" ? styles.acaoOk : ""}`} aria-label={titulo}>
    <h3><Icone size={15} aria-hidden="true" />{titulo}</h3>
    {children}
  </section>;
}

/** A mesma consulta da lista de cobertura, aqui para o botão do estoque; `null` enquanto não chega. */
function useCobertura(pedidoId: string, versao: string): AtendimentoPeloEstoque | "erro" | null {
  const [estado, setEstado] = useState<{ versao: string; dados: AtendimentoPeloEstoque | "erro" } | null>(null);
  useEffect(() => {
    const controle = new AbortController();
    void enviar<AtendimentoPeloEstoque>(`/api/suprimentos/compras/pedidos/${encodeURIComponent(pedidoId)}/atendimento`, "GET", undefined, controle.signal)
      .then((r) => { if (!controle.signal.aborted) setEstado({ versao, dados: r.ok ? r.dados : "erro" }); });
    return () => controle.abort();
  }, [pedidoId, versao]);
  return estado?.versao === versao ? estado.dados : null;
}

/** A decisão da análise, só para quem a tem. O botão do estoque segue a cobertura. */
function DecisaoDoEstoque({ pedido, ocupado, aoDecidir }: { pedido: PedidoDeCompra; ocupado: boolean; aoDecidir: (origem: "estoque" | "aquisicao") => void }) {
  // Uma ação que terminou sem mudar a etapa (recusa) pode ter vindo de saldo novo: consulta de novo.
  const [rodada, setRodada] = useState(0);
  const estavaOcupado = useRef(ocupado);
  useEffect(() => {
    if (estavaOcupado.current && !ocupado) setRodada((r) => r + 1);
    estavaOcupado.current = ocupado;
  }, [ocupado]);
  const versao = `${pedido.updatedAt}:${rodada}`;
  // Regra da API (PLU-332): atender pelo estoque exige todos os itens vinculados ao estoque.
  const vinculados = pedido.itens.length > 0 && pedido.itens.every((i) => i.itemDeEstoque);
  const estoque = opcaoDoEstoque(vinculados, useCobertura(pedido.id, versao));
  return <>
    <CoberturaDoEstoque pedidoId={pedido.id} versao={versao} />
    <div className={styles.decisao}>
      <button type="button" className={styles.opcao} disabled={ocupado || !estoque.disponivel} onClick={() => aoDecidir("estoque")}>
        <span className={styles.opcaoIcone} aria-hidden="true"><Warehouse size={18} /></span>
        <span><strong>Sim, atender pelo estoque</strong><small>{estoque.texto}</small></span>
      </button>
      <button type="button" className={styles.opcao} disabled={ocupado} onClick={() => aoDecidir("aquisicao")}>
        <span className={styles.opcaoIcone} aria-hidden="true"><ShoppingCart size={18} /></span>
        <span><strong>Não, precisa comprar</strong><small>Segue para Cotações.</small></span>
      </button>
    </div>
  </>;
}

export type EstadoDaAcao = {
  forma: FormaDePagamento | null; valorFaturado: string; erroValor?: string; erroForma?: string;
  aoForma: (f: FormaDePagamento) => void; aoValorFaturado: (v: string) => void;
  /** Entrada no estoque dos itens vinculados, no recebimento da aquisição (PLU-333). */
  entrada: EstadoDaEntrada; errosDaEntrada: Record<string, string>; aoEntrada: (v: EstadoDaEntrada) => void;
  /** Dia em que o material chegou (AAAA-MM-DD), nos dois caminhos; não pode ser futuro. */
  recebidoEm: string; erroRecebidoEm?: string; aoRecebidoEm: (v: string) => void;
};

/** O bloco da etapa atual: decisão de estoque, resumo para aprovar, pagamento, recebimento ou o encerramento. */
export function AcaoDaEtapa({ pedido, ocupado, estado, aoDecidir, aoVerCotacoes, aoNovaCotacao, aoComprovante }: {
  pedido: PedidoDeCompra; ocupado: boolean; estado: EstadoDaAcao;
  aoDecidir: (origem: "estoque" | "aquisicao") => void; aoVerCotacoes: () => void; aoNovaCotacao: () => void; aoComprovante: (arquivo: File) => void;
}) {
  const pode = (a: PedidoDeCompra["acoesPermitidas"][number]) => pedido.acoesPermitidas.includes(a);
  const escolhida = pedido.cotacoes.find((c) => c.id === pedido.cotacaoSelecionadaId);
  const cancelado = pedido.marcos.cancelado;
  if (pedido.situacao === "cancelado" && cancelado) return <Destaque icone={Ban} titulo="Pedido cancelado" tom="perigo">
    <p>Cancelado{cancelado.por ? ` por ${cancelado.por.nome}` : ""} em {dataEmManaus(cancelado.em)}, na etapa {rotulosDaEtapaDeCompra[pedido.etapa]}.</p>
    <p className={styles.motivo}><strong>Motivo:</strong> {cancelado.motivo}</p>
  </Destaque>;

  switch (pedido.etapa) {
    case "pedido_gerado": return <Destaque icone={Sparkles} titulo="Próximo passo">
      <p>Confira o pedido e comece a análise: verificar se o material já está em estoque ou se o pedido já foi faturado.</p>
    </Destaque>;
    case "analise_estoque": return <Destaque icone={Warehouse} titulo="Possui em estoque? / Pedido já faturado?">
      <p>A decisão define o caminho do pedido.{pode("decidir_estoque") ? null : " Quem decide é a equipe de Compras."}</p>
      {pode("decidir_estoque") ? <DecisaoDoEstoque pedido={pedido} ocupado={ocupado} aoDecidir={aoDecidir} />
        : <CoberturaDoEstoque pedidoId={pedido.id} versao={pedido.updatedAt} />}
    </Destaque>;
    case "cotacoes": return <Destaque icone={Paperclip} titulo="Cotações">
      <p>{pedido.cotacoes.length} {pedido.cotacoes.length === 1 ? "cotação registrada" : "cotações registradas"} (recomendado: 3). {escolhida ? <>Vencedora: <strong>{escolhida.fornecedor.nome}</strong>, {valorEmReais(escolhida.valorTotal)} com frete.</> : "Escolha a vencedora para enviar para aprovação."}</p>
      <div className={styles.botoes}>
        <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={aoVerCotacoes} disabled={pedido.cotacoes.length === 0}>Comparar cotações</Button>
        {pedido.podeRegistrarCotacao ? <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={aoNovaCotacao} disabled={ocupado}>Adicionar cotação</Button> : null}
      </div>
    </Destaque>;
    case "aprovacao_compra": return <Destaque icone={CheckCircle2} titulo="Aprovação da compra">
      <p>Aprovação do Financeiro. Confira a cotação vencedora antes de aprovar.</p>
      {escolhida ? <ResumoDaVencedora cotacao={escolhida} /> : null}
      <p className={styles.muted}>{pedido.cotacoes.length - 1 === 1 ? "1 outra cotação" : `${Math.max(0, pedido.cotacoes.length - 1)} outras cotações`} no comparativo. Revisar volta o pedido para Cotações e desmarca a vencedora.</p>
    </Destaque>;
    case "pagamento": return <Destaque icone={Wallet} titulo="Registrar pagamento">
      {escolhida ? <p>{valorEmReais(escolhida.valorTotal)} para <strong>{escolhida.fornecedor.nome}</strong>{escolhida.condicoesPagamento ? ` · ${escolhida.condicoesPagamento}` : ""}.</p> : null}
      {pode("registrar_pagamento") ? <Segmentado rotulo="Forma de pagamento" obrigatorio valor={estado.forma} aoMudar={estado.aoForma} erro={estado.erroForma}
        opcoes={formasDePagamento.map((f) => ({ valor: f, rotulo: rotulosDaFormaDePagamento[f] }))} />
        : <p>Quem registra o pagamento é o Financeiro.</p>}
      {pedido.comprovantePendente ? <div className={styles.arquivoPendente}>
        <a className={styles.anexo} href={urlDoArquivo(pedido.comprovantePendente.url)} target="_blank" rel="noopener noreferrer"><Paperclip size={13} aria-hidden="true" /><span>{pedido.comprovantePendente.nome}</span></a>
        <span className={styles.muted}>{tamanhoDoArquivo(pedido.comprovantePendente.tamanhoBytes)}</span>
      </div> : null}
      {pode("registrar_pagamento") ? <FileDropzone label={pedido.comprovantePendente ? "Trocar o comprovante (opcional)" : "Comprovante (opcional, PDF ou imagem até 25 MB)"} value={[]} disabled={ocupado}
        onChange={(arquivos) => { const ultimo = arquivos.at(-1); if (ultimo) aoComprovante(ultimo); }} /> : null}
    </Destaque>;
    case "retirada": {
      const estoque = pedido.origemAtendimento === "estoque";
      return <Destaque icone={Truck} titulo={estoque ? "Separar e entregar do estoque" : "Retirada ou recebimento"}>
        <p>{estoque ? "O material sai do estoque. Confirme quando for entregue no destino." : `${pedido.pagamento ? `Pago por ${rotulosDaFormaDePagamento[pedido.pagamento.forma]} em ${dataEmManaus(pedido.pagamento.registrado.em)}. ` : ""}Confirme quando o material chegar ou for retirado; o pedido é concluído.`}</p>
        {pode("confirmar_recebimento") ? <DatePicker label="Recebido em" required min={hojeEmManaus(new Date(pedido.createdAt))} max={hojeEmManaus()} value={estado.recebidoEm} onChange={estado.aoRecebidoEm} hint={estoque ? "Dia em que o material foi entregue no destino." : "Dia em que o material chegou ou foi retirado."} error={estado.erroRecebidoEm} /> : null}
        {!estoque && pode("confirmar_recebimento") ? <TextField label="Valor faturado" required inputMode="decimal" prefix="R$" value={estado.valorFaturado} onChange={(e) => estado.aoValorFaturado(e.target.value)} placeholder="0,00" hint="Valor da nota fiscal." error={estado.erroValor} /> : null}
        {!estoque && pode("confirmar_recebimento") ? <EntradaNoEstoqueDoRecebimento pedido={pedido} valor={estado.entrada} aoMudar={estado.aoEntrada} erros={estado.errosDaEntrada} disabled={ocupado} /> : null}
      </Destaque>;
    }
    case "concluido": {
      const fora = pedido.passagens.filter((x) => x.cumpriuPrazo === false).length;
      const fim = pedido.marcos.recebimentoConfirmado?.em ?? pedido.updatedAt;
      return <Destaque icone={CheckCircle2} titulo={tituloDoConcluido(pedido.origemAtendimento)} tom="ok">
        <p>Concluído em {diaCurto(diaDoIso(fim))}{pedido.valorFaturado ? ` · ${valorEmReais(pedido.valorFaturado)} faturado` : ""} · {fora === 0 ? "todas as etapas no prazo" : `${fora} ${fora === 1 ? "etapa" : "etapas"} fora do prazo`}.</p>
      </Destaque>;
    }
  }
}

export function ResumoDaVencedora({ cotacao }: { cotacao: PedidoDeCompra["cotacoes"][number] }) {
  return <div className={styles.resumoCotacao}>
    <div><span>Fornecedor</span><strong>{cotacao.fornecedor.nome}</strong></div>
    <div><span>Total com frete</span><strong>{valorEmReais(cotacao.valorTotal)}</strong></div>
    <div><span>Entrega</span><strong>{cotacao.prazoEntregaDias ? `${cotacao.prazoEntregaDias} dias úteis` : "Não informada"}</strong></div>
    <div><span>Condições</span><strong>{cotacao.condicoesPagamento ?? "Não informadas"}</strong></div>
  </div>;
}
