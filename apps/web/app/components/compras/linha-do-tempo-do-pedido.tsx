"use client";

import { rotulosDaEtapaDeCompra, type PedidoDeCompra } from "@plugga/shared";
import { ArrowRight, Ban, CheckCircle2, Clock, FilePlus2, Paperclip, PlayCircle, Trophy, Truck, Undo2, UserRound, Wallet, Warehouse, type LucideIcon } from "lucide-react";

import { COR_DA_ETAPA, diaCurto } from "../../lib/compras";
import { atividadesDoPedido, atividadesPorDia, diaDoIso, diasUteisEntre, horaEmManaus, type IconeDaAtividade } from "../../lib/ficha-do-pedido";
import historico from "../pipelines/historico-do-lead.module.css";
import styles from "./ficha-do-pedido.module.css";

const ICONE: Record<IconeDaAtividade, LucideIcon> = {
  criado: FilePlus2, etapa: PlayCircle, decisao: Warehouse, cotacao: Paperclip, vencedora: Trophy,
  aprovado: CheckCircle2, pagamento: Wallet, recebido: Truck, cancelado: Ban, revisao: Undo2,
};

const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

function SituacaoDaPassagem({ passagem, hoje }: { passagem: PedidoDeCompra["passagens"][number]; hoje: string }) {
  if (passagem.saiuEm) {
    if (passagem.cumpriuPrazo) return <span className={`${styles.selo} ${styles.seloOk}`}><CheckCircle2 size={11} aria-hidden="true" />Cumpriu</span>;
    return <span className={`${styles.selo} ${styles.seloPerigo}`}><Clock size={11} aria-hidden="true" />Estourou {Math.max(1, diasUteisEntre(diaDoIso(passagem.prazoEm), diaDoIso(passagem.saiuEm)))}d</span>;
  }
  if (passagem.situacaoDoPrazo === "vencido") return <span className={`${styles.selo} ${styles.seloPerigo}`}><Clock size={11} aria-hidden="true" />Vencida há {Math.max(1, diasUteisEntre(diaDoIso(passagem.prazoEm), hoje))}d</span>;
  if (passagem.situacaoDoPrazo === "vence_hoje") return <span className={`${styles.selo} ${styles.seloAlerta}`}><Clock size={11} aria-hidden="true" />Vence hoje</span>;
  return <span className={`${styles.selo} ${styles.seloInfo}`}><Clock size={11} aria-hidden="true" />Em andamento</span>;
}

/** Passagens por etapa (entrada, prazo em dias úteis, saída) e a atividade do pedido, com quem fez e quando. */
export function LinhaDoTempoDoPedido({ pedido, hoje }: { pedido: PedidoDeCompra; hoje: string }) {
  const dias = atividadesPorDia(atividadesDoPedido(pedido), hoje);
  return <div className={styles.secao}>
    <div className={styles.barra}><div><h3>Passagens por etapa</h3><p>Entrada, prazo em dias úteis (seg. a sex., calendário de Manaus) e saída de cada etapa.</p></div></div>
    <div className={styles.tabela}>
      <table>
        <caption className="sr-only">Passagens por etapa</caption>
        <thead><tr><th scope="col">Etapa</th><th scope="col">Entrada</th><th scope="col">Prazo</th><th scope="col">Saída</th><th scope="col">Duração</th><th scope="col">Situação</th></tr></thead>
        <tbody>
          {pedido.passagens.map((x) => {
            const entrada = diaDoIso(x.entrouEm);
            const fim = x.saiuEm ? diaDoIso(x.saiuEm) : hoje;
            return <tr key={`${x.etapa}-${x.entrouEm}`}>
              <td><span className={`${styles.selo} ${styles.seloNeutro}`}><span className={styles.ponto} style={{ background: COR_DA_ETAPA[x.etapa] }} aria-hidden="true" />{rotulosDaEtapaDeCompra[x.etapa]}</span>{x.responsavel ? <small>{x.responsavel.nome}</small> : null}</td>
              <td>{diaCurto(entrada)}</td>
              <td>{diaCurto(diaDoIso(x.prazoEm))}<small>{x.prazoDiasUteis}d úteis</small></td>
              <td>{x.saiuEm ? diaCurto(fim) : "—"}</td>
              <td>{Math.max(0, diasUteisEntre(entrada, fim))}d</td>
              <td><SituacaoDaPassagem passagem={x} hoje={hoje} /></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <div className={`${styles.barra} ${styles.barraSeparada}`}><div><h3>Atividade</h3><p>Quem fez o quê, com data e hora de Manaus.</p></div></div>
    <section className={historico.historico} aria-label="Atividade do pedido">
      {dias.map((grupo) => <section key={grupo.dia} className={historico.historicoDia} aria-label={grupo.rotulo}>
        <h3 className={historico.historicoData}>{grupo.rotulo}</h3>
        <ol className={historico.historicoLista}>
          {grupo.itens.map((a) => {
            const Icone = ICONE[a.icone];
            return <li key={a.chave} className={historico.historicoEvento}>
              <span className={historico.historicoIcone} aria-hidden="true"><Icone size={16} /></span>
              <time className={historico.historicoHora} dateTime={a.em}>{horaEmManaus(a.em)}</time>
              <div className={historico.historicoConteudo}>
                <div className={historico.historicoLinha}>
                  <span className={historico.historicoAvatar} aria-hidden="true">{a.quem ? iniciais(a.quem) : <UserRound size={13} />}</span>
                  <p>{a.quem ? <><strong>{a.quem}</strong> {a.texto}</> : a.texto}</p>
                </div>
                {a.de && a.para ? <div className={`${historico.historicoDetalhe} ${historico.historicoMudanca} ${styles.historicoComMudanca}`}><span className={historico.historicoEtapa}>{rotulosDaEtapaDeCompra[a.de]}</span><ArrowRight size={14} aria-label="para" /><span className={historico.historicoEtapa}>{rotulosDaEtapaDeCompra[a.para]}</span></div> : null}
                {a.arquivo ? <div className={historico.historicoDetalhe}><span className={historico.historicoArquivo}><Paperclip size={14} aria-hidden="true" />{a.arquivo}</span></div> : null}
                {a.nota ? <div className={`${historico.historicoDetalhe} ${historico.historicoAnotacao}`}>{a.nota}</div> : null}
              </div>
            </li>;
          })}
        </ol>
      </section>)}
    </section>
  </div>;
}
