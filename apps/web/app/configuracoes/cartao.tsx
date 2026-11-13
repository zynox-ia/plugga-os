import type { ReactNode } from "react";

import styles from "./cartoes.module.css";

/** Cartão de vidro das abas Perfil e Segurança: ícone, título, selo opcional e corpo. */
export function CartaoDaConfiguracao({
  titulo,
  tituloId,
  icone,
  selo,
  rotulo,
  className = "",
  children,
}: {
  titulo: string;
  tituloId: string;
  icone: ReactNode;
  selo?: ReactNode;
  /** Nome acessível da região, quando precisa ser diferente do título visível. */
  rotulo?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`${styles.vidro} ${className}`}
      aria-labelledby={rotulo ? undefined : tituloId}
      aria-label={rotulo}
    >
      <header className={styles.cabecalho}>
        <span className={styles.icone} aria-hidden="true">
          {icone}
        </span>
        <h3 id={tituloId} className={styles.titulo}>
          {titulo}
        </h3>
        {selo}
      </header>
      {children}
    </section>
  );
}
