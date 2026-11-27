"use client";

import { CheckIcon, ChevronDown, SearchIcon } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";

import { agruparOpcoes } from "../../lib/agrupar-opcoes";
import estilosFiltro from "../clientes/filtro-de-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import estilosGrupo from "./menu-com-busca.module.css";
import styles from "./suprimentos.module.css";

/**
 * Menus suspensos de Suprimentos que o `SelectField` do design system ainda não
 * cobre: opção rica (nome, linha secundária e um valor à direita com tom) e
 * busca quando a lista passa de 8 opções. O painel segue o dropdown do app
 * (`ui-select-content`/`ui-select-item`) e fica sempre dentro da janela.
 */

export type TomDaOpcao = "ok" | "baixo" | "zero";
export type OpcaoDoMenu = {
  value: string;
  label: string;
  /** Linha secundária, abaixo do nome (ex.: "MO-0007 · Material de obra"). */
  description?: string;
  icon?: ReactElement;
  /** Valor à direita (ex.: o disponível "24 un"). */
  aside?: string;
  tone?: TomDaOpcao;
  disabled?: boolean;
  /**
   * Rótulo do grupo da opção (ex.: "A pagar"). Opções seguidas com o mesmo grupo
   * ficam juntas sob o rótulo; sem grupo, a lista é plana, como antes.
   */
  grupo?: string;
};

/** Acima disto a lista ganha o campo de busca. */
export const LIMITE_SEM_BUSCA = 8;

const normalizar = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();

function ListaDoMenu({ id, rotulo, opcoes, valor, aoEscolher, aoFechar, variante, iconePadrao, sempreComBusca, dicaDaBusca = "Buscar…" }: {
  id: string; rotulo: string; opcoes: readonly OpcaoDoMenu[]; valor: string | undefined;
  aoEscolher: (v: string) => void; aoFechar: () => void; variante: "campo" | "filtro";
  /** Ícone das opções que não trazem o seu (o do gatilho): toda opção tem ícone antes do rótulo, como no SelectField. */
  iconePadrao?: ReactElement;
  sempreComBusca?: boolean; dicaDaBusca?: string;
}) {
  const [busca, setBusca] = useState("");
  const lista = useRef<HTMLDivElement>(null);
  const comBusca = opcoes.length > (sempreComBusca ? 0 : LIMITE_SEM_BUSCA);
  const visiveis = useMemo(() => {
    const q = normalizar(busca);
    return q ? opcoes.filter((o) => normalizar(`${o.label} ${o.description ?? ""}`).includes(q)) : opcoes;
  }, [busca, opcoes]);
  const rica = opcoes.some((o) => o.description || o.aside);

  const itens = () => Array.from(lista.current?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? []);
  function focar(indice: number) {
    const todos = itens();
    const alvo = todos[Math.max(0, Math.min(indice, todos.length - 1))];
    alvo?.focus(); alvo?.scrollIntoView({ block: "nearest" });
  }
  function teclar(evento: KeyboardEvent<HTMLDivElement>) {
    const todos = itens();
    const atual = todos.indexOf(document.activeElement as HTMLElement);
    if (evento.key === "ArrowDown") { evento.preventDefault(); focar(atual + 1); }
    else if (evento.key === "ArrowUp") { evento.preventDefault(); if (atual <= 0 && comBusca) lista.current?.parentElement?.querySelector<HTMLInputElement>("input")?.focus(); else focar(atual - 1); }
    else if (evento.key === "Home" || evento.key === "End") { evento.preventDefault(); focar(evento.key === "Home" ? 0 : todos.length - 1); }
    else if (evento.key === "Enter" || evento.key === " ") { const v = (document.activeElement as HTMLElement | null)?.dataset.valor; if (v !== undefined) { evento.preventDefault(); aoEscolher(v); } }
    else if (evento.key === "Tab") aoFechar();
  }

  const classeItem = variante === "filtro" ? `ui-select-item ${estilosPipelines.popoverItem} ${estilosFiltro.opcao}` : "ui-select-item";
  const opcao = (o: OpcaoDoMenu) => {
    const marcado = o.value === valor;
    return <div key={o.value} role="option" tabIndex={-1} data-valor={o.value} aria-selected={marcado} aria-disabled={o.disabled || undefined}
      data-state={marcado ? "checked" : "unchecked"}
      className={`${classeItem} ${rica ? styles.opcaoRica : ""} ${variante === "filtro" && marcado ? estilosPipelines.popoverItemAtivo : ""}`}
      onMouseMove={(e) => { if (document.activeElement !== e.currentTarget && !o.disabled) e.currentTarget.focus({ preventScroll: true }); }}
      onClick={() => { if (!o.disabled) aoEscolher(o.value); }}>
      <span className="ui-option-label">
        <span className="ui-option-icon" aria-hidden="true">{o.icon ?? iconePadrao}</span>
        {rica ? <span className={styles.opcaoTextos}><span className={styles.opcaoNome}>{o.label}</span>{o.description ? <small>{o.description}</small> : null}</span> : <span>{o.label}</span>}
      </span>
      {o.aside ? <span className={`${styles.opcaoValor} ${o.tone ? styles[`opcaoValor_${o.tone}`] : ""}`}>{o.aside}</span> : null}
      <span className="ui-select-indicator">{marcado ? <CheckIcon size={16} aria-hidden="true" /> : null}</span>
    </div>;
  };
  return <>
    {comBusca ? <div className={styles.menuBusca}>
      <SearchIcon size={15} aria-hidden="true" />
      <input type="search" autoFocus aria-label={`Buscar em ${rotulo}`} aria-controls={`${id}-lista`} placeholder={dicaDaBusca} autoComplete="off" value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); focar(0); }
          else if (e.key === "Enter") { e.preventDefault(); const primeira = visiveis.find((o) => !o.disabled); if (primeira) aoEscolher(primeira.value); }
        }} />
    </div> : null}
    <div ref={lista} id={`${id}-lista`} role="listbox" aria-label={rotulo} className={`ui-select-viewport ${styles.menuLista}`} onKeyDown={teclar}>
      {/* Com a busca filtrando, o grupo que fica sem opção some junto com o rótulo. */}
      {agruparOpcoes(visiveis).map(({ grupo, opcoes: doGrupo }, indice) => grupo === undefined
        ? doGrupo.map(opcao)
        : <div key={`grupo-${grupo}-${indice}`} role="group" aria-label={grupo} className={estilosGrupo.grupo}>
          <div className={estilosGrupo.grupoRotulo} aria-hidden="true">{grupo}</div>
          {doGrupo.map(opcao)}
        </div>)}
      {visiveis.length === 0 ? <p className="ui-popover-empty" role="status">{opcoes.length ? "Nenhuma opção encontrada." : "Nenhuma opção disponível."}</p> : null}
    </div>
  </>;
}

/** Ao abrir, o foco vai para a busca (se houver) ou para a opção marcada. */
function focarAoAbrir(evento: Event, valor: string | undefined) {
  evento.preventDefault();
  const painel = evento.currentTarget as HTMLElement;
  requestAnimationFrame(() => {
    const busca = painel.querySelector<HTMLInputElement>("input[type=search]");
    if (busca) { busca.focus(); return; }
    const alvo = painel.querySelector<HTMLElement>(`[role="option"][data-valor="${CSS.escape(valor ?? "")}"]`) ?? painel.querySelector<HTMLElement>('[role="option"]:not([aria-disabled="true"])');
    alvo?.focus(); alvo?.scrollIntoView({ block: "nearest" });
  });
}

/** Campo de formulário com menu suspenso: rótulo, gatilho com ícone, ajuda e erro (como o `SelectField`). */
export function CampoDeMenu({ label, options, value, onChange, placeholder = "Selecione uma opção", icon, required, disabled, hint, error, id, sempreComBusca, dicaDaBusca }: {
  label: string; options: readonly OpcaoDoMenu[]; value: string | undefined; onChange: (v: string) => void;
  placeholder?: string; icon?: ReactElement; required?: boolean; disabled?: boolean; hint?: ReactNode; error?: string; id?: string;
  /** Busca com qualquer número de opções (ex.: achar a obra pelo cliente), não só acima do limite. */
  sempreComBusca?: boolean; dicaDaBusca?: string;
}) {
  const gerado = useId(); const campo = id ?? gerado;
  const [aberto, setAberto] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const atual = options.find((o) => o.value === value);
  const rica = options.some((o) => o.aside);
  const escolher = (v: string) => { onChange(v); setAberto(false); gatilho.current?.focus(); };

  return <div className="ui-field">
    <label id={`${campo}-rotulo`} htmlFor={campo}>{label}{required ? <span className="ui-required"> (obrigatório)</span> : null}</label>
    <Popover open={aberto && !disabled} onOpenChange={(abrir) => { if (abrir) setContainer(gatilho.current?.closest("dialog") ?? null); setAberto(abrir); }}>
      <PopoverTrigger asChild>
        <button ref={gatilho} id={campo} type="button" className={`ui-input ui-field-trigger ${styles.gatilhoCampo}`} disabled={disabled}
          role="combobox" aria-haspopup="listbox" aria-expanded={aberto} aria-controls={aberto ? `${campo}-lista` : undefined}
          aria-labelledby={`${campo}-rotulo ${campo}`} aria-invalid={error ? true : undefined} aria-describedby={hint || error ? `${campo}-ajuda` : undefined}
          data-placeholder={atual ? undefined : ""} data-state={aberto ? "open" : "closed"}
          onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setContainer(gatilho.current?.closest("dialog") ?? null); setAberto(true); } }}>
          <span className="ui-option-label"><span className="ui-option-icon" aria-hidden="true">{atual?.icon ?? icon}</span><span>{atual?.label ?? placeholder}</span></span>
          <ChevronDown size={16} aria-hidden="true" className={styles.seta} />
        </button>
      </PopoverTrigger>
      <PopoverContent container={container} align="start" sideOffset={6} className={`ui-select-content ${styles.painel} ${rica ? styles.painelRico : ""}`}
        onOpenAutoFocus={(e) => focarAoAbrir(e, value)} onCloseAutoFocus={(e) => { e.preventDefault(); gatilho.current?.focus(); }}>
        <ListaDoMenu id={campo} rotulo={label} opcoes={options} valor={value} aoEscolher={escolher} aoFechar={() => setAberto(false)} variante="campo" iconePadrao={icon} sempreComBusca={sempreComBusca} dicaDaBusca={dicaDaBusca} />
      </PopoverContent>
    </Popover>
    {hint || error ? <p id={`${campo}-ajuda`} className={error ? "ui-field-error" : "ui-field-hint"}>{error ? `Erro: ${error}` : hint}</p> : null}
  </div>;
}

/**
 * Filtro da barra de navegação com busca: o mesmo gatilho e o mesmo painel do
 * `FiltroDeClientes`; a lista ganha busca quando passa de 8 opções (ex.: Item).
 */
export function FiltroComBusca({ label, options, value, onChange, icon, semFiltro }: {
  label: string; options: readonly OpcaoDoMenu[]; value: string; onChange: (v: string) => void; icon: ReactElement;
  /** Valor que significa "sem filtro": aí o gatilho mostra só o rótulo ("Empresa"), como no protótipo. */
  semFiltro?: string;
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const atual = options.find((o) => o.value === value);
  const texto = !atual || value === semFiltro ? label : atual.label;
  // Dentro de um <dialog> (a folha de filtros), o painel abre no próprio diálogo, na camada de cima.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return <Popover open={aberto} onOpenChange={(abrir) => { if (abrir) setContainer(gatilho.current?.closest("dialog") ?? null); setAberto(abrir); }}>
    <PopoverTrigger asChild>
      <button ref={gatilho} type="button" className={`${estilosPipelines.seletorTrigger} ${estilosFiltro.trigger}`} aria-label={`${label}: ${atual?.label ?? ""}`} data-filtrado={texto !== label || undefined}
        aria-haspopup="listbox" aria-expanded={aberto} aria-controls={aberto ? `${id}-lista` : undefined}>
        <span className={estilosFiltro.icone} aria-hidden="true">{texto !== label ? atual?.icon ?? icon : icon}</span>
        <span className={`${estilosPipelines.seletorLabel} ${estilosFiltro.label}`}>{texto}</span>
        <ChevronDown size={15} className={estilosPipelines.seletorChevron} aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent container={container} align="end" sideOffset={6} className={`ui-select-content ${estilosPipelines.popoverFunis} ${estilosFiltro.menu} ${styles.painel} ${styles.painelFiltro}`}
      onOpenAutoFocus={(e) => focarAoAbrir(e, value)} onCloseAutoFocus={(e) => { e.preventDefault(); gatilho.current?.focus(); }}>
      <ListaDoMenu id={id} rotulo={label} opcoes={options} valor={value} aoEscolher={(v) => { onChange(v); setAberto(false); }} aoFechar={() => setAberto(false)} variante="filtro" iconePadrao={icon} />
    </PopoverContent>
  </Popover>;
}
