"use client";

import type { AtendimentoPeloEstoque } from "@plugga/shared";
import { CheckCircle2, CircleAlert, CircleMinus, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import { enviar } from "../../lib/clientes";
import { resumoDaCobertura, textoDaLinha, tomDaLinha } from "../../lib/cobertura-do-estoque";
import { Button } from "../ui";
import styles from "./cobertura-do-estoque.module.css";

const ICONE = { atende: CheckCircle2, parcial: CircleAlert, nao: CircleMinus } as const;

/**
 * Quanto o estoque atende, na análise de estoque (PLU-328): consulta a API a
 * cada mudança do pedido (vínculos, itens) e mostra, linha a linha, quanto
 * atende e por que não atende. Só mostra: a decisão continua nos botões da etapa.
 */
export function CoberturaDoEstoque({ pedidoId, versao }: { pedidoId: string; versao: string }) {
  const [estado, setEstado] = useState<{ chave: string; dados: AtendimentoPeloEstoque | "erro" } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const chave = `${pedidoId}:${versao}:${tentativa}`;

  useEffect(() => {
    const controle = new AbortController();
    void enviar<AtendimentoPeloEstoque>(`/api/suprimentos/compras/pedidos/${encodeURIComponent(pedidoId)}/atendimento`, "GET", undefined, controle.signal)
      .then((r) => { if (!controle.signal.aborted) setEstado({ chave, dados: r.ok ? r.dados : "erro" }); });
    return () => controle.abort();
  }, [pedidoId, chave]);

  const dados = estado?.chave === chave ? estado.dados : null;
  return <div className={styles.cobertura} aria-live="polite" aria-busy={dados === null}>
    <h4 className={styles.titulo}>Quanto o estoque atende</h4>
    {dados === null ? <p className={styles.muted}>Consultando o estoque…</p>
      : dados === "erro" ? <div className={styles.erro}>
        <p>Não foi possível consultar o estoque agora.</p>
        <Button variant="secondary" size="sm" icon={<RotateCw size={14} />} onClick={() => setTentativa((t) => t + 1)}>Tentar de novo</Button>
      </div>
        : <>
          <p className={dados.atendeTudo ? styles.ok : styles.muted}>{resumoDaCobertura(dados)}</p>
          <ul className={styles.linhas}>
            {dados.itens.map((linha) => {
              const tom = tomDaLinha(linha);
              const Icone = ICONE[tom];
              const texto = textoDaLinha(linha);
              return <li key={linha.itemDoPedidoId} data-tom={tom}>
                <Icone size={14} aria-hidden="true" />
                <span className={styles.linhaTexto}>
                  <span className={styles.descricao}>{linha.descricao}{linha.itemDeEstoque ? <small> · {linha.itemDeEstoque.codigo}</small> : null}</span>
                  <span>{texto.atende}{texto.porque ? <small className={styles.porque}>{texto.porque}</small> : null}</span>
                </span>
              </li>;
            })}
          </ul>
        </>}
  </div>;
}
