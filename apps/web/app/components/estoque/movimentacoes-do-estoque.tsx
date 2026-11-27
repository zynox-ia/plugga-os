"use client";

import { rotulosDoTipoDeMovimentacao, type ListarMovimentacoesResposta, type Movimentacao } from "@plugga/shared";
import { ArrowRight, History, Package } from "lucide-react";
import Link from "next/link";
import { Fragment, type CSSProperties } from "react";

import { numeroDoPedido, valorEmReais } from "../../lib/compras";
import { deltaDaMovimentacao, diaPorExtenso, horaEmManaus, primeiroNome, qtd, qtdComSinal, rotuloDoDia } from "../../lib/estoque";
import { hrefDoPedido, partesDaOrigem, type AcessoDoEstoque, type ParteDaOrigem } from "../../lib/estoque-acesso";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button, Dialog } from "../ui";
import styles from "./estoque.module.css";
import { ICONE_DO_TIPO } from "./partes";

/** Link só no trecho que a pessoa alcança; os outros são texto. */
const Vinculos = ({ partes }: { partes: ParteDaOrigem[] }) => <>{partes.map((p, i) => <Fragment key={i}>{i ? " · " : null}{p.href ? <Link className={styles.link} href={p.href}>{p.texto}</Link> : p.texto}</Fragment>)}</>;
const semReserva = (m: Movimentacao) => m.tipo !== "reserva" && m.tipo !== "liberacao";

/** Movimentações agrupadas por dia (padrão do histórico do lead): 5 colunas, sem rolagem lateral; a 980 px vira card. */
export function MovimentacoesDoEstoque({ dias, hoje, acesso, aoAbrir }: { dias: ListarMovimentacoesResposta["dias"]; hoje: string; acesso: AcessoDoEstoque; aoAbrir: (m: Movimentacao) => void }) {
  let indice = 0;
  return <div className={styles.movs}>
    <div className={styles.movsCabeca} aria-hidden="true"><span>Item</span><span>Quantidade</span><span>Saldo</span><span>Origem ou destino</span><span>Quem</span></div>
    {dias.map((g) => {
      const rotulo = rotuloDoDia(g.dia, hoje);
      return <section key={g.dia} className={styles.movsDia} aria-label={rotulo}>
        <h3>{rotulo}<span>{g.movimentacoes.length === 1 ? "1 movimentação" : `${g.movimentacoes.length} movimentações`}</span></h3>
        <ul>{g.movimentacoes.map((m) => {
          const Icone = ICONE_DO_TIPO[m.tipo];
          const tipo = rotulosDoTipoDeMovimentacao[m.tipo];
          const hora = horaEmManaus(m.registradaEm);
          return <li key={m.id} className={`${styles.movLinha} ${styles.entra}`} style={{ "--i": indice++ } as CSSProperties}>
            <button type="button" className={styles.movAlvo} onClick={() => aoAbrir(m)}
              aria-label={`${tipo} de ${m.item.nome}, ${qtdComSinal(m)}, ${diaPorExtenso(m.data)}. Ver detalhes`} />
            <div className={styles.movItem}>
              <span className={styles.movIcone} title={tipo} aria-hidden="true"><Icone size={15} /></span>
              <div><strong>{m.item.nome}</strong><small>{tipo} · {m.item.codigo} · <EmpresaComPonto empresa={m.item.empresa} curto /></small></div>
            </div>
            <div className={`${styles.movQtd} ${semReserva(m) ? "" : styles.movQtdReserva}`}>{qtdComSinal(m)}{semReserva(m) ? null : <small>{m.tipo === "reserva" ? "reservado" : "liberado"}</small>}</div>
            <div className={styles.movSaldo}>{qtd(m.saldoDepois, m.item.unidade)}<small>saldo depois</small></div>
            <div className={styles.movOrigem}><Vinculos partes={partesDaOrigem(m, acesso)} /></div>
            <div className={styles.movQuem}>{primeiroNome(m.registradaPor?.nome)}<small>{hora}</small></div>
          </li>;
        })}</ul>
      </section>;
    })}
  </div>;
}

/** Detalhe da movimentação: cabeçalho e botões padrão. Movimentação não se edita; corrige-se com um ajuste. */
export function DetalheDaMovimentacao({ m, acesso, aoFechar, aoVerItem }: { m: Movimentacao; acesso: AcessoDoEstoque; aoFechar: () => void; aoVerItem: (id: string) => void }) {
  const tipo = rotulosDoTipoDeMovimentacao[m.tipo];
  const Icone = ICONE_DO_TIPO[m.tipo];
  const depois = Number(m.saldoDepois);
  const antes = depois - deltaDaMovimentacao(m);
  const rotuloDoTexto = m.tipo === "entrada" ? "Origem" : m.tipo === "ajuste" ? "Motivo" : "Destino";
  const texto = m.tipo === "ajuste" ? m.observacao ?? m.origemOuDestino : <Vinculos partes={partesDaOrigem(m, acesso)} />;
  const pedidoHref = m.pedido ? hrefDoPedido(m.pedido.id, acesso) : null;
  return <Dialog title={`${tipo} · ${m.item.nome}`} description={`${diaPorExtenso(m.data)} às ${horaEmManaus(m.registradaEm)}${m.registradaPor ? ` · ${m.registradaPor.nome}` : ""}`}
    icon={<Icone size={20} />} onClose={aoFechar} cancelText="Fechar"
    footer={<Button icon={<Package size={16} />} onClick={() => aoVerItem(m.item.id)}>Ver item</Button>}>
    <div className={`ui-dialog-form ${styles.movDetalhe}`}>
      <div className={styles.movDestaque}>
        <span>{semReserva(m) ? "Variação no saldo" : m.tipo === "reserva" ? "Quantidade reservada" : "Reserva liberada"}</span>
        <strong>{qtdComSinal(m)}</strong>
        {semReserva(m)
          ? <div className={styles.previaLinha}><div><span>Antes</span><b>{qtd(antes, m.item.unidade)}</b></div><ArrowRight size={16} aria-hidden="true" /><div><span>Depois</span><b>{qtd(depois, m.item.unidade)}</b></div></div>
          : <small>{m.tipo === "reserva" ? "Separado para o pedido; o saldo não muda até a retirada." : "A quantidade voltou a ficar disponível."}</small>}
      </div>
      <dl className={styles.movDados}>
        <div><dt>Item</dt><dd><button type="button" className={styles.link} onClick={() => aoVerItem(m.item.id)}>{m.item.nome}</button><small>{m.item.codigo}</small></dd></div>
        <div><dt>Empresa</dt><dd><EmpresaComPonto empresa={m.item.empresa} /></dd></div>
        <div><dt>{rotuloDoTexto}</dt><dd><span>{texto}</span></dd></div>
        <div><dt>Pedido de compra</dt><dd>{m.pedido ? <Vinculos partes={[{ texto: numeroDoPedido(m.pedido.numero), href: pedidoHref }]} /> : "—"}</dd></div>
        {m.custoUnitario ? <div><dt>Custo unitário</dt><dd>{valorEmReais(m.custoUnitario)}</dd></div> : null}
        {m.valor && semReserva(m) ? <div><dt>Valor</dt><dd>{valorEmReais(m.valor)}</dd></div> : null}
        {m.observacao && m.tipo !== "ajuste" ? <div><dt>Observação</dt><dd>{m.observacao}</dd></div> : null}
        <div><dt>Registrado por</dt><dd>{m.registradaPor?.nome ?? "Sistema"}</dd></div>
      </dl>
      <p className={styles.nota}><History size={14} aria-hidden="true" />Movimentação registrada não se edita: para corrigir, registre um ajuste de saldo.</p>
    </div>
  </Dialog>;
}
