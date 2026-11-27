"use client";

import type { ContaCorrente } from "@plugga/shared";
import { ChevronDown, Scale } from "lucide-react";
import type { ReactNode } from "react";

import { valorEmReais } from "../../lib/compras";
import { notaDosSaldos, saldosDaConciliacao, type EscopoDoSaldo } from "../../lib/conciliacao";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import styles from "./financeiro-telas.module.css";

/**
 * O saldo do Plugga OS ao lado do conferido com o extrato (PLU-339, C4): o calculado é o saldo
 * inicial mais todo o liquidado; o conciliado, só o que já tem par. A diferença é líquida e
 * desde o saldo inicial: não prova que o período está conciliado (isso é a contagem da faixa).
 * Fica sob demanda, no "Saldos" ao lado do contexto da faixa, para a faixa caber numa linha.
 */
export function SaldosDaFaixa({ escopo, nomeDaConta }: {
  escopo: EscopoDoSaldo<ContaCorrente>;
  /** O rótulo da conta do filtro, para os avisos de conta inativa ou de outra empresa. */
  nomeDaConta: string | null;
}) {
  const conteudo = conteudoDosSaldos(escopo, nomeDaConta);
  if (!conteudo) return null;
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className={styles.saldosBotao}><Scale size={12} aria-hidden="true" />Saldos<ChevronDown size={12} aria-hidden="true" /></button>
    </PopoverTrigger>
    <PopoverContent className={styles.saldosPopover} align="start" aria-label="Saldos">{conteudo}</PopoverContent>
  </Popover>;
}

function conteudoDosSaldos(escopo: EscopoDoSaldo<ContaCorrente>, nome: string | null): ReactNode {
  if (escopo.tipo === "fora") {
    return <p>{escopo.motivo === "inativa" ? `A conta ${nome} está inativa: o saldo dela não se calcula aqui.`
      : escopo.motivo === "outra-empresa" ? `A conta ${nome} não é da empresa escolhida: limpe a Empresa ou troque a conta para ver o saldo.`
      : "A conta deste endereço não está entre as contas do Financeiro: escolha outra para ver o saldo."}</p>;
  }
  const saldos = saldosDaConciliacao(escopo.contas);
  if (!saldos) return null;
  if (saldos.tipo !== "calculado") {
    return <p>{saldos.tipo === "oculto"
      ? "O saldo da conta aparece só para quem acompanha pagar e receber."
      : "Sem saldo inicial, o saldo conciliado não se calcula. Cadastre o saldo inicial nas configurações do Financeiro."}</p>;
  }
  return <div className={styles.saldosGrupo} aria-label="Saldos da conciliação" role="group">
    <span><small>Saldo no Plugga OS</small><strong>{valorEmReais(saldos.calculado)}</strong></span>
    <span><small>Saldo conciliado</small><strong>{valorEmReais(saldos.conciliado)}</strong></span>
    <span><small>Diferença líquida</small><strong>{valorEmReais(saldos.diferenca)}</strong></span>
    <p>{notaDosSaldos(saldos)}</p>
  </div>;
}
