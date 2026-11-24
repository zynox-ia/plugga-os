"use client";

import {
  companyKeys,
  type ClientesParaProtocoloResposta,
  type CompanyKey,
  type DepartamentoDoProtocolo,
  type EditarProtocolo,
  type OpcoesDosProtocolosResposta,
  type Protocolo,
  type TipoDeProtocolo,
} from "@plugga/shared";
import { Building2, FileCheck, Landmark, Layers, Pencil, Plus, Search, UserRound, X, Zap } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { enviar } from "../../lib/clientes";
import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import {
  problemasDoNovoProtocolo,
  ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO,
  ROTULO_DO_TIPO_DE_PROTOCOLO,
  somarDias,
  type NovoProtocolo,
  type ProblemasDoProtocolo,
} from "../../lib/protocolos";
import { rotuloDaUc } from "../../lib/usinas";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, TextareaField, TextField } from "../ui";
import styles from "./ficha-da-ordem.module.css";

type Cliente = ClientesParaProtocoloResposta["itens"][number];
const BUSCA_DE_CLIENTES = "/api/protocolos/clientes";
const normal = (texto: string) => texto.trim().toLocaleLowerCase("pt-BR");

/**
 * Novo protocolo e Editar (PLU-348). Empresa, departamento, cliente, UC e abertura
 * não mudam depois; a edição manda só o que mudou. Nada no passado: a abertura não
 * vai ao futuro, a data-limite e a primeira verificação não ficam antes de hoje.
 */
export function ProtocoloForm({ protocolo, opcoes, hoje, empresaInicial, departamentoInicial, aoCancelar, aoSalvar }: {
  protocolo?: Protocolo;
  opcoes: OpcoesDosProtocolosResposta;
  hoje: string;
  empresaInicial?: CompanyKey;
  departamentoInicial?: DepartamentoDoProtocolo;
  aoCancelar: () => void;
  aoSalvar: (p: Protocolo) => void;
}) {
  const editando = Boolean(protocolo);
  const departamentos = opcoes.departamentos;
  const [form, setForm] = useState<NovoProtocolo>(() => ({
    empresa: protocolo?.empresa ?? empresaInicial ?? "",
    departamento: protocolo?.departamento ?? (departamentoInicial && departamentos.includes(departamentoInicial) ? departamentoInicial : departamentos.length === 1 ? departamentos[0]! : ""),
    tipo: protocolo?.tipo ?? "",
    clienteId: protocolo?.cliente.id ?? "",
    ucId: protocolo?.uc.id ?? "",
    distribuidoraId: protocolo?.distribuidora.id ?? "",
    numero: protocolo?.numero ?? "",
    abertoEm: protocolo?.abertoEm ?? hoje,
    dataLimite: protocolo?.dataLimite ?? "",
    proximaVerificacao: protocolo ? "" : somarDias(hoje, 3),
    observacao: protocolo?.observacao ?? "",
  }));
  const [cliente, setCliente] = useState<Cliente | null>(protocolo ? { id: protocolo.cliente.id, nome: protocolo.cliente.nome, ucs: [{ id: protocolo.uc.id, codigo: protocolo.uc.codigo, distribuidora: protocolo.distribuidora.nome }] } : null);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<Cliente[] | null>(null);
  const [erros, setErros] = useState<ProblemasDoProtocolo>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (parcial: Partial<NovoProtocolo>) => {
    setForm((f) => ({ ...f, ...parcial }));
    setErros((e) => { const n = { ...e }; for (const k of Object.keys(parcial)) delete n[k as keyof NovoProtocolo]; return n; });
  };

  useEffect(() => {
    if (editando || busca.trim().length < 2) { setEncontrados(null); return; }
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      const r = await enviar<ClientesParaProtocoloResposta>(`${BUSCA_DE_CLIENTES}?${new URLSearchParams({ busca: busca.trim() })}`, "GET", undefined, controle.signal);
      if (r.ok) setEncontrados(r.dados.itens);
    }, 250);
    return () => { clearTimeout(espera); controle.abort(); };
  }, [busca, editando]);

  /** A UC traz o nome da distribuidora: sugere a do catálogo com o mesmo nome. */
  function escolherUc(ucId: string, doCliente: Cliente | null = cliente) {
    const uc = doCliente?.ucs.find((u) => u.id === ucId);
    const sugerida = uc ? opcoes.distribuidoras.find((d) => d.ativa && (normal(d.nome) === normal(uc.distribuidora) || (d.sigla && normal(d.sigla) === normal(uc.distribuidora)))) : undefined;
    mudar({ ucId, ...(sugerida && !form.distribuidoraId ? { distribuidoraId: sugerida.id } : {}) });
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const problemas = editando
      ? Object.fromEntries(Object.entries(problemasDoNovoProtocolo(form, hoje)).filter(([k]) => ["tipo", "distribuidoraId", "numero", "dataLimite"].includes(k)
        // A data-limite já vencida pode ficar como está; só a nova não vai ao passado.
        && !(k === "dataLimite" && form.dataLimite === protocolo!.dataLimite))) as ProblemasDoProtocolo
      : problemasDoNovoProtocolo(form, hoje);
    setErros(problemas);
    if (Object.values(problemas).some(Boolean)) return;
    setEnviando(true); setFalha(null);
    const observacao = form.observacao.trim() || null;
    let r;
    if (protocolo) {
      const mudou: EditarProtocolo = {
        ...(form.tipo !== protocolo.tipo ? { tipo: form.tipo as TipoDeProtocolo } : {}),
        ...(form.numero.trim() !== protocolo.numero ? { numero: form.numero.trim() } : {}),
        ...(form.distribuidoraId !== protocolo.distribuidora.id ? { distribuidoraId: form.distribuidoraId } : {}),
        ...(form.dataLimite !== protocolo.dataLimite ? { dataLimite: form.dataLimite } : {}),
        ...(observacao !== (protocolo.observacao ?? null) ? { observacao } : {}),
      };
      if (Object.keys(mudou).length === 0) { setEnviando(false); aoCancelar(); return; }
      r = await enviar<Protocolo>(`/api/protocolos/${protocolo.id}`, "PATCH", mudou);
    } else {
      r = await enviar<Protocolo>("/api/protocolos", "POST", {
        empresa: form.empresa, departamento: form.departamento, clienteId: form.clienteId, ucId: form.ucId, distribuidoraId: form.distribuidoraId,
        tipo: form.tipo, numero: form.numero.trim(), abertoEm: form.abertoEm, dataLimite: form.dataLimite, proximaVerificacao: form.proximaVerificacao || null, observacao,
      });
    }
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados); return; }
    setErros((e) => ({ ...e, ...r.erro.porCampo }));
    setFalha(r.erro.mensagem);
  }

  const ucs = cliente?.ucs ?? [];
  const distribuidoras = opcoes.distribuidoras.filter((d) => d.ativa || d.id === protocolo?.distribuidora.id);
  return <Dialog title={editando ? `Editar o protocolo ${protocolo!.numero}` : "Novo protocolo"} size="media" icon={editando ? <Pencil size={20} /> : <FileCheck size={20} />} onClose={aoCancelar}
    description={editando ? "Empresa, departamento, cliente, UC e abertura não mudam." : "Registre o número que a distribuidora deu. O lembrete de verificação substitui a tarefa recorrente."}
    footer={<Button type="submit" form="form-protocolo" icon={editando ? undefined : <Plus size={15} />} disabled={enviando}>{enviando ? "Salvando…" : editando ? "Salvar" : "Registrar protocolo"}</Button>}>
    <form id="form-protocolo" className={`ui-dialog-form ${styles.formDaOrdem}`} onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <CampoDeMenu label="Empresa" required icon={<Building2 />} placeholder="Selecione a empresa" value={form.empresa || undefined} onChange={(v) => mudar({ empresa: v as CompanyKey })} disabled={editando}
        options={companyKeys.map((e) => ({ value: e, label: ROTULO_DA_EMPRESA[e], icon: <PontoDaEmpresa empresa={e} /> }))} error={erros.empresa} />
      {departamentos.length > 1 || editando ? <CampoDeMenu label="Departamento" required icon={<Layers />} placeholder="Selecione o departamento" value={form.departamento || undefined}
        onChange={(v) => mudar({ departamento: v as DepartamentoDoProtocolo })} disabled={editando}
        options={(editando ? [protocolo!.departamento] : departamentos).map((d) => ({ value: d, label: ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO[d], icon: <Layers /> }))} error={erros.departamento} /> : null}
      <div className={`ui-field ${styles.largo}`}>
        <label htmlFor="protocolo-busca-cliente">Cliente<span className="ui-required"> (obrigatório)</span></label>
        {cliente ? <div className={styles.escolhido}><UserRound size={15} aria-hidden="true" /><span>{cliente.nome}</span>
          {editando ? null : <Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Trocar o cliente ${cliente.nome}`} onClick={() => { setCliente(null); mudar({ clienteId: "", ucId: "" }); }} />}</div> : <>
          <div className="ui-input-wrap"><span className="ui-input-adornment" aria-hidden="true"><Search size={15} /></span>
            <input id="protocolo-busca-cliente" className="ui-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite ao menos 2 letras do nome" autoComplete="off"
              aria-invalid={erros.clienteId ? true : undefined} aria-describedby={erros.clienteId ? "protocolo-cliente-erro" : "protocolo-cliente-dica"} /></div>
          {encontrados ? (encontrados.length ? <ul className={styles.resultados} aria-label="Clientes encontrados">{encontrados.map((x) => <li key={x.id}>
            <button type="button" onClick={() => { setCliente(x); setBusca(""); mudar({ clienteId: x.id, ucId: "" }); if (x.ucs.length === 1) escolherUc(x.ucs[0]!.id, x); }}>{x.nome}<small>{x.ucs.length === 1 ? "1 UC" : `${x.ucs.length} UCs`}</small></button>
          </li>)}</ul> : <p className="ui-field-hint" role="status">Nenhum cliente com esse nome.</p>) : <p id="protocolo-cliente-dica" className="ui-field-hint">Busca nos clientes do CRM.</p>}
        </>}
        {erros.clienteId ? <p id="protocolo-cliente-erro" className="ui-field-error">Erro: {erros.clienteId}</p> : null}
      </div>
      <CampoDeMenu label="Unidade consumidora" required icon={<Zap />} placeholder={cliente ? (ucs.length ? "Escolha a UC" : "O cliente não tem UC no CRM") : "Escolha o cliente primeiro"} value={form.ucId || undefined}
        onChange={(v) => escolherUc(v)} disabled={editando || !cliente || ucs.length === 0} error={erros.ucId}
        options={ucs.map((u) => ({ value: u.id, label: rotuloDaUc(u.codigo), description: u.distribuidora, icon: <Zap /> }))} />
      <CampoDeMenu label="Distribuidora" required icon={<Landmark />} placeholder={distribuidoras.length ? "Selecione a distribuidora" : "Nenhuma distribuidora no catálogo"} value={form.distribuidoraId || undefined}
        onChange={(v) => mudar({ distribuidoraId: v })} disabled={distribuidoras.length === 0} error={erros.distribuidoraId}
        hint={distribuidoras.length ? undefined : "O gerente cadastra as distribuidoras nas Configurações da Engenharia."}
        options={distribuidoras.map((d) => ({ value: d.id, label: d.nome, description: [d.sigla, d.uf].filter(Boolean).join(" · ") || undefined, icon: <Landmark /> }))} />
      <CampoDeMenu label="Tipo" required icon={<FileCheck />} placeholder="Selecione o tipo" value={form.tipo || undefined} onChange={(v) => mudar({ tipo: v as TipoDeProtocolo })}
        options={opcoes.tipos.map((t) => ({ value: t, label: ROTULO_DO_TIPO_DE_PROTOCOLO[t], icon: <FileCheck /> }))} error={erros.tipo} />
      <TextField label="Número do protocolo" required maxLength={60} value={form.numero} onChange={(e) => mudar({ numero: e.target.value })} error={erros.numero} placeholder="Ex.: 2026.11.000000" />
      {editando ? null : <DatePicker label="Aberto em" required max={hoje} value={form.abertoEm} onChange={(v) => mudar({ abertoEm: v })} error={erros.abertoEm} hint="O dia em que a distribuidora registrou o pedido." />}
      <DatePicker label="Data-limite" required min={hoje} value={form.dataLimite} onChange={(v) => mudar({ dataLimite: v })} error={erros.dataLimite} hint="O prazo da distribuidora para responder." />
      {editando ? null : <DatePicker label="Primeira verificação" min={hoje} value={form.proximaVerificacao} onChange={(v) => mudar({ proximaVerificacao: v })} error={erros.proximaVerificacao}
        hint="Vira o lembrete de verificar. Sem ela, vale a data-limite." />}
      <div className={styles.largo}><TextareaField label="Observação" maxLength={2000} rows={2} value={form.observacao} onChange={(e) => mudar({ observacao: e.target.value })} placeholder="Opcional" /></div>
    </form>
  </Dialog>;
}
