"use client";

import { rotulosDaEtapaDeCompra, rotulosDaFormaDePagamento, type EtapaDeCompra, type Fornecedor, type HistoricoDeCotacoesResposta } from "@plugga/shared";
import { Check, Copy, Eye, EyeOff, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { dataEmManaus, hrefDeCompras, numeroDoPedido, valorEmReais } from "../../lib/compras";
import { larguraDaBarra, mascararSegredo } from "../../lib/fornecedores";
import { EmpresaDoPedido } from "../compras/quadro-de-compras";
import { Button } from "../ui";
import styles from "./ficha-do-fornecedor.module.css";

const situacaoDoPedido = (s: string) => (s === "cancelado" ? "Cancelado" : rotulosDaEtapaDeCompra[s as EtapaDeCompra] ?? s);

/**
 * Histórico de cotações: pedido, data, barra do valor e se venceu. O link para
 * o pedido só aparece para quem abre Compras; para os outros, só o número.
 */
export function CotacoesDoFornecedor({ historico, podeAbrirCompras }: { historico: HistoricoDeCotacoesResposta | null; podeAbrirCompras: boolean }) {
  if (!historico) return <p className={styles.vazio} role="status">Não foi possível carregar o histórico de cotações agora.</p>;
  const maior = Math.max(0, ...historico.itens.map((c) => Number(c.valorTotal)));
  return <div className={styles.corpo}>
    <div className={styles.barra}>
      <div>
        <h3>Histórico de cotações <span className={styles.contaAba}>{String(historico.total).padStart(2, "0")}</span></h3>
        <p>Todas as cotações deste fornecedor, com o pedido e se venceu.{historico.total > historico.itens.length ? ` Mostrando as ${historico.itens.length} mais recentes.` : ""}</p>
      </div>
    </div>
    {historico.itens.length === 0 ? <p className={styles.vazio}>Nenhuma cotação com este fornecedor ainda.</p> : <ul className={styles.historico}>
      {historico.itens.map((c) => <li key={c.id}>
        <div className={styles.historicoInfo}>
          {podeAbrirCompras
            ? <Link className={styles.pedido} href={hrefDeCompras({ visao: "lista", situacao: "todos" }, c.pedido.id)}>{numeroDoPedido(c.pedido.numero)}</Link>
            : <span className={styles.pedido}>{numeroDoPedido(c.pedido.numero)}</span>}
          <span>{c.pedido.titulo}</span>
          <small>{dataEmManaus(c.data)} · <EmpresaDoPedido empresa={c.pedido.empresa} curta /> · {situacaoDoPedido(c.pedido.situacao)}</small>
        </div>
        <div className={styles.barraValor} aria-hidden="true"><span className={c.venceu ? styles.barraVenceu : undefined} style={{ width: `${larguraDaBarra(c.valorTotal, maior)}%` }} /></div>
        <span className={styles.valor}>{valorEmReais(c.valorTotal)}</span>
        {c.venceu
          ? <span className={`${styles.selo} ${styles.seloOk}`}><Trophy size={11} aria-hidden="true" />Venceu</span>
          : <span className={styles.selo}>Não venceu</span>}
      </li>)}
    </ul>}
  </div>;
}

function LinhaSecreta({ rotulo, valor, aoCopiar }: { rotulo: string; valor: string | null; aoCopiar: (texto: string, rotulo: string) => void }) {
  const [visivel, setVisivel] = useState(false);
  return <div className={styles.linhaPagamento}>
    <div>
      <span>{rotulo}</span>
      <strong>{valor ? (visivel ? valor : mascararSegredo(valor)) : <span className={styles.ausente}>Não informado</span>}</strong>
    </div>
    {valor ? <div className={styles.botoes}>
      <Button variant="secondary" size="sm" icon={visivel ? <EyeOff size={14} /> : <Eye size={14} />} aria-pressed={visivel} aria-label={`${visivel ? "Ocultar" : "Mostrar"} ${rotulo.toLowerCase()}`} onClick={() => setVisivel((v) => !v)}>{visivel ? "Ocultar" : "Mostrar"}</Button>
      <Button variant="secondary" size="sm" icon={<Copy size={14} />} aria-label={`Copiar ${rotulo.toLowerCase()}`} onClick={() => aoCopiar(valor, rotulo)}>Copiar</Button>
    </div> : null}
  </div>;
}

/** Dados de pagamento escondidos por padrão (proposta aprovada): Mostrar e Copiar. */
export function PagamentoDoFornecedor({ fornecedor: f, aoCopiar }: { fornecedor: Fornecedor; aoCopiar: (texto: string, rotulo: string) => void }) {
  return <div className={styles.corpo}>
    <div className={styles.barra}><div><h3>Dados de pagamento</h3><p>Escondidos por padrão. Mostre só na hora de pagar.</p></div></div>
    <div className={styles.pagamento}>
      <LinhaSecreta rotulo="Chave PIX" valor={f.chavePix} aoCopiar={aoCopiar} />
      <LinhaSecreta rotulo="Dados bancários" valor={f.dadosBancarios} aoCopiar={aoCopiar} />
    </div>
    <div className={styles.selos} aria-label="Formas de pagamento aceitas">
      {f.formasDePagamento.length
        ? f.formasDePagamento.map((forma) => <span key={forma} className={styles.selo}><Check size={11} aria-hidden="true" />{rotulosDaFormaDePagamento[forma]}</span>)
        : <span className={styles.ausente}>Formas de pagamento não informadas</span>}
    </div>
  </div>;
}
