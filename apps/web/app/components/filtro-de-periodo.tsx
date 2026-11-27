"use client";

import { CalendarDays, CalendarRange } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { rotuloDoIntervalo, validarIntervalo, type IntervaloLivre } from "../lib/periodo-livre";
import { FiltroComBusca } from "./suprimentos/menu-com-busca";
import { Button } from "./ui";
import { DatePicker, dataInvalidaEm } from "./ui/date-picker";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/shadcn/popover";
import styles from "./filtro-de-periodo.module.css";

/** O que o filtro escolheu: um atalho (ou "" para todo o período) ou um intervalo livre. */
export type EscolhaDePeriodo = { atalho: string; intervalo: null } | { atalho: ""; intervalo: IntervaloLivre };

const PERSONALIZADO = "__personalizado";
const INTERVALO = "__intervalo";

/**
 * Filtro de período reutilizável: "Todo o período", os atalhos da tela e "Personalizado…",
 * que abre um painel com "De" e "Até" (as duas datas são obrigatórias, e Até não pode ser
 * anterior a De). Com um intervalo aplicado, o gatilho mostra o rótulo curto
 * ("01/11 – 15/11/2026"). Usa o gatilho e o menu do FiltroComBusca, então herda o visual
 * de quem o envolve. O estado (e o endereço) são de quem usa a tela.
 */
export function FiltroDePeriodo({ label = "Período", atalhos, atalho, intervalo, aoMudar }: {
  label?: string;
  atalhos: readonly { value: string; label: string }[];
  atalho: string;
  intervalo: IntervaloLivre | null;
  aoMudar: (escolha: EscolhaDePeriodo) => void;
}) {
  const [painel, setPainel] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [erros, setErros] = useState<{ de?: string; ate?: string }>({});
  const raiz = useRef<HTMLSpanElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const focarErro = useRef(false);
  const icone = <CalendarDays />;

  const opcoes = [
    { value: "", label: "Todo o período", icon: icone },
    ...atalhos.map((a) => ({ value: a.value, label: a.label, icon: icone })),
    ...(intervalo ? [{ value: INTERVALO, label: rotuloDoIntervalo(intervalo), icon: icone }] : []),
    { value: PERSONALIZADO, label: "Personalizado…", icon: <CalendarRange /> },
  ];
  const gatilho = () => raiz.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]') ?? null;

  /** O menu devolve o foco ao gatilho ao fechar; abrir o painel antes disso o fecharia (foco fora). */
  function abrirPainelQuandoOMenuFechar(tentativas = 0) {
    const menuAberto = gatilho()?.getAttribute("aria-expanded") === "true" || document.querySelector('[role="listbox"]');
    if (menuAberto && tentativas < 40) { requestAnimationFrame(() => abrirPainelQuandoOMenuFechar(tentativas + 1)); return; }
    requestAnimationFrame(() => { setDe(intervalo?.de ?? ""); setAte(intervalo?.ate ?? ""); setErros({}); setPainel(true); });
  }
  function aoEscolher(valor: string) {
    if (valor === PERSONALIZADO || valor === INTERVALO) {
      abrirPainelQuandoOMenuFechar();
      return;
    }
    aoMudar({ atalho: valor, intervalo: null });
  }
  function aplicar() {
    if (dataInvalidaEm(conteudo.current)) return;
    const encontrados = validarIntervalo(de, ate);
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
      <span ref={raiz} className={styles.ancora}>
        <FiltroComBusca label={label} icon={icone} semFiltro="" value={intervalo ? INTERVALO : atalho} options={opcoes} onChange={aoEscolher} />
      </span>
    </PopoverAnchor>
    <PopoverContent ref={conteudo} align="end" className={styles.painel} aria-label={`${label} personalizado`}
      onOpenAutoFocus={(e) => { e.preventDefault(); conteudo.current?.querySelector<HTMLInputElement>('[data-campo="de"] input')?.focus(); }}
      onCloseAutoFocus={(e) => { e.preventDefault(); gatilho()?.focus(); }}
      // O calendário do DatePicker abre noutra camada: clicar nele não é clicar fora.
      onInteractOutside={(e) => { if ((e.target as HTMLElement | null)?.closest(".ui-date-popover")) e.preventDefault(); }}>
      <div className={styles.campos} role="group" aria-label="Intervalo de datas">
        <div className={styles.campo} data-campo="de"><DatePicker label="De" required value={de} onChange={(v) => { setDe(v); if (erros.de || erros.ate) setErros({}); }} error={erros.de} hint="" /></div>
        <div className={styles.campo} data-campo="ate"><DatePicker label="Até" required value={ate} onChange={(v) => { setAte(v); if (erros.de || erros.ate) setErros({}); }} error={erros.ate} hint="" /></div>
      </div>
      <div className={styles.acoes}>
        {/* O clique não tira o foco do campo: o erro do próprio campo, ao perder o foco, empurraria o botão antes do clique. */}
        <Button variant="secondary" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={limpar}>Limpar</Button>
        <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={aplicar}>Aplicar</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
