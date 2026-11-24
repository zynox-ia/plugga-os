"use client";

import { companyKeys, type BuscarClientesDaEngenhariaResposta, type CompanyKey, type EditarObra, type Obra, type OpcoesDasObrasResposta } from "@plugga/shared";
import { Building2, HardHat, Pencil, Plus, Search, UserRound, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { enviar } from "../../lib/clientes";
import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import { entregaMinima, lerOrcamento, problemasDaNovaObra, type NovaObra, type ProblemasDaObra } from "../../lib/obras";
import { lerPotencia } from "../../lib/usinas";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, TextField } from "../ui";
import styles from "./ficha-da-ordem.module.css";

type Cliente = BuscarClientesDaEngenhariaResposta["itens"][number];
const BUSCA_DE_CLIENTES = "/api/engenharia/obras/clientes";
const orcamentoLegivel = (v: string | null) => (v ? v.replace(".", ",") : "");

/**
 * Nova obra e Editar (PLU-350), para obras grandes: instalações comuns seguem como
 * O.S. de instalação. Empresa e cliente não mudam depois; o início pode ser passado
 * (obra em andamento) e a entrega vem depois do início, a partir de amanhã. O
 * orçamento é só do gerente (`editar_orcamento`); a edição manda só o que mudou.
 */
export function ObraForm({ obra, opcoes, hoje, empresaInicial, aoCancelar, aoSalvar }: {
  obra?: Obra;
  opcoes: OpcoesDasObrasResposta | null;
  hoje: string;
  empresaInicial?: CompanyKey;
  aoCancelar: () => void;
  aoSalvar: (o: Obra) => void;
}) {
  const editando = Boolean(obra);
  const [form, setForm] = useState<NovaObra>({
    empresa: obra?.empresa ?? empresaInicial ?? "",
    clienteId: obra?.cliente?.id ?? "",
    nome: obra?.nome ?? "",
    potencia: obra?.potenciaKwp ? obra.potenciaKwp.replace(".", ",") : "",
    responsavelId: obra?.responsavel?.id ?? "",
    inicioEm: obra?.inicioEm ?? (obra ? "" : hoje),
    entregaPrevistaEm: obra?.entregaPrevistaEm ?? "",
  });
  const [orcamento, setOrcamento] = useState(orcamentoLegivel(obra?.orcamento ?? null));
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(obra?.cliente ?? null);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<Cliente[] | null>(null);
  const [erros, setErros] = useState<ProblemasDaObra & { orcamento?: string }>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const podeOrcamento = obra?.acoesPermitidas.includes("editar_orcamento") ?? false;
  const mudar = (parcial: Partial<NovaObra>) => {
    setForm((f) => ({ ...f, ...parcial }));
    setErros((e) => { const n = { ...e }; for (const k of Object.keys(parcial)) delete n[k as keyof NovaObra]; return n; });
  };

  useEffect(() => {
    if (editando || busca.trim().length < 2) { setEncontrados(null); return; }
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      const r = await enviar<BuscarClientesDaEngenhariaResposta>(`${BUSCA_DE_CLIENTES}?${new URLSearchParams({ busca: busca.trim() })}`, "GET", undefined, controle.signal);
      if (r.ok) setEncontrados(r.dados.itens);
    }, 250);
    return () => { clearTimeout(espera); controle.abort(); };
  }, [busca, editando]);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const todos = problemasDaNovaObra(form, hoje);
    // Na edição, empresa e cliente estão fixos; a entrega já passada pode ficar como está.
    const problemas: ProblemasDaObra & { orcamento?: string } = obra
      ? Object.fromEntries(Object.entries(todos).filter(([k]) => !["empresa", "clienteId"].includes(k) && !(k === "entregaPrevistaEm" && form.entregaPrevistaEm === obra.entregaPrevistaEm) && !(k === "inicioEm" && obra.inicioEm)))
      : todos;
    const orc = lerOrcamento(orcamento);
    if (podeOrcamento && orc.problema) problemas.orcamento = orc.problema;
    setErros(problemas);
    if (Object.values(problemas).some(Boolean)) return;
    const kwp = lerPotencia(form.potencia).valor!;
    setEnviando(true); setFalha(null);
    let r;
    if (obra) {
      const mudou: EditarObra = {
        ...(form.nome.trim() !== obra.nome ? { nome: form.nome.trim() } : {}),
        ...(Number(kwp.replace(",", ".")) !== Number(obra.potenciaKwp ?? NaN) ? { potenciaKwp: kwp } : {}),
        ...((form.responsavelId || null) !== (obra.responsavel?.id ?? null) ? { responsavelId: form.responsavelId || null } : {}),
        ...(!obra.inicioEm && form.inicioEm ? { inicioEm: form.inicioEm } : {}),
        ...(form.entregaPrevistaEm !== obra.entregaPrevistaEm ? { entregaPrevistaEm: form.entregaPrevistaEm } : {}),
        ...(podeOrcamento && (orc.valor ? Number(orc.valor.replace(",", ".")) : null) !== (obra.orcamento ? Number(obra.orcamento) : null) ? { orcamento: orc.valor } : {}),
      };
      if (Object.keys(mudou).length === 0) { setEnviando(false); aoCancelar(); return; }
      r = await enviar<Obra>(`/api/engenharia/obras/${obra.id}`, "PATCH", mudou);
    } else {
      r = await enviar<Obra>("/api/engenharia/obras", "POST", {
        empresa: form.empresa, clienteId: form.clienteId, nome: form.nome.trim(), potenciaKwp: kwp,
        responsavelId: form.responsavelId || null, inicioEm: form.inicioEm, entregaPrevistaEm: form.entregaPrevistaEm,
      });
    }
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados); return; }
    const { potenciaKwp: erroDaPotencia, ...resto } = r.erro.porCampo;
    setErros((e) => ({ ...e, ...resto, ...(erroDaPotencia ? { potencia: erroDaPotencia } : {}) }));
    setFalha(r.erro.mensagem);
  }

  const responsaveis = [...(opcoes?.responsaveis ?? []), ...(obra?.responsavel && !opcoes?.responsaveis.some((p) => p.id === obra.responsavel!.id) ? [obra.responsavel] : [])];
  const inicioFixo = Boolean(obra?.inicioEm);
  return <Dialog title={editando ? `Editar ${obra!.nome}` : "Nova obra"} size="media" icon={editando ? <Pencil size={20} /> : <HardHat size={20} />} onClose={aoCancelar}
    description={editando ? "Empresa, cliente e início não mudam." : "Para obras grandes. Instalações comuns continuam como O.S. de instalação. A obra nasce com os 6 marcos."}
    footer={<Button type="submit" form="form-obra" icon={editando ? undefined : <Plus size={15} />} disabled={enviando}>{enviando ? "Salvando…" : editando ? "Salvar" : "Criar obra"}</Button>}>
    <form id="form-obra" className={`ui-dialog-form ${styles.formDaOrdem}`} onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <div className={styles.largo}><TextField label="Nome da obra" required maxLength={120} value={form.nome} onChange={(e) => mudar({ nome: e.target.value })} error={erros.nome} placeholder="Ex.: Galpão Logístico · 61 kWp" /></div>
      <CampoDeMenu label="Empresa" required icon={<Building2 />} placeholder="Selecione a empresa" value={form.empresa || undefined} onChange={(v) => mudar({ empresa: v as CompanyKey })} disabled={editando}
        options={companyKeys.map((e) => ({ value: e, label: ROTULO_DA_EMPRESA[e], icon: <PontoDaEmpresa empresa={e} /> }))} error={erros.empresa} />
      <TextField label="Potência (kWp)" required inputMode="decimal" maxLength={12} value={form.potencia} onChange={(e) => mudar({ potencia: e.target.value })} error={erros.potencia} placeholder="61,2" />
      <div className={`ui-field ${styles.largo}`}>
        <label htmlFor="obra-busca-cliente">Cliente<span className="ui-required"> (obrigatório)</span></label>
        {cliente ? <div className={styles.escolhido}><UserRound size={15} aria-hidden="true" /><span>{cliente.nome}</span>
          {editando ? null : <Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Trocar o cliente ${cliente.nome}`} onClick={() => { setCliente(null); mudar({ clienteId: "" }); }} />}</div> : <>
          <div className="ui-input-wrap"><span className="ui-input-adornment" aria-hidden="true"><Search size={15} /></span>
            <input id="obra-busca-cliente" className="ui-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite ao menos 2 letras do nome" autoComplete="off"
              aria-invalid={erros.clienteId ? true : undefined} aria-describedby={erros.clienteId ? "obra-cliente-erro" : "obra-cliente-dica"} /></div>
          {encontrados ? (encontrados.length ? <ul className={styles.resultados} aria-label="Clientes encontrados">{encontrados.map((x) => <li key={x.id}>
            <button type="button" onClick={() => { setCliente({ id: x.id, nome: x.nome }); setBusca(""); mudar({ clienteId: x.id }); }}>{x.nome}</button>
          </li>)}</ul> : <p className="ui-field-hint" role="status">Nenhum cliente com esse nome.</p>) : <p id="obra-cliente-dica" className="ui-field-hint">Busca nos clientes do CRM.</p>}
        </>}
        {erros.clienteId ? <p id="obra-cliente-erro" className="ui-field-error">Erro: {erros.clienteId}</p> : null}
      </div>
      <DatePicker label="Início" required value={form.inicioEm} onChange={(v) => mudar({ inicioEm: v })} error={erros.inicioEm} disabled={inicioFixo} hint={inicioFixo ? undefined : "Pode ser no passado, para a obra já em andamento."} />
      <DatePicker label="Entrega prevista" required min={entregaMinima(form.inicioEm, hoje)} value={form.entregaPrevistaEm} onChange={(v) => mudar({ entregaPrevistaEm: v })} error={erros.entregaPrevistaEm} hint="Depois do início e a partir de amanhã." />
      <CampoDeMenu label="Responsável" icon={<UserRound />} value={form.responsavelId || "sem"} onChange={(v) => mudar({ responsavelId: v === "sem" ? "" : v })} disabled={!opcoes && !obra}
        options={[{ value: "sem", label: "Sem responsável", icon: <UserRound /> }, ...responsaveis.map((p) => ({ value: p.id, label: p.nome, icon: <UserRound /> }))]} />
      {podeOrcamento ? <TextField label="Orçamento (R$)" inputMode="decimal" maxLength={20} value={orcamento} onChange={(e) => { setOrcamento(e.target.value); setErros((x) => ({ ...x, orcamento: undefined })); }}
        error={erros.orcamento} placeholder="125.000,50" hint="Só o gerente da Engenharia muda. O Financeiro lê." /> : null}
    </form>
  </Dialog>;
}
