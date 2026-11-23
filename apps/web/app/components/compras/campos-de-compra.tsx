"use client";

import {
  rotulosDoDestinoDeCompra,
  type BuscarClientesDeCompraResposta,
  type CompanyKey,
  type DestinoDeCompra,
  type ObraDeCompra,
} from "@plugga/shared";
import { Trigger } from "@radix-ui/react-select";
import { Building2, ChevronDown, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { enviar } from "../../lib/clientes";
import { COR_DA_EMPRESA, ROTULO_DA_EMPRESA } from "../../lib/compras";
import estilosFiltro from "../clientes/filtro-de-clientes.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { Button, Combobox, SelectField, type SelectOption } from "../ui";
import { Select, SelectContent, SelectItem } from "../ui/shadcn/select";
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

/** Destino do pedido: obra da mesma empresa (ou nova, criada na hora), cliente por busca, ou uso interno. */
export function DestinoDoPedido({ empresa, obras, valor, aoMudar, erros, aoCriarObra }: {
  empresa: CompanyKey | null;
  obras: ObraDeCompra[];
  valor: DestinoEscolhido;
  aoMudar: (d: DestinoEscolhido) => void;
  erros: Record<string, string | undefined>;
  aoCriarObra: (obra: ObraDeCompra) => void;
}) {
  const [busca, setBusca] = useState("");
  const [clientes, setClientes] = useState<BuscarClientesDeCompraResposta["itens"] | null>(null);
  const [novaObra, setNovaObra] = useState<string | null>(null);
  const [erroObra, setErroObra] = useState<string | null>(null);
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

  async function criarObra() {
    const nome = novaObra?.trim();
    if (!empresa) { setErroObra("escolha a empresa do pedido antes de criar a obra."); return; }
    if (!nome) { setErroObra("informe o nome da obra."); return; }
    const r = await enviar<ObraDeCompra>("/api/suprimentos/compras/obras", "POST", { empresa, nome });
    if (!r.ok) { setErroObra(r.erro.porCampo.nome ?? r.erro.mensagem); return; }
    aoCriarObra(r.dados); aoMudar({ ...valor, obraId: r.dados.id }); setNovaObra(null); setErroObra(null);
  }

  return <>
    <Segmentado rotulo="Tipo de destino" valor={valor.destino} aoMudar={(destino) => aoMudar({ destino, obraId: null, clientId: null, cliente: null })}
      opcoes={(["obra", "cliente", "interno"] as const).map((d) => ({ valor: d, rotulo: rotulosDoDestinoDeCompra[d] }))} />
    {valor.destino === "obra" ? <>
      <CampoDeEscolha label="Obra" required valor={valor.obraId ?? ""} aoMudar={(obraId) => aoMudar({ ...valor, obraId: obraId || null })} erro={erros.obraId}
        placeholder={empresa ? (daEmpresa.length ? "Selecione a obra" : "Nenhuma obra desta empresa") : "Escolha a empresa primeiro"}
        opcoes={daEmpresa.map((o) => ({ value: o.id, label: o.nome, description: o.cliente?.nome }))} disabled={!empresa} />
      {novaObra === null
        ? <Button variant="secondary" size="sm" className={styles.adicionar} icon={<Plus size={14} />} onClick={() => setNovaObra("")} disabled={!empresa}>Nova obra</Button>
        : <div className={styles.novaObra}>
          <div className="ui-field"><label htmlFor="nova-obra">Nome da nova obra</label><div className="ui-input-wrap"><input id="nova-obra" className="ui-input" maxLength={200} value={novaObra} onChange={(e) => setNovaObra(e.target.value)} aria-invalid={erroObra ? true : undefined} aria-describedby={erroObra ? "nova-obra-erro" : undefined} /></div>{erroObra ? <p id="nova-obra-erro" className="ui-field-error">Erro: {erroObra}</p> : null}</div>
          <div className={styles.topoDireita}><Button size="sm" onClick={criarObra}>Criar obra</Button><Button variant="secondary" size="sm" onClick={() => { setNovaObra(null); setErroObra(null); }}>Cancelar</Button></div>
        </div>}
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

/** Filtro de Empresa do quadro e da lista: o gatilho e o painel do FiltroDeClientes, com o ponto da empresa em cada opção. */
export function FiltroDeEmpresa({ valor, aoMudar }: { valor: CompanyKey | undefined; aoMudar: (v: CompanyKey | undefined) => void }) {
  const atual = valor ?? "todas";
  const opcoes = [{ valor: "todas", rotulo: "Todas as empresas" }, ...(["plugga", "waze"] as const).map((e) => ({ valor: e, rotulo: ROTULO_DA_EMPRESA[e] }))];
  const icone = (v: string) => (v === "todas" ? <Building2 size={16} /> : <span className={`${styles.empresaPonto} ${styles.pontoDoFiltro}`} style={{ background: COR_DA_EMPRESA[v as CompanyKey] }} />);
  return <Select value={atual} onValueChange={(v) => aoMudar(v === "todas" ? undefined : (v as CompanyKey))}>
    <Trigger className={`${estilosPipelines.seletorTrigger} ${estilosFiltro.trigger}`} aria-label="Empresa">
      <span className={estilosFiltro.icone} aria-hidden="true">{icone(atual)}</span>
      <span className={`${estilosPipelines.seletorLabel} ${estilosFiltro.label}`}>{opcoes.find((o) => o.valor === atual)?.rotulo}</span>
      <ChevronDown size={15} className={estilosPipelines.seletorChevron} aria-hidden="true" />
    </Trigger>
    <SelectContent className={`${estilosPipelines.popoverFunis} ${estilosFiltro.menu} ${styles.menuEmpresa}`} align="end" aria-label="Empresa">
      {opcoes.map((o) => <SelectItem key={o.valor} value={o.valor} textValue={o.rotulo} className={`${estilosPipelines.popoverItem} ${o.valor === atual ? estilosPipelines.popoverItemAtivo : ""} ${estilosFiltro.opcao}`}>
        <span className={styles.opcaoComIcone}><span className={estilosFiltro.icone} aria-hidden="true">{icone(o.valor)}</span>{o.rotulo}</span>
      </SelectItem>)}
    </SelectContent>
  </Select>;
}
