import type { CompanyKey } from "@plugga/shared";

import { COR_DA_EMPRESA, ROTULO_DA_EMPRESA } from "../../lib/compras";
import styles from "./suprimentos.module.css";

/** A empresa do registro como texto com o ponto da cor dela ("● Waze Energia"); `curto` mostra só a primeira palavra. */
export function EmpresaComPonto({ empresa, curto = false, className = "" }: { empresa: CompanyKey; curto?: boolean; className?: string }) {
  const nome = ROTULO_DA_EMPRESA[empresa];
  return <span className={`${styles.empresa} ${className}`} title={`Empresa: ${nome}`}>
    <span className={styles.empresaPonto} style={{ background: COR_DA_EMPRESA[empresa] }} aria-hidden="true" />
    {curto ? nome.split(" ")[0] : nome}
  </span>;
}

/** Só o ponto da cor da empresa, no tamanho de um ícone de opção (16 px), para menus e filtros. */
export function PontoDaEmpresa({ empresa }: { empresa: CompanyKey }) {
  return <span className={styles.pontoIcone} aria-hidden="true"><span className={styles.empresaPonto} style={{ background: COR_DA_EMPRESA[empresa] }} /></span>;
}
