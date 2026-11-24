"use client";

import {
  rotulosDoDestinoDeCompra,
  type BuscarClientesDeCompraResposta,
  type CompanyKey,
  type DestinoDeCompra,
  type ObraDeCompra,
} from "@plugga/shared";
import { Search, X } from "lucide-react";
import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { enviar } from "../../lib/clientes";
import { COR_DA_EMPRESA, ROTULO_DA_EMPRESA } from "../../lib/compras";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { Button, Combobox, SelectField, type SelectOption } from "../ui";
import styles from "./compras.module.css";

/** Escolha única em botões do mesmo tamanho, na largura do campo (radiogroup com setas). */
export function Segmentado<T extends string>({ rotulo, opcoes, valor, aoMudar, obrigatorio, erro, id }: {
  rotulo: string; opcoes: readonly { valor: T; rotulo: ReactNode }[]; valor: T | null; aoMudar: (v: T) => void; obrigatorio?: boolean; erro?: string; id?: string;
}) {
  const gerado = useId(); const base = id ?? gerado;
  function teclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(evento.key)) return;
    evento.preventDefault();
    const i = Math.max(0, opcoes.findIndex((o) => o.valor === valor));
    const proximo = opcoes[(i + (evento.key === "ArrowLeft" || evento.key === "ArrowUp" ? opcoes.length - 1 : 1)) % opcoes.length]!;
    aoMudar(proximo.valor);
    evento.currentTarget.querySelector<HTMLButtonElement>(`[data-valor="${proximo.valor}"]`)?.focus();
  }
  return <div className="ui-field">
    <span className={styles.rotulo} id={`${base}-rotulo`}>{rotulo}{obrigatorio ? <span className="ui-required"> (obrigatório)</span> : null}</span>
    <div className={`${estilosLista.segmentado} ${styles.segmentado}`} role="radiogroup" aria-labelledby={`${base}-rotulo`} aria-invalid={erro ? true : undefined}
      aria-describedby={erro ? `${base}-erro` : undefined} style={{ "--opcoes": opcoes.length } as CSSProperties} onKeyDown={teclar} id={base}>
      {opcoes.map((o, i) => <button key={o.valor} type="button" role="radio" data-valor={o.valor} aria-checked={valor === o.valor}
        tabIndex={valor === o.valor || (valor === null && i === 0) ? 0 : -1} onClick={() => aoMudar(o.valor)}>{o.rotulo}</button>)}
    </div>
    {erro ? <p id={`${base}-erro`} className="ui-field-error">Erro: {erro}</p> : null}
  </div>;
}

const SEM_VALOR = "-";

/** Seletor do app; com mais de 8 opções vira combobox com busca (regra aprovada no protótipo). `semValor` acrescenta a opção vazia. */
export function CampoDeEscolha({ label, opcoes, valor, aoMudar, semValor, placeholder, required, disabled, erro, dica }: {
  label: string; opcoes: SelectOption[]; valor: string; aoMudar: (v: string) => void; semValor?: string; placeholder?: string;
  required?: boolean; disabled?: boolean; erro?: string; dica?: string;
}) {
  const todas = semValor ? [{ value: SEM_VALOR, label: semValor }, ...opcoes] : opcoes;
  const mudar = (v: string) => aoMudar(v === SEM_VALOR ? "" : v);
  const atual = valor || (semValor ? SEM_VALOR : "");
  if (opcoes.length > 8) return <Combobox label={required ? `${label} (obrigatório)` : label} options={todas} value={atual} onChange={mudar} disabled={disabled} error={erro} hint={dica} />;
  return <SelectField label={label} required={required} value={atual} onChange={mudar} placeholder={placeholder} options={todas} disabled={disabled} error={erro} hint={dica} />;
}

export const opcoesDeEmpresa =(["plugga", "waze"] as const).map((e) => ({
  valor: e,
  rotulo: <><span className={styles.empresaPonto} style={{ background: COR_DA_EMPRESA[e] }} aria-hidden="true" />{ROTULO_DA_EMPRESA[e]}</>,
}));

export type DestinoEscolhido = { destino: DestinoDeCompra; obraId: string | null; clientId: string | null; cliente: { id: string; nome: string } | null };

/**
 * Destino do pedido: uma obra do cadastro de Obras da mesma empresa (PLU-355: o Compras só escolhe;
 * a obra nasce na tela de Obras), cliente por busca, ou uso interno.
 */
export function DestinoDoPedido({ empresa, obras, valor, aoMudar, erros }: {
  empresa: CompanyKey | null;
  obras: ObraDeCompra[];
  valor: DestinoEscolhido;
  aoMudar: (d: DestinoEscolhido) => void;
  erros: Record<string, string | undefined>;
}) {
  const [busca, setBusca] = useState("");
  const [clientes, setClientes] = useState<BuscarClientesDeCompraResposta["itens"] | null>(null);
  const daEmpresa = obras.filter((o) => !empresa || o.empresa === empresa);

  useEffect(() => {
    if (valor.destino !== "cliente" || busca.trim().length < 2) { setClientes(null); return; }
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      const r = await enviar<BuscarClientesDeCompraResposta>(`/api/suprimentos/compras/clientes?${new URLSearchParams({ busca: busca.trim() })}`, "GET", undefined, controle.signal);
      if (r.ok) setClientes(r.dados.itens);
    }, 250);
    return () => { clearTimeout(espera); controle.abort(); };
  }, [busca, valor.destino]);

  return <>
    <Segmentado rotulo="Tipo de destino" valor={valor.destino} aoMudar={(destino) => aoMudar({ destino, obraId: null, clientId: null, cliente: null })}
      opcoes={(["obra", "cliente", "interno"] as const).map((d) => ({ valor: d, rotulo: rotulosDoDestinoDeCompra[d] }))} />
    {valor.destino === "obra" ? <>
      <CampoDeEscolha label="Obra" required valor={valor.obraId ?? ""} aoMudar={(obraId) => aoMudar({ ...valor, obraId: obraId || null })} erro={erros.obraId}
        placeholder={empresa ? (daEmpresa.length ? "Selecione a obra" : "Nenhuma obra desta empresa") : "Escolha a empresa primeiro"}
        opcoes={daEmpresa.map((o) => ({ value: o.id, label: o.nome, description: o.cliente?.nome }))} disabled={!empresa}
        dica="Sem a obra na lista? Ela é cadastrada na tela de Obras da Engenharia." />
    </> : null}
    {valor.destino === "cliente" ? <div className="ui-field">
      <label htmlFor="busca-cliente">Cliente<span className="ui-required"> (obrigatório)</span></label>
      {valor.cliente ? <div className={styles.escolhido}><span>{valor.cliente.nome}</span><Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Trocar o cliente ${valor.cliente.nome}`} onClick={() => aoMudar({ ...valor, clientId: null, cliente: null })} /></div> : <>
        <div className="ui-input-wrap"><span className="ui-input-adornment" aria-hidden="true"><Search size={15} /></span>
          <input id="busca-cliente" className="ui-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite ao menos 2 letras do nome" autoComplete="off" aria-invalid={erros.clientId ? true : undefined} aria-describedby={erros.clientId ? "busca-cliente-erro" : "busca-cliente-dica"} /></div>
        {clientes ? (clientes.length ? <ul className={styles.resultados} aria-label="Clientes encontrados">{clientes.map((c) => <li key={c.id}><button type="button" onClick={() => { aoMudar({ ...valor, clientId: c.id, cliente: c }); setBusca(""); }}>{c.nome}</button></li>)}</ul>
          : <p className="ui-field-hint" role="status">Nenhum cliente ativo com esse nome.</p>) : <p id="busca-cliente-dica" className="ui-field-hint">Busca nos clientes ativos do CRM.</p>}
      </>}
      {erros.clientId ? <p id="busca-cliente-erro" className="ui-field-error">Erro: {erros.clientId}</p> : null}
    </div> : null}
  </>;
}

