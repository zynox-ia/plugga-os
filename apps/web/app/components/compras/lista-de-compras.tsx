"use client";

import { LIMITE_DA_LISTA_DE_PEDIDOS, type PedidoDeCompraResumo } from "@plugga/shared";
import { Building2, Eye, Filter, HardHat, UserRound } from "lucide-react";
import type { CSSProperties } from "react";

import { COR_DA_ETAPA, ROTULO_CURTO_DA_ETAPA, numeroDoPedido, textoDoDestino, valorEmReais, valorCurto, type SituacaoDaLista } from "../../lib/compras";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { ShellCard, ShellTable } from "../plugga-shell";
import { Button } from "../ui";
import styles from "./compras.module.css";
import { EmpresaDoPedido, SeloDoPrazo } from "./quadro-de-compras";

const ICONE_DO_DESTINO = { obra: HardHat, cliente: UserRound, interno: Building2 } as const;
const SEGMENTOS: [SituacaoDaLista, string][] = [["em_andamento", "Em andamento"], ["concluido", "Concluídos"], ["cancelado", "Cancelados"], ["todos", "Todos"]];

export function ListaDeCompras({ pedidos, total, situacao, filtrado, aoMudarSituacao, aoAbrir, aoLimpar }: {
  pedidos: PedidoDeCompraResumo[];
  total: number;
  situacao: SituacaoDaLista;
  filtrado: boolean;
  aoMudarSituacao: (situacao: SituacaoDaLista) => void;
  aoAbrir: (id: string) => void;
  aoLimpar: () => void;
}) {
  const soma = pedidos.reduce((s, p) => s + Number(p.valor ?? 0), 0);
  return <div className={`lista-negocios ${estilosLista.lista} ${styles.largura}`}>
    <ShellCard className="table-card lista-negocios-card">
      <div className="card-heading"><div className={estilosLista.cabecalhoTabela}>
        <div><h2>{total === 1 ? "1 pedido" : `${total} pedidos`}</h2><span>{valorEmReais(String(soma)) ?? "R$ 0,00"} no total</span></div>
        <div className={estilosLista.controlesTabela}>
          <div className={estilosLista.segmentado} role="group" aria-label="Situação">
            {SEGMENTOS.map(([valor, rotulo]) => <button key={valor} type="button" aria-pressed={situacao === valor} onClick={() => aoMudarSituacao(valor)}>{rotulo}</button>)}
          </div>
        </div>
      </div></div>

      {pedidos.length === 0 ? <div className="lista-negocios-vazia" role="status">
        <div className="lista-negocios-vazia-icone" aria-hidden="true"><Filter size={22} /></div>
        <h3 className="lista-negocios-vazia-titulo">{filtrado ? "Nenhum pedido encontrado" : "Nenhum pedido nesta situação"}</h3>
        <p className="lista-negocios-vazia-desc">{filtrado ? "Não há pedidos com os filtros ou a busca atuais." : "Os pedidos aparecem aqui assim que forem abertos."}</p>
        {filtrado ? <Button variant="secondary" size="sm" onClick={aoLimpar}>Limpar filtros</Button> : null}
      </div> : <>
        <div className={estilosLista.rolagemTabela} role="region" aria-label="Pedidos de compra" tabIndex={0}>
          <ShellTable caption="Pedidos de compra">
            <thead><tr><th scope="col">Pedido</th><th scope="col">Etapa</th><th scope="col">Valor</th><th scope="col">Responsável</th><th scope="col">Prazo da etapa</th><th scope="col">Ações</th></tr></thead>
            <tbody>{pedidos.map((p, indice) => {
              const Destino = ICONE_DO_DESTINO[p.destino.tipo];
              const etapa = p.situacao === "cancelado" ? { nome: `Cancelado em ${ROTULO_CURTO_DA_ETAPA[p.etapa]}`, cor: "#B42332" } : { nome: ROTULO_CURTO_DA_ETAPA[p.etapa], cor: COR_DA_ETAPA[p.etapa] };
              return <tr key={p.id} className={styles.entra} style={{ "--i": indice } as CSSProperties} onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) aoAbrir(p.id); }}>
                <td data-l="Pedido"><div className={estilosLista.oportunidade}>
                  <span className={estilosLista.iconeOportunidade} aria-hidden="true"><Destino size={16} /></span>
                  <div className="celula-lead-bloco">
                    <button type="button" className={`lead-nome ${estilosLista.titulo}`} title={p.titulo} onClick={() => aoAbrir(p.id)}>{p.titulo}</button>
                    <span className={`${estilosLista.codigo} ${styles.codigoComEmpresa}`}>{numeroDoPedido(p.numero)} · {textoDoDestino(p.destino)} <EmpresaDoPedido empresa={p.empresa} /></span>
                  </div>
                </div></td>
                <td data-l="Etapa"><div className={estilosLista.etapa}><span className={`etapa-pill ${estilosLista.badgeEtapa}`} style={{ "--cor-etapa": etapa.cor } as CSSProperties}><span className="etapa-dot" style={{ background: etapa.cor }} aria-hidden="true" /><span>{etapa.nome}</span></span></div></td>
                <td data-l="Valor"><div className={estilosLista.valor}><strong>{valorEmReais(p.valor) ?? "Sem valor"}</strong><small>{p.situacao === "concluido" ? "faturado" : p.cotacoes > 0 && ["aprovacao_compra", "pagamento", "retirada"].includes(p.etapa) ? "cotação escolhida" : "orçado"}</small></div></td>
                <td data-l="Responsável"><div className={estilosLista.responsavel} title={p.responsavel?.nome ?? "Sem responsável"}><UserRound size={14} aria-hidden="true" /><strong>{p.responsavel?.nome.split(" ")[0] ?? "Sem responsável"}</strong></div></td>
                <td data-l="Prazo da etapa"><SeloDoPrazo pedido={p} /></td>
                <td><div className={estilosLista.acoesLinha}><Button variant="secondary" size="sm" iconOnly icon={<Eye size={14} />} aria-label={`Ver pedido ${numeroDoPedido(p.numero)}`} onClick={() => aoAbrir(p.id)} /></div></td>
              </tr>;
            })}</tbody>
          </ShellTable>
        </div>
        <nav className="lista-paginacao" aria-label="Paginação da lista de pedidos">
          <span className="lista-paginacao-info" role="status">
            {total > pedidos.length ? <>Mostrando os <strong>{pedidos.length}</strong> mais recentes de <strong>{total}</strong> pedidos ({valorCurto(soma)}). Use os filtros para ver os demais.</> : <>Mostrando <strong>{pedidos.length}</strong> {pedidos.length === 1 ? "pedido" : "pedidos"}</>}
          </span>
        </nav>
      </>}
    </ShellCard>
    {total > LIMITE_DA_LISTA_DE_PEDIDOS ? null : null}
  </div>;
}
