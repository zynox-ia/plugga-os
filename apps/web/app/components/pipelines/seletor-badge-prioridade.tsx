"use client";

import { Flag } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import styles from "./cartao-de-negocio.module.css";

const OPCOES = [{ value: "urgente", label: "Urgente" }, { value: "medio", label: "Médio" }, { value: "normal", label: "Normal" }] as const;
export type PrioridadeVisual = "" | typeof OPCOES[number]["value"];

export function SeletorBadgePrioridade({ nome, value, onChange }: {
  nome: string;
  value: PrioridadeVisual;
  onChange: (value: PrioridadeVisual) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const rotulo = OPCOES.find((opcao) => opcao.value === value)?.label ?? "Prioridade";

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" className={styles.prioridadeBadge} data-prioridade={value}
          aria-label={`Prioridade visual de ${nome}`}>
          <Flag size={12} aria-hidden="true" fill={value === "urgente" ? "currentColor" : "none"} />
          <span>{rotulo}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className={styles.paletaPrioridade} aria-label="Escolher prioridade"
        onClick={(evento) => evento.stopPropagation()}>
        <p className={styles.paletaTitulo}>Prioridade</p>
        <div className={styles.paletaOpcoes} role="group" aria-label="Prioridade visual">
          {OPCOES.map((opcao) => (
            <button key={opcao.value} type="button" className={styles.prioridadeBadge} data-prioridade={opcao.value}
              aria-pressed={value === opcao.value} onClick={() => { onChange(opcao.value); setAberto(false); }}>
              <Flag size={12} aria-hidden="true" fill={opcao.value === "urgente" ? "currentColor" : "none"} />
              <span>{opcao.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
