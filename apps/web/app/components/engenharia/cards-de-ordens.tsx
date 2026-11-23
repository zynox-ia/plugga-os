import type { OrdemDeServicoResumo } from "@plugga/shared";
import { Camera, Eye, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import estilosClientes from "../clientes/tela-clientes.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import styles from "./engenharia.module.css";
import { AgendaDaOrdem, IconeDoTipo, SeloDaEtapa } from "./partes";

export type AcoesDaOrdem = { hrefDaFicha: (id: string) => string; aoAbrir: (id: string) => void };

/** Visão padrão: um card por O.S., 3 por linha, com o ícone do tipo no topo (protótipo de 23/11/2026). */
export function CardsDeOrdens({ ordens, hoje, hrefDaFicha, aoAbrir }: { ordens: OrdemDeServicoResumo[]; hoje: string } & AcoesDaOrdem) {
  // Sem rolagem interna: a página rola inteira e a barra de filtros gruda no topo.
  return <div className={styles.grade}>
    {ordens.map((o, indice) => <article key={o.id} className={`${estilosClientes.card} ${styles.card} ${styles.entra}`} style={{ "--i": indice } as CSSProperties} aria-label={`${o.codigo}: ${o.cliente.nome}`}>
      <header className={styles.cardTopo}>
        <span className={styles.caixa} aria-hidden="true"><IconeDoTipo tipo={o.tipo} /></span>
        <span className={styles.codigoEmpresa}><span>{o.codigo}</span><span aria-hidden="true">·</span><EmpresaComPonto empresa={o.empresa} curto /></span>
      </header>
      <div className={styles.cardCorpo}>
        <h3 className={styles.cardTitulo}><Link href={hrefDaFicha(o.id)} scroll={false}>{o.cliente.nome}</Link></h3>
        <p className={styles.cardDescricao} title={`${ROTULO_DO_TIPO[o.tipo]} · ${o.descricao}`}>{ROTULO_DO_TIPO[o.tipo]} · {o.descricao}</p>
        <p className={styles.cardMeta}>
          <span className={o.tecnico ? undefined : styles.semTecnico}><UserRound size={14} aria-hidden="true" />{o.tecnico?.nome ?? "Sem técnico"}</span>
          {o.local ? <span title={o.local}><MapPin size={14} aria-hidden="true" /><span className={styles.cortado}>{o.local}</span></span> : null}
        </p>
      </div>
      <footer className={styles.cardRodape}>
        <AgendaDaOrdem ordem={o} hoje={hoje} />
        <div className={styles.cardAcoes}>
          {o.fotos > 0 ? <span className={styles.fotos} title={`${o.fotos} ${o.fotos === 1 ? "foto" : "fotos"}`}><Camera size={14} aria-hidden="true" /><span className="sr-only">{o.fotos} {o.fotos === 1 ? "foto" : "fotos"}</span></span> : null}
          <SeloDaEtapa situacao={o.situacao} />
          <Button variant="secondary" size="sm" iconOnly icon={<Eye size={15} />} className={styles.olho} aria-label={`Ver ${o.codigo}`} title="Ver a O.S." onClick={() => aoAbrir(o.id)} />
        </div>
      </footer>
    </article>)}
  </div>;
}
