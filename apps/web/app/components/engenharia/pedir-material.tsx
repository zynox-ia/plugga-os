"use client";

import type { OrdemDeServico } from "@plugga/shared";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { quantidadeDigitada } from "../../lib/compras";
import { Alert, Button, DatePicker, Dialog, TextareaField, TextField } from "../ui";
import { enviarParaAOrdem } from "./envios";
import styles from "./ficha-da-ordem.module.css";

type Linha = { chave: number; descricao: string; quantidade: string; unidade: string };
let proxima = 1;
const novaLinha = (): Linha => ({ chave: proxima++, descricao: "", quantidade: "", unidade: "" });

/**
 * Pedir material: cria o pedido de compra em Suprimentos com a origem nesta
 * O.S. (PLU-327). Compras segue o pedido dali; a ficha mostra o vínculo.
 */
export function PedirMaterial({ ordem, hoje, aoCancelar, aoPedir }: { ordem: OrdemDeServico; hoje: string; aoCancelar: () => void; aoPedir: (o: OrdemDeServico) => void }) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prazo, setPrazo] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>(() => [novaLinha()]);
  const [erros, setErros] = useState<Record<string, string | undefined>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (chave: number, parcial: Partial<Linha>) => { setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...parcial } : l))); setErros((e) => ({ ...e, [`${chave}.${Object.keys(parcial)[0]}`]: undefined })); };

  async function pedir(evento: FormEvent) {
    evento.preventDefault();
    const problemas: Record<string, string | undefined> = {};
    if (!prazo) problemas.prazo = "informe a entrega desejada (dd/mm/aaaa).";
    else if (prazo < hoje) problemas.prazo = "a entrega desejada não pode estar no passado.";
    const preenchidas = linhas.filter((l) => l.descricao.trim() || l.quantidade.trim());
    if (preenchidas.length === 0) problemas[`${linhas[0]!.chave}.descricao`] = "informe ao menos um material.";
    for (const l of preenchidas) {
      if (!l.descricao.trim()) problemas[`${l.chave}.descricao`] = "descreva o material.";
      if (!quantidadeDigitada(l.quantidade)) problemas[`${l.chave}.quantidade`] = "informe a quantidade, como 2 ou 1,5.";
    }
    setErros(problemas);
    if (Object.values(problemas).some(Boolean)) return;
    setEnviando(true); setFalha(null);
    const r = await enviarParaAOrdem(ordem.id, "/pedidos-de-material", "POST", {
      titulo: titulo.trim() || null,
      descricao: descricao.trim() || null,
      prazoEntregaDesejado: prazo,
      itens: preenchidas.map((l) => ({ descricao: l.descricao.trim(), quantidade: quantidadeDigitada(l.quantidade)!, unidade: l.unidade.trim() || null })),
    });
    setEnviando(false);
    if (r.ok) { aoPedir(r.dados); return; }
    setFalha(Object.values(r.erro.porCampo)[0] ? `${r.erro.mensagem} ${Object.values(r.erro.porCampo).join(" ")}` : r.erro.mensagem);
  }

  return <Dialog title="Pedir material" size="media" icon={<ShoppingCart size={20} />} onClose={aoCancelar} cancelText="Cancelar"
    description={`O pedido nasce em Compras com a origem em ${ordem.codigo}; Suprimentos cota, compra ou separa do estoque.`}
    footer={<Button type="submit" form="form-material" icon={<ShoppingCart size={15} />} disabled={enviando}>{enviando ? "Enviando…" : "Pedir material"}</Button>}>
    <form id="form-material" className="ui-dialog-form" onSubmit={pedir} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <TextField label="Título" maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={`Material para ${ordem.codigo}`} hint="Opcional. Sem título, Compras usa o código da O.S." />
      <fieldset className={styles.itensDoPedido}>
        <legend>Materiais<span className="ui-required"> (obrigatório)</span></legend>
        {linhas.map((l, i) => <div key={l.chave} className={styles.linhaDoItem}>
          <TextField label={`Material ${i + 1}`} required maxLength={300} value={l.descricao} onChange={(e) => mudar(l.chave, { descricao: e.target.value })} error={erros[`${l.chave}.descricao`]} placeholder="Ex.: conector MC4 macho e fêmea" />
          <TextField label="Quantidade" required inputMode="decimal" maxLength={12} value={l.quantidade} onChange={(e) => mudar(l.chave, { quantidade: e.target.value })} error={erros[`${l.chave}.quantidade`]} placeholder="0" />
          <TextField label="Unidade" maxLength={20} value={l.unidade} onChange={(e) => mudar(l.chave, { unidade: e.target.value })} placeholder="un" />
          {linhas.length > 1 ? <Button variant="secondary" size="sm" iconOnly icon={<Trash2 size={14} />} aria-label={`Tirar o material ${i + 1}`} className={styles.tirarItem} onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))} /> : null}
        </div>)}
        {linhas.length < 100 ? <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setLinhas((ls) => [...ls, novaLinha()])}>Adicionar material</Button> : null}
      </fieldset>
      <DatePicker label="Entrega desejada" required min={hoje} value={prazo} onChange={(v) => { setPrazo(v); setErros((e) => ({ ...e, prazo: undefined })); }} error={erros.prazo} />
      <TextareaField label="Observações" maxLength={2000} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional: marca, onde entregar, quem recebe" />
    </form>
  </Dialog>;
}
