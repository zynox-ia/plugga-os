"use client";

import {
  type BuscarClientesDeCompraResposta,
  type CompanyKey,
  type ItemDeEstoqueNaLista,
  type Movimentacao,
  type ObraDeCompra,
  type OpcoesDeEstoqueResposta,
  type PedidoParaEntrada,
  type PedidosParaEntradaResposta,
} from "@plugga/shared";
import { ArrowRight, Building2, Check, Download, FileText, HardHat, History, MapPin, Package, RotateCw, Search, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { hojeEmManaus, ROTULO_DA_EMPRESA } from "../../lib/compras";
import { dicaDoPedido, opcaoDoPedido, problemaDaEscolhaDoPedido, problemaDaQuantidadeDoPedido, type PedidosDoItem } from "../../lib/entrada-por-compra";
import { numeroDigitado, paraContrato, previaDaMovimentacao, qtd, type TipoRegistravel } from "../../lib/estoque";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { opcoesDeItens } from "../suprimentos/ligacao-com-estoque";
import { CampoDeMenu, type OpcaoDoMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, TextField } from "../ui";
import styles from "./estoque.module.css";
import { NivelDoItem } from "./partes";

const TIPOS: OpcaoDoMenu[] = [
  { value: "entrada", label: "Entrada", icon: <Download /> },
  { value: "saida", label: "Saída", icon: <Upload /> },
  { value: "ajuste", label: "Ajuste de saldo", icon: <History /> },
];
const EMPRESAS: OpcaoDoMenu[] = (["plugga", "waze"] as const).map((e) => ({ value: e, label: ROTULO_DA_EMPRESA[e], icon: <PontoDaEmpresa empresa={e} /> }));
const ORIGENS: OpcaoDoMenu[] = [
  { value: "compra", label: "Compra", icon: <Download /> },
  { value: "devolucao", label: "Devolução de obra", icon: <Download /> },
  { value: "outra", label: "Outra", icon: <Download /> },
];
const DESTINOS: OpcaoDoMenu[] = [
  { value: "obra", label: "Obra", icon: <HardHat /> },
  { value: "cliente", label: "Cliente", icon: <HardHat /> },
  { value: "interno", label: "Uso interno", icon: <HardHat /> },
];


/** Registrar movimentação (PLU-333): entrada, saída ou ajuste. A empresa filtra o item; trocar a empresa limpa o item. */
export function RegistrarMovimentacao({ itens, itemInicial, tipoInicial = "entrada", aoCancelar, aoRegistrar, aoCadastrarItem }: {
  itens: ItemDeEstoqueNaLista[];
  itemInicial?: ItemDeEstoqueNaLista | null;
  tipoInicial?: TipoRegistravel;
  aoCancelar: () => void;
  aoRegistrar: (m: Movimentacao) => void;
  aoCadastrarItem: () => void;
}) {
  const hoje = hojeEmManaus();
  const [tipo, setTipo] = useState<TipoRegistravel>(tipoInicial);
  const [data, setData] = useState(hoje);
  const [empresa, setEmpresa] = useState<CompanyKey | null>(itemInicial?.empresa ?? null);
  const [itemId, setItemId] = useState<string | null>(itemInicial?.id ?? null);
  const [quantidade, setQuantidade] = useState("");
  const [custo, setCusto] = useState("");
  const [origem, setOrigem] = useState<"compra" | "devolucao" | "outra">("compra");
  const [pedidoId, setPedidoId] = useState("");
  const [destino, setDestino] = useState<"obra" | "cliente" | "interno">("obra");
  const [obraId, setObraId] = useState("");
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientes, setClientes] = useState<BuscarClientesDeCompraResposta["itens"] | null>(null);
  const [area, setArea] = useState("");
  const [contado, setContado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [obras, setObras] = useState<ObraDeCompra[] | null>(null);
  // A lista é do item em que foi carregada: trocar o item a descarta.
  const [pedidos, setPedidos] = useState<{ chave: string; lista: PedidoParaEntrada[] | "erro" } | null>(null);
  const [recargaDosPedidos, setRecargaDosPedidos] = useState(0);
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focar = useRef(false);

  const item = itens.find((i) => i.id === itemId) ?? null;
  const chaveDosPedidos = `${itemId ?? ""}:${recargaDosPedidos}`;
  const pedidosDoItem: PedidosDoItem = !itemId ? "sem_item" : pedidos && pedidos.chave === chaveDosPedidos ? pedidos.lista : "carregando";
  const pedidoEscolhido = Array.isArray(pedidosDoItem) ? pedidosDoItem.find((p) => p.id === pedidoId) ?? null : null;
  // Um pedido escolhido que não está na lista atual bloqueia o envio: a entrada não vira avulsa sozinha.
  const problemaDoPedido = tipo === "entrada" && origem === "compra" ? problemaDaEscolhaDoPedido(pedidoId, pedidosDoItem) : null;
  const opcoes = useMemo(() => opcoesDeItens(itens, empresa), [itens, empresa]);
  const e = (campo: string) => erro?.porCampo[campo] || erro?.porCampo[campo.split(".").at(-1) ?? campo] || undefined;

  // Obras ativas para o destino da saída.
  useEffect(() => {
    if (tipo !== "saida" || obras) return;
    const controle = new AbortController();
    void enviar<OpcoesDeEstoqueResposta>("/api/suprimentos/estoque/opcoes", "GET", undefined, controle.signal).then((r) => { if (!controle.signal.aborted) setObras(r.ok ? r.dados.obras : []); });
    return () => controle.abort();
  }, [tipo, obras]);

  // Pedidos que ainda aceitam entrada do item escolhido, pela rota do Estoque (basta a tela de Estoque).
  useEffect(() => {
    if (tipo !== "entrada" || origem !== "compra" || !itemId) return;
    const controle = new AbortController();
    void enviar<PedidosParaEntradaResposta>(`/api/suprimentos/estoque/itens/${encodeURIComponent(itemId)}/pedidos-para-entrada`, "GET", undefined, controle.signal)
      .then((r) => { if (!controle.signal.aborted) setPedidos({ chave: chaveDosPedidos, lista: r.ok ? r.dados.itens : "erro" }); });
    return () => controle.abort();
  }, [tipo, origem, itemId, chaveDosPedidos]);

  useEffect(() => {
    if (destino !== "cliente" || buscaCliente.trim().length < 2) { setClientes(null); return; }
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      const r = await enviar<BuscarClientesDeCompraResposta>(`/api/suprimentos/estoque/clientes?${new URLSearchParams({ busca: buscaCliente.trim() })}`, "GET", undefined, controle.signal);
      if (r.ok && !controle.signal.aborted) setClientes(r.dados.itens);
    }, 250);
    return () => { clearTimeout(espera); controle.abort(); };
  }, [buscaCliente, destino]);

  useEffect(() => {
    if (!erro || !focar.current) return;
    focar.current = false;
    const alvo = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    alvo?.focus(); alvo?.scrollIntoView({ block: "center" });
  }, [erro]);

  const q = numeroDigitado(quantidade);
  const contadoN = numeroDigitado(contado);
  const previa = item ? previaDaMovimentacao(tipo, item.saldo, Number(item.estoqueMinimo), q, contadoN) : null;
  const obrasDaEmpresa = (obras ?? []).filter((o) => !empresa || o.empresa === empresa);

  function trocarEmpresa(v: string) {
    const nova = v as CompanyKey;
    setEmpresa(nova);
    if (item && item.empresa !== nova) setItemId(null);
    setPedidoId(""); setObraId("");
    setErro((atual) => atual && { ...atual, porCampo: { ...atual.porCampo, empresa: "", itemId: "" } });
  }

  async function registrar(evento: FormEvent) {
    evento.preventDefault();
    const porCampo: Record<string, string> = {};
    // Data digitada inválida (31/02, futura) o DatePicker já segura no campo; aqui, vazia ou futura.
    if (!data) porCampo.data = "informe a data (dd/mm/aaaa).";
    else if (data > hoje) porCampo.data = "a data não pode ser futura.";
    if (!empresa) porCampo.empresa = "escolha a empresa.";
    if (!item) porCampo.itemId = "escolha o item.";
    if (tipo === "ajuste") {
      if (contadoN === null) porCampo.saldoContado = "informe o saldo contado, como 1.234,5.";
      else if (item && contadoN < Number(item.saldo.reservado)) porCampo.saldoContado = `o saldo não pode ficar abaixo do reservado (${qtd(item.saldo.reservado, item.unidade)}).`;
      if (!observacao.trim()) porCampo.observacao = "informe o motivo do ajuste.";
    } else {
      if (q === null || q <= 0) porCampo.quantidade = "informe uma quantidade maior que zero, com até 3 casas.";
      else if (tipo === "saida" && item && q > Number(item.saldo.disponivel)) porCampo.quantidade = `saldo insuficiente: disponível ${qtd(item.saldo.disponivel, item.unidade)}${Number(item.saldo.reservado) > 0 ? ` (${qtd(item.saldo.reservado, item.unidade)} estão reservados)` : ""}.`;
      if (tipo === "entrada") {
        const c = numeroDigitado(custo, 2);
        if (c === null || c <= 0) porCampo.custoUnitario = "informe o custo unitário, como 9,50.";
        const doPedido = origem === "compra" ? problemaDaQuantidadeDoPedido(pedidoEscolhido, q, item?.unidade ?? "un") : null;
        if (doPedido && !porCampo.quantidade) porCampo.quantidade = doPedido;
        if (problemaDoPedido) porCampo["origem.pedidoId"] = problemaDoPedido;
      }
      if (tipo === "saida") {
        if (destino === "obra" && !obraId) porCampo["destino.obraId"] = "escolha a obra.";
        if (destino === "cliente" && !cliente) porCampo["destino.clientId"] = "escolha o cliente.";
      }
    }
    if (Object.keys(porCampo).length) { focar.current = true; setErro({ mensagem: "Confira os campos destacados.", porCampo }); return; }

    const comum = { itemId: item!.id, data, observacao: observacao.trim() || null };
    const corpo = tipo === "entrada"
      ? { tipo, ...comum, quantidade: paraContrato(q!, 3), custoUnitario: numeroDigitado(custo, 2)!.toFixed(2), origem: { tipo: origem, pedidoId: origem === "compra" && pedidoEscolhido ? pedidoEscolhido.id : null } }
      : tipo === "saida"
        ? { tipo, ...comum, quantidade: paraContrato(q!, 3), destino: { tipo: destino, obraId: destino === "obra" ? obraId : null, clientId: destino === "cliente" ? cliente!.id : null, area: destino === "interno" ? area.trim() || null : null } }
        : { tipo, ...comum, saldoContado: paraContrato(contadoN!, 3), observacao: observacao.trim() };
    setEnviando(true); setErro(null);
    const r = await enviar<Movimentacao>("/api/suprimentos/estoque/movimentacoes", "POST", corpo);
    setEnviando(false);
    if (r.ok) { aoRegistrar(r.dados); return; }
    focar.current = true; setErro(r.erro);
  }

  const dicaDoItem = item
    ? `${ROTULO_DA_EMPRESA[item.empresa]} · ${qtd(item.saldo.emEstoque, item.unidade)} em estoque · ${qtd(item.saldo.disponivel, item.unidade)} disponíveis${Number(item.saldo.reservado) > 0 ? ` (${qtd(item.saldo.reservado, item.unidade)} reservados)` : ""}`
    : <>{empresa ? (opcoes.length ? "Escolha o item." : `A ${ROTULO_DA_EMPRESA[empresa]} ainda não tem itens.`) : "Escolha a empresa para ver os itens dela."} <button type="button" className={styles.linkTexto} onClick={aoCadastrarItem}>Cadastrar item novo</button></>;
  const unidade = item?.unidade ?? "un";

  return <Dialog title="Registrar movimentação" description="Entrada, saída ou ajuste do saldo. Tudo fica no histórico do item, com data e autoria." icon={<ArrowRight size={20} />} onClose={aoCancelar}
    footer={<Button type="submit" form="form-movimentacao" icon={<Check size={16} />} disabled={enviando}>{enviando ? "Registrando…" : "Registrar"}</Button>}>
    <form ref={formRef} id="form-movimentacao" className="ui-dialog-form" onSubmit={registrar} noValidate>
      {erro?.mensagem && !Object.values(erro.porCampo).some(Boolean) ? <Alert tone="danger" title={erro.mensagem} /> : null}
      <div className="ui-dialog-grid">
        <CampoDeMenu label="Tipo" required options={TIPOS} value={tipo} onChange={(v) => { setTipo(v as TipoRegistravel); setErro(null); }} />
        <div className={styles.semDica}><DatePicker label="Data" required max={hoje} value={data} onChange={setData} error={e("data")} /></div>
      </div>
      <CampoDeMenu label="Empresa" required options={EMPRESAS} value={empresa ?? undefined} onChange={trocarEmpresa} placeholder="Selecione a empresa" icon={<Building2 />} error={e("empresa")} />
      <CampoDeMenu label="Item" required options={opcoes} value={itemId ?? undefined} onChange={(v) => { setItemId(v); setPedidoId(""); }} disabled={!empresa}
        placeholder={empresa ? "Selecione o item" : "Escolha a empresa primeiro"} icon={<Package />} hint={dicaDoItem} error={e("itemId")} />

      {item && previa ? <div className={styles.previa} aria-live="polite">
        <div className={styles.previaLinha}>
          <div><span>Hoje</span><strong>{qtd(previa.hoje, unidade)}</strong></div>
          <ArrowRight size={16} aria-hidden="true" />
          <div><span>Depois</span><strong className={previa.excedeDisponivel || previa.abaixoDoReservado ? styles.txtPerigo : undefined}>{qtd(previa.depois, unidade)}</strong></div>
          <div><span>Disponível depois</span><strong>{qtd(previa.disponivelDepois, unidade)}</strong></div>
        </div>
        <NivelDoItem emEstoque={previa.depois} reservado={0} minimo={Number(item.estoqueMinimo)} situacao={previa.situacao} unidade={unidade} />
        {previa.excedeDisponivel ? <small className={styles.txtPerigo}>Saída maior que o disponível ({qtd(item.saldo.disponivel, unidade)}).</small>
          : previa.abaixoDoReservado ? <small className={styles.txtPerigo}>Abaixo do reservado ({qtd(item.saldo.reservado, unidade)}).</small>
            : Number(item.estoqueMinimo) > 0 && previa.disponivelDepois < Number(item.estoqueMinimo) ? <small className={styles.muted}>Fica abaixo do mínimo de {qtd(item.estoqueMinimo, unidade)}.</small> : null}
      </div> : null}

      {tipo === "entrada" ? <>
        <div className="ui-dialog-grid">
          <CampoDeMenu label="Origem" options={ORIGENS} value={origem} onChange={(v) => { setOrigem(v as typeof origem); setPedidoId(""); }} />
          {origem === "compra" ? <CampoDeMenu label="Pedido de compra" icon={<FileText />} value={pedidoId || "sem"}
            onChange={(v) => { setPedidoId(v === "sem" ? "" : v); setErro((atual) => atual && { ...atual, porCampo: { ...atual.porCampo, "origem.pedidoId": "", pedidoId: "" } }); }}
            error={e("origem.pedidoId")}
            options={[
              { value: "sem", label: "Sem pedido", icon: <FileText /> },
              ...(Array.isArray(pedidosDoItem) ? pedidosDoItem : []).map((p) => ({ ...opcaoDoPedido(p, unidade), icon: <FileText /> })),
              // O pedido escolhido que saiu da lista continua visível, marcado, até a pessoa trocar.
              ...(pedidoId && !pedidoEscolhido ? [{ value: pedidoId, label: "Pedido escolhido", description: "Indisponível agora", icon: <FileText /> }] : []),
            ]}
            disabled={!pedidoId && (!Array.isArray(pedidosDoItem) || pedidosDoItem.length === 0)}
            hint={problemaDoPedido && pedidoId ? `Atenção: ${problemaDoPedido}` : dicaDoPedido(pedidosDoItem, pedidoEscolhido, unidade)} /> : <span />}
        </div>
        {origem === "compra" && pedidosDoItem === "erro" ? <div className={styles.semDica}>
          <Button variant="secondary" size="sm" icon={<RotateCw size={14} />} onClick={() => setRecargaDosPedidos((n) => n + 1)}>Recarregar pedidos</Button>
        </div> : null}
        <div className="ui-dialog-grid">
          <TextField label="Quantidade" required inputMode="decimal" autoComplete="off" placeholder="0" suffix={unidade} value={quantidade} onChange={(ev) => setQuantidade(ev.target.value)} error={e("quantidade")} />
          <TextField label="Custo unitário" required inputMode="decimal" autoComplete="off" placeholder="0,00" prefix="R$" value={custo} onChange={(ev) => setCusto(ev.target.value)} hint="Atualiza o custo médio do item." error={e("custoUnitario")} />
        </div>
      </> : null}

      {tipo === "saida" ? <>
        <div className="ui-dialog-grid">
          <CampoDeMenu label="Destino" required options={DESTINOS} value={destino} onChange={(v) => { setDestino(v as typeof destino); setObraId(""); setCliente(null); setArea(""); }} />
          {destino === "obra" ? <CampoDeMenu label="Para onde vai" required icon={<MapPin />} value={obraId || undefined} onChange={setObraId} error={e("destino.obraId")}
            placeholder={!empresa ? "Escolha a empresa primeiro" : obras === null ? "Carregando obras…" : obrasDaEmpresa.length ? "Selecione a obra" : "Nenhuma obra desta empresa"}
            options={obrasDaEmpresa.map((o) => ({ value: o.id, label: o.nome, description: o.cliente?.nome, icon: <MapPin /> }))} disabled={!empresa} /> : null}
          {destino === "cliente" ? <div className="ui-field">
            <label htmlFor="mov-cliente">Para onde vai<span className="ui-required"> (obrigatório)</span></label>
            {cliente ? <div className={styles.escolhido}><span>{cliente.nome}</span><Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Trocar o cliente ${cliente.nome}`} onClick={() => setCliente(null)} /></div> : <>
              <div className="ui-input-wrap"><span className="ui-input-adornment" aria-hidden="true"><Search size={15} /></span>
                <input id="mov-cliente" className="ui-input" type="search" value={buscaCliente} onChange={(ev) => setBuscaCliente(ev.target.value)} placeholder="Digite 2 letras do cliente" autoComplete="off"
                  aria-invalid={e("destino.clientId") ? true : undefined} aria-describedby="mov-cliente-ajuda" /></div>
              {clientes?.length ? <ul className={styles.resultados} aria-label="Clientes encontrados">{clientes.map((c) => <li key={c.id}><button type="button" onClick={() => { setCliente(c); setBuscaCliente(""); }}>{c.nome}</button></li>)}</ul> : null}
              <p id="mov-cliente-ajuda" className={e("destino.clientId") ? "ui-field-error" : "ui-field-hint"} role={clientes && !clientes.length ? "status" : undefined}>
                {e("destino.clientId") ? `Erro: ${e("destino.clientId")}` : clientes && !clientes.length ? "Nenhum cliente ativo com esse nome." : "Busca nos clientes ativos do CRM."}</p>
            </>}
          </div> : null}
          {destino === "interno" ? <TextField label="Área" maxLength={100} placeholder="Ex.: Escritório, almoxarifado" value={area} onChange={(ev) => setArea(ev.target.value)} error={e("destino.area")} /> : null}
        </div>
        <div className="ui-dialog-grid">
          <TextField label="Quantidade" required inputMode="decimal" autoComplete="off" placeholder="0" suffix={unidade} value={quantidade} onChange={(ev) => setQuantidade(ev.target.value)} error={e("quantidade")} />
          <TextField label="Observação" maxLength={1000} placeholder="Opcional" value={observacao} onChange={(ev) => setObservacao(ev.target.value)} error={e("observacao")} />
        </div>
      </> : null}

      {tipo === "ajuste" ? <div className="ui-dialog-grid">
        <TextField label="Saldo contado" required inputMode="decimal" autoComplete="off" placeholder="0" suffix={unidade} value={contado} onChange={(ev) => setContado(ev.target.value)} hint="O saldo passa a ser este valor." error={e("saldoContado")} />
        <TextField label="Motivo do ajuste" required maxLength={1000} placeholder="Ex.: contagem de novembro" value={observacao} onChange={(ev) => setObservacao(ev.target.value)} error={e("observacao")} />
      </div> : null}
    </form>
  </Dialog>;
}
