import type { ProtocoloResumo } from "@plugga/shared";
import { Eye, FileCheck, History, Layers, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { diaLegivel } from "../../lib/compras";
import { prazoDoProtocolo, ROTULO_DA_SITUACAO_DO_PROTOCOLO, ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO, ROTULO_DO_TIPO_DE_PROTOCOLO, textoDaVerificacao } from "../../lib/protocolos";
import { rotuloDaUc } from "../../lib/usinas";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import styles from "./usinas.module.css";

/**
 * Os protocolos em cards (protótipo de 23/11/2026): número e empresa no canto, o cliente,
 * o tipo e a UC; a próxima verificação e a pendência; a data-limite e a situação no rodapé.
 */
export function CardsDeProtocolos({ protocolos, hoje, mostrarDepartamento, hrefDaFicha, aoAbrir }: {
  protocolos: ProtocoloResumo[];
  hoje: string;
  mostrarDepartamento: boolean;
  hrefDaFicha: (id: string) => string;
  aoAbrir: (id: string) => void;
}) {
  return <div className={styles.grade}>
    {protocolos.map((p, i) => {
      const prazo = prazoDoProtocolo(p);
      return <article key={p.id} className={`${styles.card} ${styles.entra}`} style={{ "--i": i } as CSSProperties} aria-label={`Protocolo ${p.numero}: ${ROTULO_DO_TIPO_DE_PROTOCOLO[p.tipo]}, ${p.cliente.nome}`}>
        <header className={styles.cardTopo}>
          <span className={styles.caixa} aria-hidden="true"><FileCheck size={20} /></span>
          <span className={styles.canto}>{p.numero}<span aria-hidden="true">·</span><EmpresaComPonto empresa={p.empresa} curto /></span>
        </header>
        <div className={styles.cardCorpo}>
          <h3><Link href={hrefDaFicha(p.id)} scroll={false}>{p.cliente.nome}</Link></h3>
          <p className={styles.muted}>{ROTULO_DO_TIPO_DE_PROTOCOLO[p.tipo]} · {rotuloDaUc(p.uc.codigo)}</p>
        </div>
        <p className={styles.dadosDaUsina}>
          <span><History size={14} aria-hidden="true" />{textoDaVerificacao(p, hoje)}</span>
          {mostrarDepartamento ? <span><Layers size={14} aria-hidden="true" />{ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO[p.departamento]}</span> : null}
          {p.situacao === "com_pendencia" && p.acaoPendente ? <span className={styles.perigo}><TriangleAlert size={14} aria-hidden="true" />{p.acaoPendente}</span> : null}
        </p>
        <footer className={styles.cardRodape}>
          <span className={styles.duasLinhas}>
            <span><span className="sr-only">Data-limite </span>{diaLegivel(p.dataLimite)}</span>
            <small className={prazo.tom === "perigo" ? styles.perigo : undefined}>{prazo.texto}</small>
          </span>
          <span className={styles.espaco} />
          <span className={styles.pilula}>{ROTULO_DA_SITUACAO_DO_PROTOCOLO[p.situacao]}</span>
          <Button variant="secondary" size="sm" iconOnly icon={<Eye size={15} />} className={styles.redondo} aria-label={`Ver o protocolo ${p.numero}`} title="Ver o protocolo" onClick={() => aoAbrir(p.id)} />
        </footer>
      </article>;
    })}
  </div>;
}
