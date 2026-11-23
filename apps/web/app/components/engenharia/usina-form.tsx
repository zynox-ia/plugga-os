"use client";

import { companyKeys, type BuscarClientesDaEngenhariaResposta, type CompanyKey, type PlataformaDeInversor, type Usina } from "@plugga/shared";
import { Building2, Monitor, Pencil, Plus, Search, Sun, UserRound, X, Zap } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { enviar } from "../../lib/clientes";
import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import { lerPotencia } from "../../lib/usinas";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, TextField } from "../ui";
import styles from "./ficha-da-ordem.module.css";

type Cliente = BuscarClientesDaEngenhariaResposta["itens"][number];
/** Busca de clientes com as UCs, para a Nova usina. */
const BUSCA_DE_CLIENTES = "/api/engenharia/ordens-de-servico/clientes";

/**
 * Nova usina e Editar (PLU-347): empresa, cliente e UC (que não mudam depois),
 * nome, plataforma, potência em kWp ("12,75"), inversor, data de comissionamento
 * e garantia. A usina nasce também do comissionamento (`ordemDeComissionamentoId`).
 */
export function UsinaForm({ usina, plataformas, hoje, empresaInicial, comissionamento, aoCancelar, aoSalvar }: {
  usina?: Usina;
  plataformas: PlataformaDeInversor[];
  hoje: string;
  empresaInicial?: CompanyKey;
  /** A O.S. de comissionamento concluída de onde a usina nasce (cliente, UC e empresa vêm dela). */
  comissionamento?: { ordemId: string; empresa: CompanyKey; cliente: Cliente; ucId: string | null };
  aoCancelar: () => void;
  aoSalvar: (u: Usina) => void;
}) {
  const editando = Boolean(usina);
  const [empresa, setEmpresa] = useState<CompanyKey | "">(usina?.empresa ?? comissionamento?.empresa ?? empresaInicial ?? "");
  const [cliente, setCliente] = useState<Cliente | null>(usina ? { id: usina.cliente.id, nome: usina.cliente.nome, ucs: [usina.uc] } : comissionamento?.cliente ?? null);
  const [ucId, setUcId] = useState(usina?.uc.id ?? comissionamento?.ucId ?? "");
  const [nome, setNome] = useState(usina?.nome ?? "");
  const [plataformaId, setPlataformaId] = useState(usina?.plataforma.id ?? "");
  const [potencia, setPotencia] = useState(usina ? usina.potenciaKwp.replace(".", ",") : "");
  const [fabricante, setFabricante] = useState(usina?.fabricante ?? "");
  const [modelo, setModelo] = useState(usina?.modelo ?? "");
  const [numeroSerie, setNumeroSerie] = useState(usina?.numeroSerie ?? "");
  const [comissionadaEm, setComissionadaEm] = useState(usina?.comissionadaEm ?? (comissionamento ? hoje : ""));
  const [garantiaAte, setGarantiaAte] = useState(usina?.garantiaAte ?? "");
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<Cliente[] | null>(null);
  const [erros, setErros] = useState<Record<string, string | undefined>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fixo = editando || Boolean(comissionamento);

  // Comissionamento sem UC na O.S.: traz as UCs do cliente para escolher uma (a UC é obrigatória).
  useEffect(() => {
    if (!comissionamento || comissionamento.ucId) return;
    const controle = new AbortController();
    void enviar<BuscarClientesDaEngenhariaResposta>(`${BUSCA_DE_CLIENTES}?${new URLSearchParams({ busca: comissionamento.cliente.nome })}`, "GET", undefined, controle.signal).then((r) => {
      const doCliente = r.ok ? r.dados.itens.find((x) => x.id === comissionamento.cliente.id) : undefined;
      if (doCliente) { setCliente(doCliente); if (doCliente.ucs.length === 1) setUcId(doCliente.ucs[0]!.id); }
    });
    return () => controle.abort();
  }, [comissionamento]);
  const limpar = (campo: string) => setErros((e) => ({ ...e, [campo]: undefined }));

  useEffect(() => {
    if (fixo || busca.trim().length < 2) { setEncontrados(null); return; }
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      const r = await enviar<BuscarClientesDaEngenhariaResposta>(`${BUSCA_DE_CLIENTES}?${new URLSearchParams({ busca: busca.trim() })}`, "GET", undefined, controle.signal);
      if (r.ok) setEncontrados(r.dados.itens);
    }, 250);
    return () => { clearTimeout(espera); controle.abort(); };
  }, [busca, fixo]);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const kwp = lerPotencia(potencia);
    const problemas: Record<string, string | undefined> = {
      empresa: empresa ? undefined : "escolha a empresa.",
      clienteId: cliente ? undefined : "escolha o cliente.",
      ucId: ucId ? undefined : "escolha a unidade consumidora.",
      nome: nome.trim() ? undefined : "dê um nome à usina.",
      plataformaId: plataformaId ? undefined : "escolha a plataforma.",
      potenciaKwp: kwp.problema ?? undefined,
      comissionadaEm: !comissionadaEm ? "informe a data (dd/mm/aaaa)." : comissionadaEm > hoje ? "a data não pode estar no futuro." : undefined,
      garantiaAte: garantiaAte && comissionadaEm && garantiaAte < comissionadaEm ? "a garantia não pode acabar antes do comissionamento." : undefined,
    };
    setErros(problemas);
    if (Object.values(problemas).some(Boolean)) return;
    const texto = (v: string) => v.trim() || null;
    const dados = { nome: nome.trim(), plataformaId, potenciaKwp: kwp.valor!, fabricante: texto(fabricante), modelo: texto(modelo), numeroSerie: texto(numeroSerie), comissionadaEm, garantiaAte: garantiaAte || null };
    setEnviando(true); setFalha(null);
    const r = usina
      ? await enviar<Usina>(`/api/engenharia/usinas/${usina.id}`, "PATCH", dados)
      : await enviar<Usina>("/api/engenharia/usinas", "POST", { empresa, clienteId: cliente!.id, ucId, ...dados, ...(comissionamento ? { ordemDeComissionamentoId: comissionamento.ordemId } : {}) });
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados); return; }
    setErros((e) => ({ ...e, ...r.erro.porCampo }));
    setFalha(r.erro.mensagem);
  }

  const ucs = cliente?.ucs ?? [];
  const ativas = plataformas.filter((p) => p.ativa || p.id === usina?.plataforma.id);
  return <Dialog title={editando ? `Editar ${usina!.nome}` : "Nova usina"} size="media" icon={editando ? <Pencil size={20} /> : <Sun size={20} />} onClose={aoCancelar}
    description={editando ? "Empresa, cliente e UC não mudam." : comissionamento ? "A usina nasce do comissionamento: cliente, UC e empresa vêm da O.S." : "Cliente e UC, potência, plataforma e inversor. Entra no monitoramento de hoje se a plataforma ainda não foi conferida; senão, no de amanhã."}
    footer={<Button type="submit" form="form-usina" icon={editando ? undefined : <Plus size={15} />} disabled={enviando}>{enviando ? "Salvando…" : editando ? "Salvar" : "Cadastrar usina"}</Button>}>
    <form id="form-usina" className={`ui-dialog-form ${styles.formDaOrdem}`} onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <CampoDeMenu label="Empresa" required icon={<Building2 />} placeholder="Selecione a empresa" value={empresa || undefined} onChange={(v) => { setEmpresa(v as CompanyKey); limpar("empresa"); }} disabled={fixo}
        options={companyKeys.map((e) => ({ value: e, label: ROTULO_DA_EMPRESA[e], icon: <PontoDaEmpresa empresa={e} /> }))} error={erros.empresa} />
      <TextField label="Nome da usina" required maxLength={120} value={nome} onChange={(e) => { setNome(e.target.value); limpar("nome"); }} error={erros.nome} placeholder="Ex.: Condomínio Solar das Águas · bloco B" />
      <div className={`ui-field ${styles.largo}`}>
        <label htmlFor="usina-busca-cliente">Cliente<span className="ui-required"> (obrigatório)</span></label>
        {cliente ? <div className={styles.escolhido}><UserRound size={15} aria-hidden="true" /><span>{cliente.nome}</span>
          {fixo ? null : <Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Trocar o cliente ${cliente.nome}`} onClick={() => { setCliente(null); setUcId(""); }} />}</div> : <>
          <div className="ui-input-wrap"><span className="ui-input-adornment" aria-hidden="true"><Search size={15} /></span>
            <input id="usina-busca-cliente" className="ui-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite ao menos 2 letras do nome" autoComplete="off"
              aria-invalid={erros.clienteId ? true : undefined} aria-describedby={erros.clienteId ? "usina-cliente-erro" : "usina-cliente-dica"} /></div>
          {encontrados ? (encontrados.length ? <ul className={styles.resultados} aria-label="Clientes encontrados">{encontrados.map((x) => <li key={x.id}>
            <button type="button" onClick={() => { setCliente(x); setUcId(x.ucs.length === 1 ? x.ucs[0]!.id : ""); setBusca(""); limpar("clienteId"); }}>{x.nome}<small>{x.ucs.length === 1 ? "1 UC" : `${x.ucs.length} UCs`}</small></button>
          </li>)}</ul> : <p className="ui-field-hint" role="status">Nenhum cliente com esse nome.</p>) : <p id="usina-cliente-dica" className="ui-field-hint">Busca nos clientes do CRM.</p>}
        </>}
        {erros.clienteId ? <p id="usina-cliente-erro" className="ui-field-error">Erro: {erros.clienteId}</p> : null}
      </div>
      <CampoDeMenu label="Unidade consumidora" required icon={<Zap />} placeholder={cliente ? (ucs.length ? "Escolha a UC" : comissionamento ? "A O.S. não tem UC" : "O cliente não tem UC no CRM") : "Escolha o cliente primeiro"} value={ucId || undefined}
        onChange={(v) => { setUcId(v); limpar("ucId"); }} disabled={editando || Boolean(comissionamento?.ucId) || !cliente || ucs.length === 0} error={erros.ucId}
        options={ucs.map((u) => ({ value: u.id, label: u.codigo, description: u.distribuidora, icon: <Zap /> }))}
        hint={comissionamento && !comissionamento.ucId ? (ucs.length ? "A O.S. de comissionamento não tinha UC: escolha a UC do cliente." : "Nem a O.S. nem o cliente têm UC no CRM: cadastre a UC no cliente antes.") : undefined} />
      <CampoDeMenu label="Plataforma" required icon={<Monitor />} placeholder="Selecione a plataforma" value={plataformaId || undefined} onChange={(v) => { setPlataformaId(v); limpar("plataformaId"); }} error={erros.plataformaId}
        options={ativas.map((p) => ({ value: p.id, label: p.nome, icon: <Monitor /> }))} />
      <TextField label="Potência (kWp)" required inputMode="decimal" maxLength={12} value={potencia} onChange={(e) => { setPotencia(e.target.value); limpar("potenciaKwp"); }} error={erros.potenciaKwp} placeholder="12,75" />
      <DatePicker label="Comissionada em" required max={hoje} value={comissionadaEm} onChange={(v) => { setComissionadaEm(v); limpar("comissionadaEm"); }} error={erros.comissionadaEm} hint="O dia do comissionamento ou da conexão." />
      <fieldset className={`${styles.largo} ${styles.grupoDoEquipamento}`}>
        <legend>Inversor <span className={styles.opcional}>(opcional)</span></legend>
        <TextField label="Fabricante" maxLength={120} value={fabricante} onChange={(e) => setFabricante(e.target.value)} placeholder="Ex.: Huawei" />
        <TextField label="Modelo" maxLength={120} value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex.: SUN2000-20KTL" />
        <TextField label="Número de série" maxLength={120} value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} />
        <DatePicker label="Garantia até" value={garantiaAte} onChange={(v) => { setGarantiaAte(v); limpar("garantiaAte"); }} error={erros.garantiaAte} />
      </fieldset>
    </form>
  </Dialog>;
}
