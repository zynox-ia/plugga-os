"use client";

import { rotulosDaCategoriaDeItemDeEstoque, type ItemDeEstoque } from "@plugga/shared";
import { Clock3, Download, Package, Pencil, ShoppingCart, Upload, X } from "lucide-react";
import Link from "next/link";

import { diaCurto, hrefDeCompras, hojeEmManaus, numeroDoPedido, valorEmReais } from "../../lib/compras";
import { diaPorExtenso, primeiroNome, qtd, qtdComSinal, qtdOuTraco, type TipoRegistravel } from "../../lib/estoque";
import { FecharModal, Modal } from "../modal";
import estilosFicha from "../pipelines/detalhes-do-lead-modal.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import styles from "./estoque.module.css";
import { NivelDoItem, SeloDaSituacao, SeloDoTipo } from "./partes";

const COR_ENTRADA = "#0058B0";
const COR_SAIDA = "#00A3FF";

/** Entradas e saídas das 8 semanas (azuis da marca), barras agrupadas com legenda e total. */
function GraficoDoItem({ item }: { item: ItemDeEstoque }) {
  const semanas = item.ultimas8Semanas.map((s) => ({ inicio: s.inicio, entradas: Number(s.entradas), saidas: Number(s.saidas) }));
  const max = Math.max(1, ...semanas.flatMap((s) => [s.entradas, s.saidas]));
  const W = 940, H = 150, base = 122, larg = W / semanas.length, barra = 16;
  const totalE = semanas.reduce((s, x) => s + x.entradas, 0);
  const totalS = semanas.reduce((s, x) => s + x.saidas, 0);
  const coluna = (x: number, v: number, cor: string, rotulo: string) => v > 0 ? <g>
    <title>{`${rotulo}: ${qtd(v, item.unidade)}`}</title>
    <rect x={x} y={base - (v / max) * 104} width={barra} height={(v / max) * 104} rx={4} fill={cor} />
  </g> : null;
  return <figure className={styles.grafico}>
    <figcaption><span>Entradas e saídas nas últimas 8 semanas</span><span className={styles.legenda}>
      <span><i style={{ background: COR_ENTRADA }} />Entradas · {qtd(totalE, item.unidade)}</span>
      <span><i style={{ background: COR_SAIDA }} />Saídas · {qtd(totalS, item.unidade)}</span>
    </span></figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Entradas somam ${qtd(totalE, item.unidade)} e saídas ${qtd(totalS, item.unidade)} nas últimas 8 semanas`}>
      <line x1={0} x2={W} y1={base} y2={base} stroke="var(--ui-divider)" />
      {semanas.map((s, k) => {
        const cx = k * larg + larg / 2;
        return <g key={s.inicio}>
          {coluna(cx - barra - 1, s.entradas, COR_ENTRADA, `Semana de ${diaCurto(s.inicio)} · entradas`)}
          {coluna(cx + 1, s.saidas, COR_SAIDA, `Semana de ${diaCurto(s.inicio)} · saídas`)}
          <text x={cx} y={H - 10} textAnchor="middle" className={styles.graficoEixo}>{diaCurto(s.inicio)}</text>
        </g>;
      })}
    </svg>
  </figure>;
}

/**
 * Ficha do item (modal largo, cabeçalho da ficha do lead): disponível em
 * destaque, nível, aviso de abaixo do mínimo com "Abrir pedido de compra",
 * gráfico de 8 semanas, pedidos que reservam e últimas movimentações.
 */
export function FichaDoItem({ item, aoFechar, aoMovimentar, aoEditar, aoRepor }: {
  item: ItemDeEstoque;
  aoFechar: () => void;
  aoMovimentar: (tipo: TipoRegistravel) => void;
  aoEditar: () => void;
  /** Ausente quando a pessoa não abre pedidos de compra. */
  aoRepor?: () => void;
}) {
  const s = item.saldo;
  const minimo = Number(item.estoqueMinimo);
  const falta = Number(s.faltaParaOMinimo);
  const reservas = item.reservas;
  return <Modal rotulo={`Item ${item.nome}`} aoFechar={aoFechar} largura="larga" className={estilosFicha.modal}>
    <div className={estilosFicha.layout}>
      <header className={`${estilosFicha.cabecalhoLead} plg-parte`}>
        <div className={estilosFicha.identidadeCabecalho}><div className={estilosFicha.leadCardLinhaSuperior}>
          <div className={estilosFicha.iconeLead} aria-hidden="true"><Package size={20} /></div>
          <div className={estilosFicha.identidadeLead}>
            <h2 className={estilosFicha.leadCardTitulo}>{item.nome}</h2>
            <div className={estilosFicha.metadadosCabecalho}>
              <span>{item.codigo}</span><span aria-hidden="true">·</span><EmpresaComPonto empresa={item.empresa} /><span aria-hidden="true">·</span><span>{rotulosDaCategoriaDeItemDeEstoque[item.categoria]}</span>
              {!item.ativo ? <><span aria-hidden="true">·</span><span className="ui-badge ui-tone--neutral">Inativo</span></> : null}
            </div>
          </div>
        </div></div>
        <div className={estilosFicha.controlesCabecalho}>
          <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={aoEditar}>Editar</Button>
          <FecharModal>{(fechar) => <button type="button" className={`${estilosFicha.botaoFechar} plg-pressiona`} onClick={fechar} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>}</FecharModal>
        </div>
      </header>
      <div className={estilosFicha.painelPrincipal}>
        <section className={`${estilosFicha.conteudo} ${styles.fichaConteudo} plg-parte`}>
          <div className={styles.itemTopo}>
            <div className={styles.itemDisponivel}><span>Disponível para novos pedidos</span><strong>{qtd(s.disponivel, item.unidade)}</strong><SeloDaSituacao situacao={s.situacao} /></div>
            <div className={styles.numeros} role="group" aria-label="Saldo do item">
              <div><span>Em estoque</span><strong>{qtd(s.emEstoque, item.unidade)}</strong><small>{valorEmReais(s.valor) ?? "R$ 0,00"} pelo custo médio</small></div>
              <div><span>Reservado</span><strong>{qtdOuTraco(s.reservado, item.unidade)}</strong><small>{reservas.length ? `${reservas.length} ${reservas.length === 1 ? "pedido" : "pedidos"}` : "nada reservado"}</small></div>
              <div><span>Mínimo</span><strong>{qtdOuTraco(item.estoqueMinimo, item.unidade)}</strong><small>{minimo <= 0 ? "sem mínimo" : falta > 0 ? `repor ${qtd(falta, item.unidade)}` : "acima do mínimo"}</small></div>
            </div>
          </div>
          <NivelDoItem grande emEstoque={Number(s.emEstoque)} reservado={Number(s.reservado)} minimo={minimo} situacao={s.situacao} unidade={item.unidade} />
          {falta > 0 && item.ativo ? <div className={styles.sugestao} role="status">
            <ShoppingCart size={15} aria-hidden="true" />
            <span><strong>Abaixo do mínimo.</strong> Faltam {qtd(falta, item.unidade)} para o mínimo.</span>
            {aoRepor ? <Button variant="secondary" size="sm" onClick={aoRepor}>Abrir pedido de compra</Button> : null}
          </div> : null}
          <GraficoDoItem item={item} />
          <section className={styles.secaoFicha} aria-label="Reservas">
            <h3>Pedidos que reservam este item</h3>
            {reservas.length ? <ul className={styles.reservas}>{reservas.map((r) => <li key={r.id}>
              <Clock3 size={14} aria-hidden="true" />
              <span><strong>{qtd(r.quantidade, item.unidade)}</strong> · {numeroDoPedido(r.pedido.numero)} · {r.destino}<small> · desde {diaPorExtenso(hojeEmManaus(new Date(r.reservadaEm)))}</small></span>
              <Link className="button button--secondary ui-button ui-button--sm" href={hrefDeCompras({ visao: "lista", situacao: "todos" }, r.pedido.id)}><span className="ui-button-label">Abrir pedido</span></Link>
            </li>)}</ul> : <p className={styles.muted}>Nenhuma reserva. Quando um pedido de compra for atendido pelo estoque, a quantidade fica reservada aqui até a retirada.</p>}
          </section>
          <section className={styles.secaoFicha} aria-label="Movimentações">
            <h3>Últimas movimentações</h3>
            {item.ultimasMovimentacoes.length ? <div className={`table-wrap ${styles.tabelaSimples}`}><table>
              <caption className="sr-only">Movimentações do item</caption>
              <thead><tr><th scope="col">Data</th><th scope="col">Tipo</th><th scope="col">Quantidade</th><th scope="col">Origem ou destino</th><th scope="col">Quem</th></tr></thead>
              <tbody>{item.ultimasMovimentacoes.slice(0, 6).map((m) => <tr key={m.id}>
                <td>{diaPorExtenso(m.data)}</td><td><SeloDoTipo tipo={m.tipo} /></td>
                <td className={m.tipo === "entrada" ? styles.qtdEntrada : undefined}>{qtdComSinal(m)}</td>
                <td>{m.origemOuDestino}</td><td>{primeiroNome(m.registradaPor?.nome)}</td>
              </tr>)}</tbody>
            </table></div> : <p className={styles.muted}>Nenhuma movimentação registrada.</p>}
          </section>
        </section>
        <footer className={styles.rodapeFicha}>
          <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => aoMovimentar("ajuste")} disabled={!item.ativo}>Ajustar saldo</Button>
          <span className={styles.flex} />
          <Button variant="secondary" icon={<Upload size={16} />} onClick={() => aoMovimentar("saida")} disabled={!item.ativo}>Registrar saída</Button>
          <Button icon={<Download size={16} />} onClick={() => aoMovimentar("entrada")} disabled={!item.ativo}>Registrar entrada</Button>
        </footer>
      </div>
    </div>
  </Modal>;
}
