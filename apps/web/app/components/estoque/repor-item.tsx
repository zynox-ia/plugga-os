"use client";

import type { ItemDeEstoque, PedidoDeReposicaoAberto } from "@plugga/shared";
import { ShoppingCart } from "lucide-react";
import { useState, type FormEvent } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { hojeEmManaus, problemaDoPrazo } from "../../lib/compras";
import { numeroDigitado, paraContrato, qtd } from "../../lib/estoque";
import { Alert, Button, DatePicker, Dialog, TextField } from "../ui";

/** "Abrir pedido de compra" de um item abaixo do mínimo: o pedido nasce com o item e a quantidade que falta. */
export function ReporItem({ item, aoCancelar, aoAbrir }: { item: ItemDeEstoque; aoCancelar: () => void; aoAbrir: (pedido: PedidoDeReposicaoAberto) => void }) {
  const hoje = hojeEmManaus();
  const [quantidade, setQuantidade] = useState(Number(item.saldo.faltaParaOMinimo).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
  const [prazo, setPrazo] = useState("");
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function abrir(evento: FormEvent) {
    evento.preventDefault();
    const q = numeroDigitado(quantidade);
    const porCampo: Record<string, string> = {};
    if (q === null || q <= 0) porCampo.quantidade = "informe uma quantidade maior que zero.";
    // Data digitada inválida o DatePicker já segura no campo; aqui, vazia ou já passada, como no Novo pedido.
    const problemaDaEntrega = problemaDoPrazo(prazo, hoje);
    if (problemaDaEntrega) porCampo.prazoEntregaDesejado = problemaDaEntrega;
    if (Object.keys(porCampo).length) { setErro({ mensagem: "Confira os campos destacados.", porCampo }); return; }
    setEnviando(true); setErro(null);
    const r = await enviar<PedidoDeReposicaoAberto>(`/api/suprimentos/estoque/itens/${item.id}/abrir-pedido`, "POST", { quantidade: paraContrato(q!, 3), prazoEntregaDesejado: prazo });
    setEnviando(false);
    if (r.ok) aoAbrir(r.dados); else setErro(r.erro);
  }

  return <Dialog title="Abrir pedido de compra" size="estreita" icon={<ShoppingCart size={20} />} onClose={aoCancelar}
    description={`${item.nome}: faltam ${qtd(item.saldo.faltaParaOMinimo, item.unidade)} para o mínimo. O pedido entra em “Pedido gerado”, com destino interno.`}
    footer={<Button type="submit" form="form-repor" icon={<ShoppingCart size={16} />} disabled={enviando}>{enviando ? "Abrindo…" : "Abrir pedido"}</Button>}>
    <form id="form-repor" className="ui-dialog-form" onSubmit={abrir} noValidate>
      {erro?.mensagem && !Object.values(erro.porCampo).some(Boolean) ? <Alert tone="danger" title={erro.mensagem} /> : null}
      <TextField label="Quantidade" required inputMode="decimal" autoComplete="off" suffix={item.unidade} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} error={erro?.porCampo.quantidade} />
      <div><DatePicker label="Entrega desejada" required min={hoje} value={prazo} onChange={setPrazo} error={erro?.porCampo.prazoEntregaDesejado} /></div>
    </form>
  </Dialog>;
}
