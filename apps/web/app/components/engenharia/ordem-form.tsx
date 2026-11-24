"use client";

import {
  companyKeys,
  origensDaOrdemDeServico,
  prioridadesDaOrdemDeServico,
  tiposDeOrdemDeServico,
  type BuscarClientesDaEngenhariaResposta,
  type CompanyKey,
  type ListarObrasResposta,
  type OrdemDeServico,
  type OrigemDaOrdemDeServico,
  type PrioridadeDaOrdemDeServico,
  type TipoDeOrdemDeServico,
} from "@plugga/shared";
import { Building2, Flag, HardHat, Inbox, Pencil, Plus, Search, UserRound, Wrench, X, Zap } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { enviar } from "../../lib/clientes";
import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import { camposDaOrdemAlterados, ROTULO_DA_PRIORIDADE, ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, TextareaField, TextField } from "../ui";
import { enviarParaAOrdem } from "./envios";
import styles from "./ficha-da-ordem.module.css";
import { ICONE_DO_TIPO } from "./partes";

const ROTULO_DA_ORIGEM: Record<OrigemDaOrdemDeServico, string> = { manual: "Pedido do cliente", monitoramento: "Monitoramento", crm: "CRM", robo: "Robô (WhatsApp ou Telegram)" };
type Cliente = BuscarClientesDaEngenhariaResposta["itens"][number];

type Campos = {
  empresa: CompanyKey | ""; tipo: TipoDeOrdemDeServico | ""; cliente: Cliente | null; ucId: string; obraId: string; local: string; descricao: string;
  origem: OrigemDaOrdemDeServico; prioridade: PrioridadeDaOrdemDeServico; prazo: string;
  equipamento: string; fabricante: string; modelo: string; numeroSerie: string;
};

const vazio = (empresa: CompanyKey | undefined): Campos => ({
  empresa: empresa ?? "", tipo: "", cliente: null, ucId: "", obraId: "", local: "", descricao: "", origem: "manual", prioridade: "normal", prazo: "",
  equipamento: "", fabricante: "", modelo: "", numeroSerie: "",
});

const daOrdem = (o: OrdemDeServico): Campos => ({
  empresa: o.empresa, tipo: o.tipo, cliente: { id: o.cliente.id, nome: o.cliente.nome, ucs: o.uc ? [o.uc] : [] }, ucId: o.uc?.id ?? "", obraId: o.obra?.id ?? "", local: o.local ?? "", descricao: o.descricao,
  origem: o.origem, prioridade: o.prioridade, prazo: o.prazo,
  equipamento: o.equipamento.equipamento ?? "", fabricante: o.equipamento.fabricante ?? "", modelo: o.equipamento.modelo ?? "", numeroSerie: o.equipamento.numeroSerie ?? "",
});

/**
 * Nova O.S. e Editar (PLU-345). A empresa é obrigatória, como o cliente, o
 * tipo, o que precisa ser feito e o prazo. Editar não troca empresa, cliente
 * nem origem: abre-se outra O.S. A obra (PLU-350) é opcional, do mesmo cliente e
 * empresa; o campo só aparece quando o cliente tem obra e a pessoa alcança as Obras.
 */
export function OrdemForm({ ordem, empresaInicial, hoje, prazoSugerido, usinaInicial, aoCancelar, aoSalvar }: {
  ordem?: OrdemDeServico; empresaInicial?: CompanyKey; hoje: string;
  /** Prazo da Nova O.S. por tipo, pelo prazo padrão das Configurações (PLU-349). */
  prazoSugerido?: Partial<Record<TipoDeOrdemDeServico, string>>;
  /** "Abrir O.S." da ficha da usina (PLU-347): empresa, cliente e UC vêm da usina, que vai em `usinaId`. */
  usinaInicial?: { id: string; nome: string; empresa: CompanyKey; cliente: { id: string; nome: string }; uc: { id: string; codigo: string; distribuidora: string } };
  aoCancelar: () => void; aoSalvar: (o: OrdemDeServico) => void;
}) {
  const editando = Boolean(ordem);
  const [c, setC] = useState<Campos>(() => (ordem ? daOrdem(ordem)
    : usinaInicial ? { ...vazio(usinaInicial.empresa), cliente: { ...usinaInicial.cliente, ucs: [usinaInicial.uc] }, ucId: usinaInicial.uc.id }
    : vazio(empresaInicial)));
  const daUsina = Boolean(usinaInicial);
  const [erros, setErros] = useState<Record<string, string | undefined>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<Cliente[] | null>(null);
  /**
   * As obras do cliente na empresa, guardadas com a chave cliente:empresa da consulta. A lista só
   * vale para a chave atual: trocar a empresa ou o cliente esconde a anterior na hora, sem esperar a nova.
   */
  const [obras, setObras] = useState<{ chave: string; itens: { id: string; nome: string }[] } | null>(null);
  // Trocar a empresa ou o cliente desfaz a obra escolhida (ela é do par anterior).
  const mudar = (parcial: Partial<Campos>) => { setC((x) => ({ ...x, ...parcial, ...("empresa" in parcial || "cliente" in parcial ? { obraId: "" } : {}) })); setErros((e) => ({ ...e, ...Object.fromEntries(Object.keys(parcial).map((k) => [k === "cliente" ? "clienteId" : k, undefined])) })); };

  useEffect(() => {
    if (editando || busca.trim().length < 2) { setEncontrados(null); return; }
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      const r = await enviar<BuscarClientesDaEngenhariaResposta>(`/api/engenharia/ordens-de-servico/clientes?${new URLSearchParams({ busca: busca.trim() })}`, "GET", undefined, controle.signal);
      if (r.ok) setEncontrados(r.dados.itens);
    }, 250);
    return () => { clearTimeout(espera); controle.abort(); };
  }, [busca, editando]);

  const clienteId = c.cliente?.id;
  const obraDaOrdem = ordem?.obra ?? null;
  const chaveDasObras = clienteId && c.empresa ? `${clienteId}:${c.empresa}` : null;
  const obrasDoPar = obras && obras.chave === chaveDasObras ? obras.itens : null;
  useEffect(() => {
    if (!clienteId || !c.empresa) return;
    const chave = `${clienteId}:${c.empresa}`;
    const controle = new AbortController();
    void enviar<ListarObrasResposta>(`/api/engenharia/obras?${new URLSearchParams({ clienteId, empresa: c.empresa })}`, "GET", undefined, controle.signal).then((r) => {
      if (controle.signal.aborted) return;
      if (!r.ok) { setObras(null); return; }
      const lista = r.dados.itens.map((o) => ({ id: o.id, nome: o.nome }));
      // A obra atual da O.S. fica na lista mesmo inativa, para não sumir na edição.
      setObras({ chave, itens: obraDaOrdem && !lista.some((o) => o.id === obraDaOrdem.id) ? [obraDaOrdem, ...lista] : lista });
    });
    return () => controle.abort();
  }, [clienteId, c.empresa, obraDaOrdem?.id]);

  /** Na Nova O.S., o tipo traz o prazo sugerido, a não ser que a pessoa já tenha mudado o prazo à mão. */
  function escolherTipo(tipo: TipoDeOrdemDeServico) {
    const sugerido = editando ? undefined : prazoSugerido?.[tipo];
    const anterior = c.tipo ? prazoSugerido?.[c.tipo] : undefined;
    const prazoIntocado = !c.prazo || c.prazo === anterior;
    mudar({ tipo, ...(sugerido && prazoIntocado ? { prazo: sugerido } : {}) });
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const problemas: Record<string, string | undefined> = {
      empresa: c.empresa ? undefined : "escolha a empresa.",
      tipo: c.tipo ? undefined : "escolha o tipo.",
      clienteId: c.cliente ? undefined : "escolha o cliente.",
      descricao: c.descricao.trim() ? undefined : "descreva o serviço.",
      prazo: !c.prazo ? "informe o prazo (dd/mm/aaaa)." : c.prazo < hoje && c.prazo !== ordem?.prazo ? "o prazo não pode estar no passado." : undefined,
    };
    setErros(problemas);
    if (Object.values(problemas).some(Boolean)) return;
    const texto = (v: string) => v.trim() || null;
    const equipamento = { equipamento: texto(c.equipamento), fabricante: texto(c.fabricante), modelo: texto(c.modelo), numeroSerie: texto(c.numeroSerie) };
    // Editar manda só o que mudou: a API recusa prazo no passado, e o de uma O.S. atrasada já está.
    const alterados = ordem ? camposDaOrdemAlterados(ordem, { tipo: c.tipo || null, local: texto(c.local), descricao: c.descricao.trim(), prioridade: c.prioridade, prazo: c.prazo, ...equipamento }) : null;
    const obraMudou = ordem ? (c.obraId || null) !== (ordem.obra?.id ?? null) : false;
    if (ordem && alterados && Object.keys(alterados).length === 0 && !obraMudou) { aoCancelar(); return; }
    setEnviando(true); setFalha(null);
    const r = ordem
      ? await enviarParaAOrdem(ordem.id, "", "PATCH", { ...alterados, ...(obraMudou ? { obraId: c.obraId || null } : {}) })
      : await enviar<OrdemDeServico>("/api/engenharia/ordens-de-servico", "POST", { empresa: c.empresa, tipo: c.tipo, clienteId: c.cliente!.id, ucId: c.ucId || null, local: texto(c.local), descricao: c.descricao.trim(), prioridade: c.prioridade, origem: c.origem, prazo: c.prazo, ...equipamento, ...(usinaInicial ? { usinaId: usinaInicial.id } : {}), ...(c.obraId && obrasDoPar?.some((o) => o.id === c.obraId) ? { obraId: c.obraId } : {}) });
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados); return; }
    setErros((e) => ({ ...e, ...r.erro.porCampo }));
    setFalha(r.erro.mensagem);
  }

  const ucs = c.cliente?.ucs ?? [];
  return <Dialog title={editando ? `Editar ${ordem!.codigo}` : "Nova O.S."} size="media" icon={editando ? <Pencil size={20} /> : <Wrench size={20} />} onClose={aoCancelar}
    description={editando ? "Dados e equipamento. Empresa, cliente e origem não mudam: para isso, abra outra O.S." : usinaInicial ? `Da usina ${usinaInicial.nome}: empresa, cliente e UC vêm dela, e o equipamento também, se não for informado.` : "Uma ordem de serviço por cliente e serviço. O robô cria a mesma O.S. a partir do WhatsApp Técnicos."}
    footer={<Button type="submit" form="form-ordem" icon={editando ? undefined : <Plus size={15} />} disabled={enviando}>{enviando ? "Salvando…" : editando ? "Salvar" : "Criar O.S."}</Button>}>
    <form id="form-ordem" className={`ui-dialog-form ${styles.formDaOrdem}`} onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <CampoDeMenu label="Empresa" required icon={<Building2 />} placeholder="Selecione a empresa" value={c.empresa || undefined} onChange={(v) => mudar({ empresa: v as CompanyKey })} disabled={editando || daUsina}
        options={companyKeys.map((e) => ({ value: e, label: ROTULO_DA_EMPRESA[e], icon: <PontoDaEmpresa empresa={e} /> }))} error={erros.empresa} />
      <CampoDeMenu label="Tipo" required icon={<Wrench />} placeholder="Selecione o tipo" value={c.tipo || undefined} onChange={(v) => escolherTipo(v as TipoDeOrdemDeServico)}
        options={tiposDeOrdemDeServico.map((t) => { const Icone = ICONE_DO_TIPO[t]; return { value: t, label: ROTULO_DO_TIPO[t], icon: <Icone /> }; })} error={erros.tipo} />

      <div className={`ui-field ${styles.largo}`}>
        <label htmlFor="os-busca-cliente">Cliente<span className="ui-required"> (obrigatório)</span></label>
        {c.cliente ? <div className={styles.escolhido}><UserRound size={15} aria-hidden="true" /><span>{c.cliente.nome}</span>
          {editando || daUsina ? null : <Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Trocar o cliente ${c.cliente.nome}`} onClick={() => mudar({ cliente: null, ucId: "" })} />}</div> : <>
          <div className="ui-input-wrap"><span className="ui-input-adornment" aria-hidden="true"><Search size={15} /></span>
            <input id="os-busca-cliente" className="ui-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite ao menos 2 letras do nome" autoComplete="off"
              aria-invalid={erros.clienteId ? true : undefined} aria-describedby={erros.clienteId ? "os-busca-cliente-erro" : "os-busca-cliente-dica"} /></div>
          {encontrados ? (encontrados.length ? <ul className={styles.resultados} aria-label="Clientes encontrados">{encontrados.map((x) => <li key={x.id}>
            <button type="button" onClick={() => { mudar({ cliente: x, ucId: x.ucs.length === 1 ? x.ucs[0]!.id : "" }); setBusca(""); }}>{x.nome}{x.ucs.length ? <small>{x.ucs.length === 1 ? "1 UC" : `${x.ucs.length} UCs`}</small> : null}</button>
          </li>)}</ul> : <p className="ui-field-hint" role="status">Nenhum cliente com esse nome.</p>) : <p id="os-busca-cliente-dica" className="ui-field-hint">Busca nos clientes do CRM.</p>}
        </>}
        {erros.clienteId ? <p id="os-busca-cliente-erro" className="ui-field-error">Erro: {erros.clienteId}</p> : null}
      </div>
      <CampoDeMenu label="Unidade consumidora" icon={<Zap />} placeholder={c.cliente ? (ucs.length ? "Sem UC" : "O cliente não tem UC") : "Escolha o cliente primeiro"} value={c.ucId || (c.cliente && ucs.length ? "sem" : undefined)}
        onChange={(v) => mudar({ ucId: v === "sem" ? "" : v })} disabled={daUsina || editando || !c.cliente || ucs.length === 0}
        options={[{ value: "sem", label: "Sem UC", icon: <Zap /> }, ...ucs.map((u) => ({ value: u.id, label: u.codigo, description: u.distribuidora, icon: <Zap /> }))]} />
      {obrasDoPar && obrasDoPar.length ? <CampoDeMenu label="Obra" icon={<HardHat />} value={c.obraId || "sem"} onChange={(v) => mudar({ obraId: v === "sem" ? "" : v })} error={erros.obraId}
        options={[{ value: "sem", label: "Sem obra", icon: <HardHat /> }, ...obrasDoPar.map((o) => ({ value: o.id, label: o.nome, icon: <HardHat /> }))]} hint="Obra do mesmo cliente e empresa." /> : null}

      <div className={styles.largo}><TextareaField label="O que precisa ser feito" required maxLength={2000} rows={2} value={c.descricao} onChange={(e) => mudar({ descricao: e.target.value })} error={erros.descricao}
        placeholder="Ex.: inversor desligando à tarde" /></div>
      <TextField label="Local" maxLength={300} value={c.local} onChange={(e) => mudar({ local: e.target.value })} placeholder="Bairro e cidade, ou o endereço" />
      <CampoDeMenu label="Prioridade" icon={<Flag />} value={c.prioridade} onChange={(v) => mudar({ prioridade: v as PrioridadeDaOrdemDeServico })}
        options={prioridadesDaOrdemDeServico.map((p) => ({ value: p, label: ROTULO_DA_PRIORIDADE[p], icon: <Flag /> }))} />
      <CampoDeMenu label="Origem" icon={<Inbox />} value={c.origem} onChange={(v) => mudar({ origem: v as OrigemDaOrdemDeServico })} disabled={editando}
        options={origensDaOrdemDeServico.map((o) => ({ value: o, label: ROTULO_DA_ORIGEM[o], icon: <Inbox /> }))} />
      <DatePicker label="Prazo" required min={editando ? undefined : hoje} value={c.prazo} onChange={(v) => mudar({ prazo: v })} error={erros.prazo} />

      <fieldset className={`${styles.largo} ${styles.grupoDoEquipamento}`}>
        <legend>Equipamento <span className={styles.opcional}>(opcional)</span></legend>
        <TextField label="Equipamento" maxLength={120} value={c.equipamento} onChange={(e) => mudar({ equipamento: e.target.value })} placeholder="Ex.: inversor" error={erros.equipamento} />
        <TextField label="Fabricante" maxLength={120} value={c.fabricante} onChange={(e) => mudar({ fabricante: e.target.value })} placeholder="Ex.: Growatt" error={erros.fabricante} />
        <TextField label="Modelo" maxLength={120} value={c.modelo} onChange={(e) => mudar({ modelo: e.target.value })} error={erros.modelo} />
        <TextField label="Número de série" maxLength={120} value={c.numeroSerie} onChange={(e) => mudar({ numeroSerie: e.target.value })} error={erros.numeroSerie} />
      </fieldset>
    </form>
  </Dialog>;
}

