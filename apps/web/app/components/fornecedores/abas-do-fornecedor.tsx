"use client";

import { rotulosDaEtapaDeCompra, rotulosDaFormaDePagamento, type DadosDePagamentoRevelados, type EtapaDeCompra, type Fornecedor, type HistoricoDeCotacoesResposta } from "@plugga/shared";
import { Check, Clock, Copy, Eye, EyeOff, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { dataEmManaus, hrefDeCompras, numeroDoPedido, valorEmReais } from "../../lib/compras";
import { larguraDaBarra, ROTULO_DO_RESULTADO } from "../../lib/fornecedores";
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
        <div className={styles.barraValor} aria-hidden="true"><span className={c.resultado === "venceu" ? styles.barraVenceu : undefined} style={{ width: `${larguraDaBarra(c.valorTotal, maior)}%` }} /></div>
        <span className={styles.valor}>{valorEmReais(c.valorTotal)}</span>
        {c.resultado === "venceu"
          ? <span className={`${styles.selo} ${styles.seloOk}`}><Trophy size={11} aria-hidden="true" />{ROTULO_DO_RESULTADO.venceu}</span>
          : c.resultado === "escolhida"
            ? <span className={styles.selo} title="Escolhida no pedido; só conta como vitória quando a compra for aprovada."><Clock size={11} aria-hidden="true" />{ROTULO_DO_RESULTADO.escolhida}</span>
            : <span className={styles.selo}>{ROTULO_DO_RESULTADO.nao_venceu}</span>}
      </li>)}
    </ul>}
  </div>;
}

type Revelar = (motivo: "mostrar" | "copiar", campo: "pix" | "banco") => Promise<DadosDePagamentoRevelados | null>;

function LinhaSecreta({ rotulo, mascarado, completo, visivel, aoMostrar, aoCopiar, ocupado }: {
  rotulo: string; mascarado: string | null; completo: string | null | undefined; visivel: boolean;
  aoMostrar: () => void; aoCopiar: () => void; ocupado: boolean;
}) {
  return <div className={styles.linhaPagamento}>
    <div>
      <span>{rotulo}</span>
      <strong>{mascarado ? (visivel && completo ? completo : mascarado) : <span className={styles.ausente}>Não informado</span>}</strong>
    </div>
    {mascarado ? <div className={styles.botoes}>
      <Button variant="secondary" size="sm" icon={visivel ? <EyeOff size={14} /> : <Eye size={14} />} aria-pressed={visivel} disabled={ocupado} aria-label={`${visivel ? "Ocultar" : "Mostrar"} ${rotulo}`} onClick={aoMostrar}>{visivel ? "Ocultar" : "Mostrar"}</Button>
      <Button variant="secondary" size="sm" icon={<Copy size={14} />} disabled={ocupado} aria-label={`Copiar ${rotulo}`} onClick={aoCopiar}>Copiar</Button>
    </div> : null}
  </div>;
}

/**
 * Dados de pagamento: a ficha só recebe a versão mascarada. Cada Mostrar e
 * cada Copiar pedem o completo à API, que grava quem pediu, quando e por quê;
 * nada fica guardado no navegador, e Ocultar descarta o valor mostrado.
 */
export function PagamentoDoFornecedor({ fornecedor: f, aoRevelar, aoCopiar }: { fornecedor: Fornecedor; aoRevelar: Revelar; aoCopiar: (texto: string, rotulo: string) => void }) {
  const [mostrados, setMostrados] = useState<{ pix?: string; banco?: string }>({});
  const [ocupado, setOcupado] = useState(false);
  const campoDe = (r: DadosDePagamentoRevelados, campo: "pix" | "banco") => (campo === "pix" ? r.chavePix : r.dadosBancarios) ?? undefined;

  async function completo(motivo: "mostrar" | "copiar", campo: "pix" | "banco") {
    setOcupado(true);
    const r = await aoRevelar(motivo, campo);
    setOcupado(false);
    return r ? campoDe(r, campo) : undefined;
  }
  async function mostrar(campo: "pix" | "banco") {
    if (mostrados[campo]) { setMostrados((m) => ({ ...m, [campo]: undefined })); return; }
    const valor = await completo("mostrar", campo);
    if (valor) setMostrados((m) => ({ ...m, [campo]: valor }));
  }
  async function copiar(campo: "pix" | "banco", rotulo: string) {
    const valor = await completo("copiar", campo);
    if (valor) aoCopiar(valor, rotulo);
  }

  return <div className={styles.corpo}>
    <div className={styles.barra}><div><h3>Dados de pagamento</h3><p>Escondidos por padrão. Mostrar e Copiar ficam registrados, com quem pediu e quando.</p></div></div>
    <div className={styles.pagamento}>
      <LinhaSecreta rotulo="Chave PIX" mascarado={f.chavePixMascarada} completo={mostrados.pix} visivel={Boolean(mostrados.pix)} ocupado={ocupado}
        aoMostrar={() => void mostrar("pix")} aoCopiar={() => void copiar("pix", "Chave PIX")} />
      <LinhaSecreta rotulo="Dados bancários" mascarado={f.dadosBancariosMascarados} completo={mostrados.banco} visivel={Boolean(mostrados.banco)} ocupado={ocupado}
        aoMostrar={() => void mostrar("banco")} aoCopiar={() => void copiar("banco", "Dados bancários")} />
    </div>
    <div className={styles.selos} aria-label="Formas de pagamento aceitas">
      {f.formasDePagamento.length
        ? f.formasDePagamento.map((forma) => <span key={forma} className={styles.selo}><Check size={11} aria-hidden="true" />{rotulosDaFormaDePagamento[forma]}</span>)
        : <span className={styles.ausente}>Formas de pagamento não informadas</span>}
    </div>
  </div>;
}
