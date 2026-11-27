"use client";

import { Clock, Link2, Plus, RotateCcw } from "lucide-react";

import { Button, DropdownMenu } from "../ui";
import type { MenuItem } from "../ui/dropdown-menu";
import styles from "./financeiro-telas.module.css";

/**
 * As ações de uma linha do extrato sem lançamento (PLU-339): uma principal, como na referência
 * de 23/11 (conciliar com o candidato, criar a tarifa ou criar o lançamento), e as demais no
 * menu "Mais ações" (três pontos). Sem ação de criação, "Marcar pendente" fica como botão único.
 * Cada ação vem nula quando a linha não a oferece.
 */
export function AcoesDaLinha({ descricao, marcado, ocupado, aoConciliar, aoCriarTarifa, aoCriarLancamento, aoMarcar }: {
  descricao: string;
  marcado: boolean;
  ocupado: boolean;
  aoConciliar: (() => void) | null;
  aoCriarTarifa: (() => void) | null;
  aoCriarLancamento: (() => void) | null;
  aoMarcar: () => void;
}) {
  const principal = aoConciliar ? { rotulo: "Conciliar", icone: <Link2 size={14} />, acao: aoConciliar }
    : aoCriarTarifa ? { rotulo: "Criar tarifa", icone: <Plus size={14} />, acao: aoCriarTarifa }
    : aoCriarLancamento ? { rotulo: "Criar lançamento", icone: <Plus size={14} />, acao: aoCriarLancamento } : null;
  const maisAcoes: MenuItem[] = principal ? [
    ...(aoCriarTarifa && principal.acao !== aoCriarTarifa ? [{ id: "tarifa", label: "Criar tarifa", icon: <Plus />, onSelect: aoCriarTarifa }] : []),
    ...(aoCriarLancamento && principal.acao !== aoCriarLancamento ? [{ id: "lancamento", label: "Criar lançamento", icon: <Plus />, onSelect: aoCriarLancamento }] : []),
    { id: "marcar", label: marcado ? "Retomar" : "Marcar pendente", icon: marcado ? <RotateCcw /> : <Clock />, onSelect: aoMarcar },
  ] : [];
  return <div className={styles.mioloAcoes}>
    {principal ? <Button size="sm" icon={principal.icone} disabled={ocupado} onClick={principal.acao}>{principal.rotulo}</Button>
      : <Button size="sm" variant="secondary" disabled={ocupado} onClick={aoMarcar}>{marcado ? "Retomar" : "Marcar pendente"}</Button>}
    {maisAcoes.length ? <DropdownMenu variant="icon" label={`Mais ações para ${descricao || "a linha"}`} disabled={ocupado} items={maisAcoes} /> : null}
  </div>;
}
