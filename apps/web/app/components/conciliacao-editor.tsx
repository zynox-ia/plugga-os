"use client";

import type { ReconciledInvoiceItem, ReconciledInvoiceItemCategory } from "@plugga/shared";

import type { AvaliacaoConciliacaoLocal } from "./conciliacao-model";
import { ShellTable, StatusPill } from "./plugga-shell";

const CATEGORIAS_COBRADAS: readonly {
  valor: ReconciledInvoiceItemCategory;
  rotulo: string;
}[] = [
  { valor: "consumo_ponta", rotulo: "Consumo em ponta" },
  { valor: "consumo_fora_ponta", rotulo: "Consumo fora ponta" },
  { valor: "demanda_faturada", rotulo: "Demanda faturada" },
  { valor: "reativo", rotulo: "Energia reativa" },
  { valor: "beneficio_fiscal", rotulo: "Benefício fiscal" },
  { valor: "multas_juros_encargos", rotulo: "Multas, juros e encargos" },
  { valor: "outros", rotulo: "Outros" },
];

export function EditorConciliacao({
  itens,
  onChange,
  avaliacao,
}: {
  itens: ReconciledInvoiceItem[];
  onChange: (itens: ReconciledInvoiceItem[]) => void;
  avaliacao: AvaliacaoConciliacaoLocal;
}) {
  const alterar = (indice: number, alteracao: Partial<ReconciledInvoiceItem>) =>
    onChange(itens.map((item, i) => (i === indice ? { ...item, ...alteracao } : item)));

  return (
    <>
      <ShellTable caption="Itens editáveis da conciliação">
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Item</th>
            <th>Quantidade</th>
            <th>Unidade</th>
            <th>Tarifa</th>
            <th>Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item, indice) => (
            <tr key={`conciliacao-${indice}`}>
              <td>
                <select
                  aria-label={`Categoria do item ${indice + 1}`}
                  value={item.categoria}
                  onChange={(evento) =>
                    alterar(indice, {
                      categoria: evento.target.value as ReconciledInvoiceItemCategory,
                    })
                  }
                >
                  {CATEGORIAS_COBRADAS.map((categoria) => (
                    <option key={categoria.valor} value={categoria.valor}>
                      {categoria.rotulo}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  aria-label={`Nome do item ${indice + 1}`}
                  value={item.nome}
                  onChange={(evento) => alterar(indice, { nome: evento.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Quantidade do item ${indice + 1}`}
                  type="number"
                  step="0.000001"
                  min="0"
                  value={item.quantidade ?? ""}
                  onChange={(evento) =>
                    alterar(indice, {
                      quantidade: evento.target.value === "" ? null : Number(evento.target.value),
                    })
                  }
                />
              </td>
              <td>
                <select
                  aria-label={`Unidade do item ${indice + 1}`}
                  value={item.unidade ?? ""}
                  onChange={(evento) =>
                    alterar(indice, {
                      unidade:
                        evento.target.value === ""
                          ? null
                          : (evento.target.value as "kWh" | "kW"),
                    })
                  }
                >
                  <option value="">—</option>
                  <option value="kWh">kWh</option>
                  <option value="kW">kW</option>
                </select>
              </td>
              <td>
                <input
                  aria-label={`Tarifa do item ${indice + 1}`}
                  type="number"
                  step="0.000001"
                  min="0"
                  value={item.tarifa ?? ""}
                  onChange={(evento) =>
                    alterar(indice, {
                      tarifa: evento.target.value === "" ? null : Number(evento.target.value),
                    })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`Valor do item ${indice + 1}`}
                  type="number"
                  step="0.01"
                  value={item.valor}
                  onChange={(evento) => alterar(indice, { valor: Number(evento.target.value) })}
                />
              </td>
              <td>
                <button
                  className="button"
                  type="button"
                  onClick={() => onChange(itens.filter((_, i) => i !== indice))}
                >
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </ShellTable>
      <div className="page-actions">
        <button
          className="button"
          type="button"
          onClick={() =>
            onChange([
              ...itens,
              {
                nome: "Item não reconhecido",
                categoria: "outros",
                compoeTotal: true,
                valor: 0,
                quantidade: null,
                unidade: null,
                tarifa: null,
              },
            ])
          }
        >
          Adicionar item
        </button>
        <StatusPill variant={avaliacao.pronta ? "success" : "danger"}>
          Soma {avaliacao.soma.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ·
          diferença{" "}
          {avaliacao.diferenca.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
          {avaliacao.multiplicacoesInvalidas > 0
            ? ` · ${avaliacao.multiplicacoesInvalidas} multiplicação(ões) divergente(s)`
            : ""}
          {avaliacao.camposInvalidos.length > 0
            ? ` · revisar ${avaliacao.camposInvalidos.join(", ")}`
            : ""}
        </StatusPill>
      </div>
    </>
  );
}
