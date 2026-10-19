"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CORES, NOME_DA_COR } from "../../lib/pipelines";

/** Bolinha de cor que abre a paleta num balão. Fecha ao escolher, com Esc ou clicando fora. */
export function SeletorDeCor({ valor, rotulo, aoMudar }: { valor: string; rotulo: string; aoMudar: (cor: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  const id = useId();
  const nome = NOME_DA_COR[valor as keyof typeof NOME_DA_COR] ?? "Personalizada";

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: MouseEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  return (
    <span className="seletor-cor" ref={raiz}>
      <button
        type="button"
        className="seletor-cor-botao"
        aria-label={`${rotulo}: ${nome}`}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-controls={id}
        style={{ background: valor }}
        onClick={() => setAberto((estado) => !estado)}
      />
      {aberto ? (
        <span
          className="seletor-cor-balao"
          id={id}
          role="radiogroup"
          aria-label={rotulo}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") {
              // Fecha só o balão, não o modal em volta.
              evento.preventDefault();
              evento.stopPropagation();
              setAberto(false);
            }
          }}
        >
          {CORES.map((cor) => (
            <button
              key={cor}
              type="button"
              role="radio"
              aria-checked={valor === cor}
              aria-label={NOME_DA_COR[cor]}
              title={NOME_DA_COR[cor]}
              className="amostra-cor"
              style={{ background: cor }}
              onClick={() => {
                aoMudar(cor);
                setAberto(false);
              }}
            />
          ))}
        </span>
      ) : null}
    </span>
  );
}
