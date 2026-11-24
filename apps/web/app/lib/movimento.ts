"use client";

import { gsap } from "gsap";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Movimento de entrada (PLU-325), na linha do Penvo (Zynox-Portfolio): cartões
 * sobem com leve escala, indicadores "saltam", listas descem em cascata,
 * títulos sobem de dentro de uma máscara e barras crescem da esquerda.
 * Todos os números do movimento JS moram aqui; o CSS usa os tokens --motion-*.
 *
 * Regras que valem para todo uso:
 * - roda uma vez por montagem do bloco (efeito com dependências vazias); o que
 *   for inserido depois (filtro, arrasto, página nova) aparece direto;
 * - cada tween termina com clearProps, para não brigar com o transform do
 *   arrasto do kanban nem com o hover;
 * - com prefers-reduced-motion: reduce nada roda e o conteúdo fica no estado
 *   final;
 * - o HTML do servidor fica visível: só a raiz da página espera o JS, e o CSS
 *   a revela sozinho se o JS não vier (ver "data-plg-aguarda" no globals.css).
 */
export const MOVIMENTO = {
  /** Itens animados por grupo; do 14º em diante entram junto com ele. */
  teto: 14,
  titulo: { yPercent: 110, duracao: 0.85, curva: "power4.out", passo: 0.08 },
  cartao: { y: 26, escala: 0.985, duracao: 0.8, curva: "expo.out", passo: 0.06 },
  kpi: { y: 40, escala: 0.95, giro: 2, duracao: 0.85, curva: "back.out(1.4)", passo: 0.07 },
  item: { y: 12, duracao: 0.55, curva: "power3.out", passo: 0.03 },
  barra: { duracao: 0.9, curva: "expo.out", passo: 0.03 },
  pilula: { escala: 0.6, duracao: 0.6, curva: "back.out(3)", passo: 0.05 },
  rota: { x: 26, duracao: 0.7, curva: "expo.out" },
  modal: {
    escala: 0.9,
    duracao: 0.5,
    curva: "back.out(1.5)",
    parte: { y: 14, atraso: 0.12, passo: 0.04, duracao: 0.5, curva: "power3.out" },
    saida: { escala: 0.94, duracao: 0.2, curva: "power2.in" },
    /** Quanto esperar o pai desmontar depois da saída antes de devolver o modal. */
    esperaDoPai: 0.5,
  },
} as const;

/**
 * Momentos (s) da coreografia de cada tela. Ordem do Home do Penvo, com os
 * KPIs antes dos cartões porque no Dashboard eles ficam acima: cabeçalho →
 * KPIs → cartões → listas → barras → pílulas.
 */
export const COREOGRAFIA = {
  dashboard: { titulo: 0, acoes: 0.1, kpis: 0.15, cartoes: 0.28, itens: 0.45, barras: 0.55, pilulas: 0.8 },
  pipelines: { titulo: 0, acoes: 0.12 },
  kanban: { colunas: 0.18, cartoes: 0.26, pilulas: 0.75 },
  lista: { cabecalho: 0.18, linhas: 0.26, pilulas: 0.6 },
} as const;

/** Atraso do item na cascata, com teto: do 14º item em diante todos saem juntos. */
export function atrasoEscalonado(indice: number, passo: number): number {
  return Math.min(Math.max(indice, 0), MOVIMENTO.teto - 1) * passo;
}

type ComMatchMedia = { matchMedia(consulta: string): { matches: boolean } };

/** Preferência de movimento reduzido. Fora do navegador conta como reduzido: nada anima no servidor. */
export function movimentoReduzido(janela: ComMatchMedia | undefined = typeof window === "undefined" ? undefined : window): boolean {
  return !janela || janela.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const useLayoutIsomorfico = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Elementos do bloco: só os que pertencem a esta raiz (blocos aninhados têm a própria). */
function alvosDe(raiz: HTMLElement, seletor: string): HTMLElement[] {
  return [...raiz.querySelectorAll<HTMLElement>(seletor)].filter((el) => el.closest("[data-plg-raiz]") === raiz);
}

const FIM = { clearProps: "transform,opacity" } as const;
const escalonar = (passo: number) => (indice: number) => atrasoEscalonado(indice, passo);

export type Coreografia = {
  titulos(seletor: string, em: number): void;
  cartoes(seletor: string, em: number): void;
  kpis(seletor: string, em: number): void;
  itens(seletor: string, em: number): void;
  barras(seletor: string, em: number): void;
  pilulas(seletor: string, em: number): void;
  /** Cartões com atraso próprio (o kanban desce em diagonal: coluna + posição). */
  cartoesEmOnda(alvos: { el: HTMLElement; onda: number }[], em: number): void;
  alvos(seletor: string): HTMLElement[];
};

function coreografia(linha: gsap.core.Timeline, raiz: HTMLElement): Coreografia {
  const { titulo, cartao, kpi, item, barra, pilula } = MOVIMENTO;
  const com = (seletor: string, montar: (alvos: HTMLElement[]) => void) => {
    const alvos = alvosDe(raiz, seletor);
    if (alvos.length) montar(alvos);
  };
  return {
    alvos: (seletor) => alvosDe(raiz, seletor),
    titulos: (seletor, em) => com(seletor, (alvos) => linha.fromTo(alvos, { yPercent: titulo.yPercent }, { yPercent: 0, duration: titulo.duracao, ease: titulo.curva, stagger: escalonar(titulo.passo), clearProps: "transform" }, em)),
    cartoes: (seletor, em) => com(seletor, (alvos) => linha.fromTo(alvos, { opacity: 0, y: cartao.y, scale: cartao.escala }, { opacity: 1, y: 0, scale: 1, duration: cartao.duracao, ease: cartao.curva, stagger: escalonar(cartao.passo), ...FIM }, em)),
    kpis: (seletor, em) => com(seletor, (alvos) => linha.fromTo(alvos, { opacity: 0, y: kpi.y, scale: kpi.escala, rotation: (i: number) => (i % 2 ? kpi.giro : -kpi.giro) }, { opacity: 1, y: 0, scale: 1, rotation: 0, duration: kpi.duracao, ease: kpi.curva, stagger: escalonar(kpi.passo), ...FIM }, em)),
    itens: (seletor, em) => com(seletor, (alvos) => linha.fromTo(alvos, { opacity: 0, y: item.y }, { opacity: 1, y: 0, duration: item.duracao, ease: item.curva, stagger: escalonar(item.passo), ...FIM }, em)),
    barras: (seletor, em) => com(seletor, (alvos) => linha.fromTo(alvos, { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: barra.duracao, ease: barra.curva, stagger: escalonar(barra.passo), clearProps: "transform,transformOrigin" }, em)),
    pilulas: (seletor, em) => com(seletor, (alvos) => linha.fromTo(alvos, { opacity: 0, scale: pilula.escala }, { opacity: 1, scale: 1, duration: pilula.duracao, ease: pilula.curva, stagger: escalonar(pilula.passo), ...FIM }, em)),
    cartoesEmOnda: (alvos, em) => {
      for (const { el, onda } of alvos) {
        linha.fromTo(el, { opacity: 0, y: cartao.y, scale: cartao.escala }, { opacity: 1, y: 0, scale: 1, duration: cartao.duracao, ease: cartao.curva, ...FIM }, em + atrasoEscalonado(onda, cartao.passo));
      }
    },
  };
}

/** A tela ainda está escondida pelo CSS à espera do JS (o fallback ainda não a revelou). */
function aindaAguarda(tela: HTMLElement): boolean {
  return tela.getAnimations().some((a) => (a as Partial<CSSAnimation>).animationName === "plg-aguarda" && a.playState !== "finished");
}

/** Ordem das telas no menu, para a entrada vir do lado certo. */
const ORDEM_DAS_TELAS = ["/", "/comercial/pipelines"];
let telaAnterior: string | null = null;

/** Lado de onde a tela entra: +1 (da direita) indo para baixo no menu, -1 voltando, 0 sem referência. */
export function ladoDaEntrada(de: string | null, para: string): -1 | 0 | 1 {
  const origem = de === null ? -1 : ORDEM_DAS_TELAS.indexOf(de);
  const destino = ORDEM_DAS_TELAS.indexOf(para);
  if (origem < 0 || destino < 0 || origem === destino) return 0;
  return destino > origem ? 1 : -1;
}

/**
 * Entrada de um bloco: roda `montar` uma vez, na montagem, antes do primeiro
 * paint. A raiz precisa de `data-plg-raiz`; se for a raiz da tela, passe a
 * rota para a entrada direcional e marque-a com `data-plg-aguarda` no JSX.
 * Ao terminar, a raiz ganha `data-plg-pronto` (liga o hover dos cartões).
 */
export function useEntrada(ref: RefObject<HTMLElement | null>, montar: (passos: Coreografia) => void, opcoes: { rota?: string } = {}) {
  const { rota } = opcoes;
  // O lado é decidido uma vez por montagem: no modo estrito o efeito roda duas vezes.
  const lado = useRef<number | null>(null);
  // A coreografia é lida só na montagem, de propósito: re-render não re-anima.
  useLayoutIsomorfico(() => {
    const raiz = ref.current;
    if (!raiz) return;
    // A tela que espera o JS: a própria raiz ou a raiz da página em volta deste bloco.
    const tela = raiz.closest<HTMLElement>("[data-plg-aguarda]");
    if (lado.current === null) {
      lado.current = rota ? ladoDaEntrada(telaAnterior, rota) : 0;
      if (rota) telaAnterior = rota;
    }
    const deslocamento = lado.current * MOVIMENTO.rota.x;
    const revelar = () => { if (tela === raiz) raiz.removeAttribute("data-plg-aguarda"); };
    const liberar = () => raiz.setAttribute("data-plg-pronto", "");
    // Movimento reduzido, ou o fallback do CSS já mostrou a tela (JS chegou
    // tarde): esconder agora para animar seria piscar. Fica como está.
    if (movimentoReduzido() || (tela && !aindaAguarda(tela))) {
      revelar();
      liberar();
      return;
    }
    raiz.removeAttribute("data-plg-pronto");
    const contexto = gsap.context(() => {
      const linha = gsap.timeline({ onComplete: liberar });
      if (deslocamento) linha.fromTo(raiz, { x: deslocamento }, { x: 0, duration: MOVIMENTO.rota.duracao, ease: MOVIMENTO.rota.curva, clearProps: "transform" }, 0);
      montar(coreografia(linha, raiz));
    }, raiz);
    revelar();
    return () => contexto.revert();
  }, []);
}

/** Origem da escala do modal: o centro do elemento que o abriu, relativo à caixa do modal. */
function origemNoGatilho(dialogo: HTMLElement, gatilho: Element | null): string {
  if (!(gatilho instanceof HTMLElement) || !gatilho.isConnected || gatilho === document.body) return "50% 50%";
  const caixa = dialogo.getBoundingClientRect();
  const alvo = gatilho.getBoundingClientRect();
  if (!alvo.width && !alvo.height) return "50% 50%";
  return `${alvo.left + alvo.width / 2 - caixa.left}px ${alvo.top + alvo.height / 2 - caixa.top}px`;
}

/** Partes do modal que entram em sequência: as marcadas com .plg-parte ou, sem marca, os filhos do conteúdo. */
function partesDoModal(dialogo: HTMLElement): HTMLElement[] {
  const marcadas = [...dialogo.querySelectorAll<HTMLElement>(".plg-parte")];
  if (marcadas.length) return marcadas;
  let bloco = dialogo.querySelector<HTMLElement>(".modal-conteudo");
  while (bloco && bloco.children.length === 1) bloco = bloco.children[0] as HTMLElement;
  return bloco ? [...bloco.children].filter((el): el is HTMLElement => el instanceof HTMLElement) : [];
}

/** Entrada do modal: escala a partir do gatilho e partes internas em cascata. Devolve o desfazer. */
export function entrarModal(dialogo: HTMLDialogElement, gatilho: Element | null): (() => void) | null {
  if (movimentoReduzido()) return null;
  const { modal } = MOVIMENTO;
  const contexto = gsap.context(() => {
    gsap.fromTo(dialogo, { opacity: 0, scale: modal.escala, transformOrigin: origemNoGatilho(dialogo, gatilho) }, { opacity: 1, scale: 1, duration: modal.duracao, ease: modal.curva, clearProps: "transform,opacity,transformOrigin" });
    const partes = partesDoModal(dialogo);
    if (partes.length) gsap.fromTo(partes, { opacity: 0, y: modal.parte.y }, { opacity: 1, y: 0, duration: modal.parte.duracao, ease: modal.parte.curva, delay: modal.parte.atraso, stagger: escalonar(modal.parte.passo), ...FIM });
  }, dialogo);
  return () => contexto.revert();
}

/**
 * Saída curta do modal; ao terminar chama `fechar`. Se o pai não desmontar o
 * modal (estava salvando, pediu confirmação), ele volta ao estado normal.
 */
export function sairModal(dialogo: HTMLDialogElement, fechar: () => void, aoVoltar: () => void) {
  const { saida, esperaDoPai } = MOVIMENTO.modal;
  dialogo.classList.add("modal--saindo");
  gsap.to(dialogo, {
    opacity: 0,
    scale: saida.escala,
    duration: saida.duracao,
    ease: saida.curva,
    onComplete: () => {
      fechar();
      gsap.delayedCall(esperaDoPai, () => {
        if (!dialogo.isConnected) return;
        dialogo.classList.remove("modal--saindo");
        gsap.set(dialogo, { clearProps: "transform,opacity" });
        aoVoltar();
      });
    },
  });
}
