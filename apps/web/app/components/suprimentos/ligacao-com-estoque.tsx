"use client";

import { rotulosDaCategoriaDeItemDeEstoque, type CompanyKey, type ItemDeEstoqueNaLista, type ListarItensDeEstoqueResposta, type PedidoDeCompra } from "@plugga/shared";
import { Package, Unlink, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";

import { enviar } from "../../lib/clientes";
import { itensComVinculo, qtd, tomDoDisponivel, type EntradaDoItem, type EstadoDaEntrada } from "../../lib/estoque";

export { entradaDoRecebimento, entradaInicial, type EstadoDaEntrada } from "../../lib/estoque";
import { Checkbox, TextField } from "../ui";
import { CampoDeMenu, type OpcaoDoMenu } from "./menu-com-busca";
import styles from "./suprimentos.module.css";

/**
 * Ligação de Compras com o Estoque (PLU-333): o vínculo de cada item do pedido
 * a um item de estoque da mesma empresa (habilita "atender pelo estoque") e a
 * entrada no estoque ao receber uma aquisição.
 */

/** Itens da empresa no menu: nome, código e categoria, e o disponível à direita com o tom. */
export function opcoesDeItens(itens: ItemDeEstoqueNaLista[], empresa: CompanyKey | null): OpcaoDoMenu[] {
  if (!empresa) return [];
  return itens.filter((i) => i.empresa === empresa && i.ativo).map((i) => ({
    value: i.id,
    label: i.nome,
    description: `${i.codigo} · ${rotulosDaCategoriaDeItemDeEstoque[i.categoria]}`,
    icon: <Package />,
    aside: qtd(i.saldo.disponivel, i.unidade),
    tone: tomDoDisponivel(i.saldo),
  }));
}

/** Itens ativos de estoque da empresa. `null` enquanto carrega; `indisponivel` quando a pessoa não vê o Estoque. */
export function useItensDeEstoque(empresa: CompanyKey | null): { itens: ItemDeEstoqueNaLista[] | null; indisponivel: boolean } {
  const [estado, setEstado] = useState<{ empresa: CompanyKey | null; itens: ItemDeEstoqueNaLista[] | null; indisponivel: boolean }>({ empresa: null, itens: null, indisponivel: false });
  useEffect(() => {
    if (!empresa) return;
    const controle = new AbortController();
    void enviar<ListarItensDeEstoqueResposta>(`/api/suprimentos/estoque/itens?${new URLSearchParams({ empresa })}`, "GET", undefined, controle.signal).then((r) => {
      if (!controle.signal.aborted) setEstado({ empresa, itens: r.ok ? r.dados.itens : [], indisponivel: !r.ok });
    });
    return () => controle.abort();
  }, [empresa]);
  return estado.empresa === empresa ? { itens: estado.itens, indisponivel: estado.indisponivel } : { itens: null, indisponivel: false };
}

const NAO_VINCULAR = "__nao";

/** Vínculo de um item do pedido com o estoque da empresa do pedido. */
export function VinculoComEstoque({ numero, empresa, itens, indisponivel, valor, aoMudar, disabled, erro }: {
  numero: number;
  empresa: CompanyKey | null;
  itens: ItemDeEstoqueNaLista[] | null;
  indisponivel: boolean;
  valor: string | null;
  aoMudar: (item: ItemDeEstoqueNaLista | null) => void;
  disabled?: boolean;
  erro?: string;
}) {
  const opcoes = [{ value: NAO_VINCULAR, label: "Não vincular ao estoque", icon: <Unlink /> }, ...opcoesDeItens(itens ?? [], empresa)];
  const dica = !empresa ? "Escolha a empresa para ver o estoque dela." : indisponivel ? "Sem acesso ao Estoque: o vínculo fica para quem cuida do estoque." : itens === null ? "Carregando o estoque…" : "Vincule para poder atender pelo estoque.";
  return <div className={styles.vinculo}>
    <CampoDeMenu label={`Estoque do item ${numero}`} options={opcoes} value={valor ?? NAO_VINCULAR} icon={<Warehouse />}
      disabled={disabled || !empresa || indisponivel} hint={valor ? undefined : dica} error={erro}
      onChange={(v) => aoMudar(v === NAO_VINCULAR ? null : (itens ?? []).find((i) => i.id === v) ?? null)} />
  </div>;
}

/** No recebimento da aquisição: dar entrada no estoque dos itens vinculados, com a quantidade recebida e o custo unitário. */
export function EntradaNoEstoqueDoRecebimento({ pedido, valor, aoMudar, erros, disabled }: {
  pedido: Pick<PedidoDeCompra, "itens">;
  valor: EstadoDaEntrada;
  aoMudar: (v: EstadoDaEntrada) => void;
  erros: Record<string, string>;
  disabled?: boolean;
}) {
  const itens = itensComVinculo(pedido);
  if (itens.length === 0) return null;
  const mudar = (id: string, parcial: Partial<EntradaDoItem>) => aoMudar({ ...valor, [id]: { ...valor[id]!, ...parcial } });
  return <fieldset className={styles.entrada} disabled={disabled}>
    <legend>Dar entrada no estoque</legend>
    <p className={styles.entradaDica}>Os itens vinculados entram no estoque com a quantidade recebida; o custo atualiza o custo médio.</p>
    {itens.map((i) => {
      const e = valor[i.id] ?? { marcado: false, quantidade: "", custo: "" };
      const item = i.itemDeEstoque!;
      return <div key={i.id} className={styles.entradaItem} role="group" aria-label={`Entrada de ${item.nome}`}>
        <Checkbox label={item.nome} description={`${item.codigo} · pedido: ${qtd(i.quantidade, i.unidade ?? "un")}`} checked={e.marcado} onChange={(ev) => mudar(i.id, { marcado: ev.target.checked })} />
        {e.marcado ? <div className={styles.entradaCampos}>
          <TextField label="Quantidade recebida" required inputMode="decimal" autoComplete="off" suffix={i.unidade ?? "un"} value={e.quantidade} onChange={(ev) => mudar(i.id, { quantidade: ev.target.value })} error={erros[`${i.id}-quantidade`]} />
          <TextField label="Custo unitário" required inputMode="decimal" autoComplete="off" prefix="R$" placeholder="0,00" value={e.custo} onChange={(ev) => mudar(i.id, { custo: ev.target.value })} error={erros[`${i.id}-custo`]} />
        </div> : null}
      </div>;
    })}
  </fieldset>;
}
