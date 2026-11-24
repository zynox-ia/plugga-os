"use client";

import type { CompanyKey, ObraDeCompra, OpcoesDeCompraResposta, PedidoDeCompra } from "@plugga/shared";
import { CalendarDays, FileText, HardHat, ListChecks, Pencil, Plus, Save, ShoppingCart, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { decimalDigitado, hojeEmManaus, problemaDoPrazo, quantidadeDigitada } from "../../lib/compras";
import { camposDoPedidoAlterados } from "../../lib/ficha-do-pedido";
import { useItensDeEstoque, VinculoComEstoque } from "../suprimentos/ligacao-com-estoque";
import { Alert, Button, DatePicker, Dialog, Heading, TextField, TextareaField } from "../ui";
import { displayCurrency } from "../ui/currency-value";
import { CampoDeEscolha, DestinoDoPedido, opcoesDeEmpresa, Segmentado, type DestinoEscolhido } from "./campos-de-compra";
import styles from "./compras.module.css";

type Item = { chave: number; descricao: string; quantidade: string; unidade: string; estoqueId: string | null };
const UNIDADES = ["un", "m", "kit", "par", "cx", "kg", "h", "lote"];
const itemVazio = (chave: number): Item => ({ chave, descricao: "", quantidade: "", unidade: "un", estoqueId: null });
/** Os itens só mudam até a análise de estoque (contrato): depois as cotações já foram pedidas sobre eles. */
const ETAPAS_COM_ITENS_EDITAVEIS = new Set(["pedido_gerado", "analise_estoque"]);

function destinoInicial(p?: PedidoDeCompra): DestinoEscolhido {
  if (!p) return { destino: "obra", obraId: null, clientId: null, cliente: null };
  return { destino: p.destino.tipo, obraId: p.destino.obra?.id ?? null, clientId: p.destino.cliente?.id ?? null, cliente: p.destino.cliente };
}

const itensIniciais = (p?: PedidoDeCompra): Item[] => p?.itens.length
  ? p.itens.map((i, n) => ({ chave: n + 1, descricao: i.descricao, quantidade: Number(i.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false }), unidade: i.unidade ?? "", estoqueId: i.itemDeEstoque?.id ?? null }))
  : [itemVazio(1)];

/**
 * Novo pedido de compra (PLU-328), que entra em "Pedido gerado". Com `pedido`,
 * o mesmo formulário edita o pedido em andamento e envia só o que mudou.
 */
export function NovoPedido({ opcoes, pedido, aoCancelar, aoSalvar }: {
  opcoes: OpcoesDeCompraResposta; pedido?: PedidoDeCompra; aoCancelar: () => void; aoSalvar: (pedido: PedidoDeCompra) => void;
}) {
  const editando = Boolean(pedido);
  const itensEditaveis = !pedido || ETAPAS_COM_ITENS_EDITAVEIS.has(pedido.etapa);
  const [empresa, setEmpresa] = useState<CompanyKey | null>(pedido?.empresa ?? null);
  const [titulo, setTitulo] = useState(pedido?.titulo ?? "");
  const [descricao, setDescricao] = useState(pedido?.descricao ?? "");
  const [destino, setDestino] = useState<DestinoEscolhido>(() => destinoInicial(pedido));
  // As obras vêm do cadastro de Obras (PLU-355); a do pedido entra mesmo se saiu das ativas.
  const [obras] = useState<ObraDeCompra[]>(() => {
    const obra = pedido?.destino.obra;
    return obra && !opcoes.obras.some((o) => o.id === obra.id) ? [...opcoes.obras, { id: obra.id, empresa: pedido.empresa, nome: obra.nome, cliente: null }] : opcoes.obras;
  });
  const [itens, setItens] = useState<Item[]>(() => itensIniciais(pedido));
  const [prazo, setPrazo] = useState(pedido?.prazoEntregaDesejado ?? "");
  const [valorOrcado, setValorOrcado] = useState(pedido?.valorOrcado ? displayCurrency(pedido.valorOrcado) : "");
  const [responsavel, setResponsavel] = useState<string>(pedido?.responsavel?.id ?? "");
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const proximaChave = useRef(itens.length + 1);
  const focar = useRef(false);
  const hoje = hojeEmManaus();
  const estoque = useItensDeEstoque(empresa);

  useEffect(() => {
    if (!erro || !focar.current) return;
    focar.current = false;
    const alvo = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]');
    if (alvo?.getAttribute("role") === "alert") alvo.setAttribute("tabindex", "-1");
    alvo?.focus(); alvo?.scrollIntoView({ block: "center" });
  }, [erro]);

  const e = (campo: string) => erro?.porCampo[campo];
  const alterarItem = (chave: number, parcial: Partial<Item>) => setItens((atuais) => atuais.map((i) => (i.chave === chave ? { ...i, ...parcial } : i)));

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const porCampo: Record<string, string> = {};
    if (!empresa) porCampo.empresa = "escolha a empresa do pedido (Plugga ou Waze Energia).";
    if (!titulo.trim()) porCampo.titulo = "informe o título do pedido.";
    if (destino.destino === "obra" && !destino.obraId) porCampo.obraId = "escolha a obra de destino.";
    if (destino.destino === "cliente" && !destino.clientId) porCampo.clientId = "escolha o cliente de destino.";
    const preenchidos = itens.filter((i) => i.descricao.trim() || i.quantidade.trim());
    if (preenchidos.length === 0) porCampo.itens = "inclua pelo menos um item.";
    preenchidos.forEach((i) => {
      if (!i.descricao.trim()) porCampo[`item-${i.chave}-descricao`] = "descreva o material.";
      if (!quantidadeDigitada(i.quantidade)) porCampo[`item-${i.chave}-quantidade`] = "quantidade maior que zero, até 3 casas.";
    });
    // Data digitada inválida o DatePicker já segura no campo; aqui, vazia ou já passada.
    const problemaDaEntrega = problemaDoPrazo(prazo, hoje, pedido?.prazoEntregaDesejado);
    if (problemaDaEntrega) porCampo.prazoEntregaDesejado = problemaDaEntrega;
    const orcado = valorOrcado.trim() ? decimalDigitado(valorOrcado) : null;
    if (valorOrcado.trim() && (!orcado || Number(orcado) <= 0)) porCampo.valorOrcado = "valor maior que zero, como 1.450,00.";
    if (Object.keys(porCampo).length) { focar.current = true; setErro({ mensagem: "Confira os campos destacados.", porCampo }); return; }

    const corpo: Record<string, unknown> = {
      empresa, titulo: titulo.trim(), descricao: descricao.trim() || null,
      destino: destino.destino, obraId: destino.obraId, clientId: destino.clientId,
      itens: preenchidos.map((i) => ({ descricao: i.descricao.trim(), quantidade: quantidadeDigitada(i.quantidade), unidade: i.unidade || null, ...(i.estoqueId ? { itemDeEstoqueId: i.estoqueId } : {}) })),
      prazoEntregaDesejado: prazo, valorOrcado: orcado, responsavelId: responsavel || null,
    };
    const envio = pedido ? camposDoPedidoAlterados(pedido, corpo, itensEditaveis) : corpo;
    if (pedido && Object.keys(envio).length === 0) { aoCancelar(); return; }
    setEnviando(true); setErro(null);
    const r = await enviar<PedidoDeCompra>(pedido ? `/api/suprimentos/compras/pedidos/${pedido.id}` : "/api/suprimentos/compras/pedidos", pedido ? "PATCH" : "POST", envio);
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados); return; }
    focar.current = true; setErro(r.erro);
  }

  return <Dialog title={editando ? "Editar pedido" : "Novo pedido de compra"} description={editando ? "Altere os dados do pedido. A etapa e as cotações não mudam." : "Descreva o que precisa ser comprado. O pedido entra em “Pedido gerado”."}
    icon={editando ? <Pencil size={20} /> : <ShoppingCart size={20} />} onClose={aoCancelar}
    footer={<Button type="submit" form="form-pedido" icon={editando ? <Save size={16} /> : <Plus size={16} />} disabled={enviando}>{enviando ? (editando ? "Salvando…" : "Criando…") : editando ? "Salvar alterações" : "Criar pedido"}</Button>}>
    <form ref={formRef} id="form-pedido" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {erro?.mensagem ? <Alert tone="danger" title={erro.mensagem} /> : null}
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<FileText />}>O que comprar</Heading></div>
        <Segmentado rotulo="Empresa" obrigatorio valor={empresa} aoMudar={(v) => { setEmpresa(v); if (destino.destino === "obra" && v !== empresa) setDestino({ ...destino, obraId: null }); if (v !== empresa) setItens((atuais) => atuais.map((i) => ({ ...i, estoqueId: null }))); }} opcoes={opcoesDeEmpresa} erro={e("empresa")} />
        <TextField label="Título" required maxLength={200} value={titulo} onChange={(ev) => setTitulo(ev.target.value)} placeholder="Ex.: Kit solar 8,2 kWp" error={e("titulo")} />
        <TextareaField label="Descrição e observações" maxLength={4000} value={descricao} onChange={(ev) => setDescricao(ev.target.value)} placeholder="Marca preferida, especificação, local de entrega…" error={e("descricao")} />
      </section>
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<HardHat />}>Destino</Heading><p className="ui-dialog-section-desc">Para onde vai o material ou serviço.</p></div>
        <DestinoDoPedido empresa={empresa} obras={obras} valor={destino} aoMudar={setDestino} erros={{ obraId: e("obraId"), clientId: e("clientId") }} />
      </section>
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<ListChecks />}>Itens</Heading><p className="ui-dialog-section-desc">{itensEditaveis ? "Descrição, quantidade e unidade de cada item. Vincule ao estoque para poder atender por ele." : "Os itens não mudam depois da análise de estoque: as cotações já foram pedidas sobre eles."}</p></div>
        <fieldset className={styles.itens} disabled={!itensEditaveis}>
          {itens.map((i, n) => <div key={i.chave} className={styles.item} role="group" aria-label={`Item ${n + 1}`}>
            <TextField aria-label={`Descrição do item ${n + 1}`} maxLength={300} value={i.descricao} onChange={(ev) => alterarItem(i.chave, { descricao: ev.target.value })} placeholder="Ex.: Módulo fotovoltaico 550 W" error={e(`item-${i.chave}-descricao`)} />
            <TextField aria-label={`Quantidade do item ${n + 1}`} inputMode="decimal" value={i.quantidade} onChange={(ev) => alterarItem(i.chave, { quantidade: ev.target.value })} placeholder="Qtd." error={e(`item-${i.chave}-quantidade`)} />
            <div className="ui-field"><select className="ui-input" aria-label={`Unidade do item ${n + 1}`} value={i.unidade} onChange={(ev) => alterarItem(i.chave, { unidade: ev.target.value })}>{[...new Set([...UNIDADES, i.unidade].filter(Boolean))].map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
            <Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Remover item ${n + 1}`} disabled={itens.length === 1 || !itensEditaveis} onClick={() => setItens((atuais) => atuais.filter((x) => x.chave !== i.chave))} />
            <VinculoComEstoque numero={n + 1} empresa={empresa} itens={estoque.itens} indisponivel={estoque.indisponivel} valor={i.estoqueId} disabled={!itensEditaveis} erro={e(`itens.${n}.itemDeEstoqueId`)}
              aoMudar={(item) => alterarItem(i.chave, item ? { estoqueId: item.id, ...(i.descricao.trim() ? {} : { descricao: item.nome }), unidade: item.unidade } : { estoqueId: null })} />
          </div>)}
        </fieldset>
        {e("itens") ? <p className="ui-field-error" role="alert">Erro: {e("itens")}</p> : null}
        {itensEditaveis ? <Button variant="secondary" size="sm" className={styles.adicionar} icon={<Plus size={14} />} onClick={() => setItens((atuais) => [...atuais, itemVazio(proximaChave.current++)])}>Adicionar item</Button> : null}
      </section>
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header"><Heading as="h3" icon={<CalendarDays />}>Prazo, valor e responsável</Heading></div>
        <div className="ui-dialog-grid">
          <div><DatePicker label="Entrega desejada" required min={pedido && pedido.prazoEntregaDesejado < hoje ? undefined : hoje} value={prazo} onChange={setPrazo} error={e("prazoEntregaDesejado")} /></div>
          <TextField label="Valor orçado" inputMode="decimal" prefix="R$" value={valorOrcado} onChange={(ev) => setValorOrcado(ev.target.value)} onBlur={() => { const d = decimalDigitado(valorOrcado); if (d) setValorOrcado(displayCurrency(d)); }} placeholder="0,00" hint="Opcional. Ajuda a priorizar a cotação." error={e("valorOrcado")} />
        </div>
        <CampoDeEscolha label="Responsável" valor={responsavel} aoMudar={setResponsavel} semValor="Sem responsável por enquanto" opcoes={opcoes.pessoas.map((p) => ({ value: p.id, label: p.nome }))} erro={e("responsavelId")} />
      </section>
    </form>
  </Dialog>;
}
