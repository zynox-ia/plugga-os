"use client";

import type { PedidoDeCompra } from "@plugga/shared";
import { Check, Paperclip, Plus, Trophy } from "lucide-react";

import { dataEmManaus, valorEmReais, urlDoArquivo } from "../../lib/compras";
import { destaquesDasCotacoes } from "../../lib/ficha-do-pedido";
import { Button } from "../ui";
import styles from "./ficha-do-pedido.module.css";

/** Cotações lado a lado, com vencedora, menor total e menor prazo. Cotação registrada não é excluída. */
export function CotacoesDoPedido({ pedido, ocupado, aoEscolher, aoNovaCotacao }: {
  pedido: PedidoDeCompra; ocupado: boolean; aoEscolher: (cotacaoId: string) => void; aoNovaCotacao: () => void;
}) {
  const podeEscolher = pedido.acoesPermitidas.includes("selecionar_cotacao");
  const { menorTotal, menorPrazo } = destaquesDasCotacoes(pedido.cotacoes);
  const vazio = pedido.origemAtendimento === "estoque"
    ? { titulo: "Sem cotações: atendido pelo estoque", texto: "O pedido pulou Cotações, Aprovação e Pagamento." }
    : pedido.etapa === "pedido_gerado" || pedido.etapa === "analise_estoque"
      ? { titulo: "As cotações começam depois da análise de estoque", texto: "Quando o pedido seguir para compra, registre as cotações com fornecedor do cadastro e anexo." }
      : { titulo: "Nenhuma cotação registrada", texto: "Registre as cotações com fornecedor do cadastro e anexo. O recomendado é comparar 3." };

  return <div className={styles.secao}>
    <div className={styles.barra}>
      <div><h3>Cotações <span className={styles.contaAba}>{String(pedido.cotacoes.length).padStart(2, "0")}</span></h3><p>Compare lado a lado. Cotação registrada não é excluída.</p></div>
      {pedido.podeRegistrarCotacao ? <Button size="sm" icon={<Plus size={14} />} disabled={ocupado} onClick={aoNovaCotacao}>Adicionar cotação</Button> : null}
    </div>
    {pedido.cotacoes.length === 0 ? <div className={styles.vazio}>
      <span className={styles.vazioIcone} aria-hidden="true"><Paperclip size={18} /></span>
      <h3>{vazio.titulo}</h3><p className={styles.muted}>{vazio.texto}</p>
    </div> : <div className={styles.cotacoes}>
      {pedido.cotacoes.map((c) => {
        const vencedora = c.id === pedido.cotacaoSelecionadaId;
        return <article key={c.id} className={`${styles.cotacao} ${vencedora ? styles.vencedora : ""}`} aria-label={`Cotação de ${c.fornecedor.nome}${vencedora ? ", vencedora" : ""}`}>
          <header>
            <div><h4>{c.fornecedor.nome}</h4>{!c.fornecedor.ativo ? <small>Fornecedor inativo</small> : null}</div>
            {vencedora ? <span className={`${styles.selo} ${styles.seloOk}`}><Trophy size={12} aria-hidden="true" />Vencedora</span> : null}
          </header>
          <div className={styles.tags}>
            {menorTotal.has(c.id) ? <span className={`${styles.selo} ${styles.seloInfo}`}>Menor total</span> : null}
            {menorPrazo.has(c.id) ? <span className={`${styles.selo} ${styles.seloNeutro}`}>Menor prazo</span> : null}
          </div>
          <dl>
            <div><dt>Valor</dt><dd>{valorEmReais(c.valor)}</dd></div>
            <div><dt>Frete</dt><dd>{c.valorFrete && Number(c.valorFrete) > 0 ? valorEmReais(c.valorFrete) : "Grátis"}</dd></div>
            <div className={styles.total}><dt>Total</dt><dd>{valorEmReais(c.valorTotal)}</dd></div>
            <div><dt>Entrega</dt><dd>{c.prazoEntregaDias ? `${c.prazoEntregaDias} dias úteis` : "Não informada"}</dd></div>
            <div><dt>Condições</dt><dd>{c.condicoesPagamento ?? "Não informadas"}</dd></div>
          </dl>
          <a className={styles.anexo} href={urlDoArquivo(c.arquivo.url)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir o anexo ${c.arquivo.nome}`}><Paperclip size={13} aria-hidden="true" /><span>{c.arquivo.nome}</span></a>
          {podeEscolher ? <Button variant="secondary" size="sm" className={`${styles.escolher} ${vencedora ? styles.escolhida : ""}`} aria-pressed={vencedora}
            icon={vencedora ? <Check size={14} /> : <Trophy size={14} />} disabled={ocupado || vencedora} onClick={() => aoEscolher(c.id)}>{vencedora ? "Escolhida" : "Escolher como vencedora"}</Button> : null}
          <p className={styles.rodapeCotacao}>Registrada{c.criada.por ? ` por ${c.criada.por.nome.split(" ")[0]}` : ""} em {dataEmManaus(c.criada.em)}</p>
        </article>;
      })}
    </div>}
  </div>;
}
