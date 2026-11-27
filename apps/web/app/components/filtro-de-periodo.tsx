"use client";

import { CalendarDays, CalendarRange } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { diaValido, mesInicial, proximaSelecao, rotuloDoIntervalo, validarIntervalo, type IntervaloLivre } from "../lib/periodo-livre";
import { CampoDeMenu, FiltroComBusca } from "./suprimentos/menu-com-busca";
import { Button } from "./ui";
import { DatePicker, dataInvalidaEm } from "./ui/date-picker";
import { dateValue, parseDate } from "./ui/date-value";
import { Calendar } from "./ui/shadcn/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/shadcn/popover";
import styles from "./filtro-de-periodo.module.css";

/** O que o filtro escolheu: um atalho (ou "" para todo o período) ou um intervalo livre. */
export type EscolhaDePeriodo = { atalho: string; intervalo: null } | { atalho: ""; intervalo: IntervaloLivre };

const TELA_ESTREITA = "(max-width: 640px)";
const assinarTela = (aviso: () => void) => { const m = window.matchMedia(TELA_ESTREITA); m.addEventListener("change", aviso); return () => m.removeEventListener("change", aviso); };
/** Um mês só em tela estreita; dois, lado a lado, no resto (no servidor, dois). */
const useMesesVisiveis = () => useSyncExternalStore(assinarTela, () => (window.matchMedia(TELA_ESTREITA).matches ? 1 : 2), () => 2);

/** Sem `onSelect` o react-day-picker guarda a seleção sozinho e ignora `selected`; aqui quem manda é o estado do painel (clicarNoDia). */
const SEM_ACAO = () => undefined;

const PERSONALIZADO = "__personalizado";
const INTERVALO = "__intervalo";

/**
 * Filtro de período reutilizável: "Todo o período", os atalhos da tela e "Personalizado…",
 * que abre um painel com "De" e "Até" (digitáveis) e, embaixo, dois meses lado a lado (um só
 * em tela estreita): o primeiro clique marca o início, o segundo o fim, e a faixa entre eles
 * fica realçada. As duas datas são obrigatórias, e Até não pode ser anterior a De. Com um intervalo aplicado, o gatilho mostra o rótulo curto
 * ("01/11 – 15/11/2026"). Usa o gatilho e o menu do FiltroComBusca, então herda o visual
 * de quem o envolve. O estado (e o endereço) são de quem usa a tela.
 *
 * Opcionais (sem eles nada muda): `maximoDeDias` recusa, no campo Até, um intervalo maior que o
 * limite da API da tela; `semTodoOPeriodo` tira "Todo o período" quando a tela sempre precisa de
 * datas; `variante="campo"` troca o gatilho de filtro pelo campo de formulário (`CampoDeMenu`, com
 * `dica`), para dentro de diálogos, e abre o painel dentro do próprio diálogo. `rotuloDoTodos` renomeia
 * "Todo o período"; `semFiltro` é o atalho que o gatilho mostra só como o rótulo (o padrão da tela,
 * quando não é "todo o período"); `cheio` estica o gatilho à largura de quem o envolve.
 */
export function FiltroDePeriodo({ label = "Período", hoje, classeDoPainel, atalhos, atalho, intervalo, aoMudar, maximoDeDias, semTodoOPeriodo = false, variante = "filtro", dica, rotuloDoTodos = "Todo o período", semFiltro = "", cheio = false }: {
  label?: string;
  /** O dia de referência da página (AAAA-MM-DD, o de Manaus): o calendário abre nele quando não há intervalo. Sem ele, vale o dia do navegador. */
  hoje?: string;
  /** Classe a mais no painel do menu (ver FiltroComBusca), para a tela estilizá-lo só no seu contexto. */
  classeDoPainel?: string;
  rotuloDoTodos?: string;
  semFiltro?: string;
  cheio?: boolean;
  maximoDeDias?: number;
  semTodoOPeriodo?: boolean;
  variante?: "filtro" | "campo";
  dica?: string;
  atalhos: readonly { value: string; label: string }[];
  atalho: string;
  intervalo: IntervaloLivre | null;
  aoMudar: (escolha: EscolhaDePeriodo) => void;
}) {
  const [painel, setPainel] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [erros, setErros] = useState<{ de?: string; ate?: string }>({});
  const referencia = hoje ?? dateValue(new Date());
  const [mes, setMes] = useState<Date>(() => parseDate(mesInicial({ de: "", ate: "" }, referencia)) ?? new Date());
  const [camada, setCamada] = useState<HTMLElement | null>(null);
  const meses = useMesesVisiveis();
  const raiz = useRef<HTMLSpanElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const focarErro = useRef(false);
  const icone = <CalendarDays />;

  const opcoes = [
    ...(semTodoOPeriodo ? [] : [{ value: "", label: rotuloDoTodos, icon: icone }]),
    ...atalhos.map((a) => ({ value: a.value, label: a.label, icon: icone })),
    ...(intervalo ? [{ value: INTERVALO, label: rotuloDoIntervalo(intervalo), icon: icone }] : []),
    { value: PERSONALIZADO, label: "Personalizado…", icon: <CalendarRange /> },
  ];
  const gatilho = () => raiz.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]') ?? null;
  const emCampo = variante === "campo";

  /** O menu devolve o foco ao gatilho ao fechar; abrir o painel antes disso o fecharia (foco fora). */
  function abrirPainelQuandoOMenuFechar(tentativas = 0) {
    const menuAberto = gatilho()?.getAttribute("aria-expanded") === "true" || document.querySelector('[role="listbox"]');
    if (menuAberto && tentativas < 40) { requestAnimationFrame(() => abrirPainelQuandoOMenuFechar(tentativas + 1)); return; }
    requestAnimationFrame(() => {
      const inicio = { de: intervalo?.de ?? "", ate: intervalo?.ate ?? "" };
      setDe(inicio.de); setAte(inicio.ate); setErros({});
      setMes(parseDate(mesInicial(inicio, referencia)) ?? new Date());
      // Dentro de um <dialog> modal, só o que está nele recebe cliques: o painel abre na mesma camada.
      setCamada(raiz.current?.closest("dialog") ?? null);
      setPainel(true);
    });
  }
  function aoEscolher(valor: string) {
    if (valor === PERSONALIZADO || valor === INTERVALO) {
      abrirPainelQuandoOMenuFechar();
      return;
    }
    aoMudar({ atalho: valor, intervalo: null });
  }
  /** Digitar uma data válida leva o calendário até o mês dela; o erro some ao editar. */
  function digitar(lado: "de" | "ate", valor: string) {
    (lado === "de" ? setDe : setAte)(valor);
    if (erros.de || erros.ate) setErros({});
    const dia = parseDate(valor);
    if (dia && diaValido(valor)) setMes(dia);
  }
  function clicarNoDia(dia: Date) {
    const proximo = proximaSelecao({ de, ate }, dateValue(dia));
    setDe(proximo.de); setAte(proximo.ate); setErros({});
  }
  function aplicar() {
    if (dataInvalidaEm(conteudo.current)) return;
    const encontrados = validarIntervalo(de, ate, maximoDeDias);
    if (encontrados.de || encontrados.ate) { focarErro.current = true; setErros(encontrados); return; }
    aoMudar({ atalho: "", intervalo: { de, ate } });
    setPainel(false);
  }
  function limpar() { aoMudar({ atalho: "", intervalo: null }); setPainel(false); }

  useEffect(() => {
    if (!focarErro.current) return;
    focarErro.current = false;
    const campo = erros.de ? "de" : erros.ate ? "ate" : null;
    if (campo) conteudo.current?.querySelector<HTMLInputElement>(`[data-campo="${campo}"] input`)?.focus();
  }, [erros]);

  return <Popover open={painel} onOpenChange={setPainel}>
    <PopoverAnchor asChild>
      <span ref={raiz} className={emCampo ? styles.ancoraCampo : cheio ? `${styles.ancora} ${styles.cheio}` : styles.ancora}>
        {emCampo
          ? <CampoDeMenu label={label} icon={icone} required={semTodoOPeriodo} hint={dica} value={intervalo ? INTERVALO : atalho} options={opcoes} onChange={aoEscolher} />
          : <FiltroComBusca label={label} icon={icone} semFiltro={semFiltro} value={intervalo ? INTERVALO : atalho} options={opcoes} onChange={aoEscolher} {...(classeDoPainel ? { classeDoPainel } : {})} />}
      </span>
    </PopoverAnchor>
    <PopoverContent ref={conteudo} container={camada} align={emCampo ? "start" : "end"} className={styles.painel} aria-label={`${label} personalizado`}
      onOpenAutoFocus={(e) => { e.preventDefault(); conteudo.current?.querySelector<HTMLInputElement>('[data-campo="de"] input')?.focus(); }}
      onCloseAutoFocus={(e) => { e.preventDefault(); gatilho()?.focus(); }}
      // O calendário do DatePicker abre noutra camada: clicar nele não é clicar fora.
      onInteractOutside={(e) => { if ((e.target as HTMLElement | null)?.closest(".ui-date-popover")) e.preventDefault(); }}>
      <div className={styles.campos} role="group" aria-label="Intervalo de datas">
        <div className={styles.campo} data-campo="de"><DatePicker label="De" required value={de} onChange={(v) => digitar("de", v)} error={erros.de} hint="" /></div>
        <div className={styles.campo} data-campo="ate"><DatePicker label="Até" required value={ate} onChange={(v) => digitar("ate", v)} error={erros.ate} hint="" /></div>
      </div>
      {/* Clicar no calendário não tira o foco do campo De/Até: o erro "obrigatório" do campo, ao perder o foco, empurraria o calendário antes do clique terminar. */}
      <div onMouseDown={(e) => e.preventDefault()}>
        <Calendar mode="range" numberOfMonths={meses} month={mes} onMonthChange={setMes} onDayClick={clicarNoDia} onSelect={SEM_ACAO} showOutsideDays={false}
          selected={{ from: parseDate(diaValido(de) ? de : diaValido(ate) ? ate : ""), to: parseDate(diaValido(ate) ? ate : diaValido(de) ? de : "") }} className={styles.calendarios} />
      </div>
      <div className={styles.acoes}>
        {/* O clique não tira o foco do campo: o erro do próprio campo, ao perder o foco, empurraria o botão antes do clique. */}
        <Button variant="secondary" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={limpar}>Limpar</Button>
        <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={aplicar}>Aplicar</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
