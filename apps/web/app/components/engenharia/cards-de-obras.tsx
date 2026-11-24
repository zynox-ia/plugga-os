import type { ObraResumo } from "@plugga/shared";
import { Eye, HardHat, Paperclip } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { diaLegivel } from "../../lib/compras";
import { potenciaDaObra, prazoDaObra, ROTULO_DA_SITUACAO_DA_OBRA } from "../../lib/obras";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import obras from "./obras.module.css";
import styles from "./usinas.module.css";

/**
 * As obras em cards (protótipo de 23/11/2026): potência e empresa no canto, a obra,
 * o cliente e o responsável, a barra dos marcos e, no rodapé, o próximo marco ou a entrega.
 */
export function CardsDeObras({ obras: lista, hrefDaFicha, aoAbrir }: { obras: ObraResumo[]; hrefDaFicha: (id: string) => string; aoAbrir: (id: string) => void }) {
  return <div className={styles.grade}>
    {lista.map((o, i) => {
      const prazo = prazoDaObra(o);
      const { feitos, total, proximo } = o.marcos;
      const kwp = potenciaDaObra(o.potenciaKwp);
      return <article key={o.id} className={`${styles.card} ${styles.entra} ${o.ativa ? "" : styles.inativa}`} style={{ "--i": i } as CSSProperties} aria-label={o.nome}>
        <header className={styles.cardTopo}>
          <span className={styles.caixa} aria-hidden="true"><HardHat size={20} /></span>
          <span className={styles.canto}>{kwp ? <>{kwp}<span aria-hidden="true">·</span></> : null}<EmpresaComPonto empresa={o.empresa} curto /></span>
        </header>
        <div className={styles.cardCorpo}>
          <h3><Link href={hrefDaFicha(o.id)} scroll={false} title={o.nome}>{o.nome}</Link></h3>
          <p className={styles.muted}>{[o.cliente?.nome, o.responsavel?.nome ?? "Sem responsável"].filter(Boolean).join(" · ")}{o.ativa ? "" : " · inativa"}</p>
        </div>
        <div className={obras.marcos}>
          <div className={obras.barraDosMarcos} style={{ "--total": Math.max(total, 1) } as CSSProperties} aria-hidden="true">
            {Array.from({ length: total }, (_, j) => <i key={j} data-feito={j < feitos || undefined} data-atual={(proximo && j === feitos) || undefined} data-atrasado={(proximo?.atrasado && j === feitos) || undefined} />)}
          </div>
          <p><strong>{feitos} de {total} marcos</strong><span>{proximo ? `Próximo: ${proximo.nome}` : total ? "Todos os marcos feitos" : "Sem marcos"}</span></p>
        </div>
        <footer className={styles.cardRodape}>
          <span className={styles.duasLinhas}>
            <span><span className="sr-only">{proximo ? "Próximo marco previsto " : "Entrega prevista "}</span>{prazo.dia ? diaLegivel(prazo.dia) : "Sem data"}</span>
            <small className={prazo.atrasado ? styles.perigo : undefined}>{prazo.texto}</small>
          </span>
          <span className={styles.espaco} />
          {o.documentos ? <span className={obras.clipe} title={`${o.documentos} ${o.documentos === 1 ? "documento" : "documentos"}`}><Paperclip size={13} aria-hidden="true" />{o.documentos}<span className="sr-only"> {o.documentos === 1 ? "documento" : "documentos"}</span></span> : null}
          <span className={styles.pilula}>{ROTULO_DA_SITUACAO_DA_OBRA[o.situacao]}</span>
          <Button variant="secondary" size="sm" iconOnly icon={<Eye size={15} />} className={styles.redondo} aria-label={`Ver ${o.nome}`} title="Ver a obra" onClick={() => aoAbrir(o.id)} />
        </footer>
      </article>;
    })}
  </div>;
}
