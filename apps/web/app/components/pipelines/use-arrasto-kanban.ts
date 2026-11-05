"use client";

import type { Deal } from "@plugga/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { velocidadeNaBorda } from "./arrasto-kanban";

type Alvo = { etapaId: string; antesDeId: string | null };
type Arrasto = { negocio: Deal; altura: number; largura: number };

export function useArrastoKanban(quadroRef: RefObject<HTMLDivElement | null>) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const atual = useRef<Arrasto | null>(null);
  const destino = useRef<Alvo | null>(null);
  const anteriores = useRef(new Map<HTMLElement, DOMRect>());
  const animacoes = useRef(new Map<HTMLElement, Animation>());
  const inicioPendente = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capturar = useCallback(() => {
    anteriores.current.clear();
    quadroRef.current?.querySelectorAll<HTMLElement>("[data-cartao-id]").forEach((el) => {
      if (el.dataset.cartaoId !== atual.current?.negocio.id) anteriores.current.set(el, el.getBoundingClientRect());
    });
  }, [quadroRef]);

  const marcar = useCallback((proximo: Alvo | null) => {
    if (destino.current?.etapaId === proximo?.etapaId && destino.current?.antesDeId === proximo?.antesDeId) return;
    capturar();
    destino.current = proximo;
    setAlvo(proximo);
  }, [capturar]);

  useLayoutEffect(() => {
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    anteriores.current.forEach((antes, el) => {
      animacoes.current.get(el)?.cancel();
      if (!el.isConnected || reduzir) return;
      const depois = el.getBoundingClientRect();
      const y = antes.top - depois.top;
      if (Math.abs(y) > 1) {
        const animacao = el.animate([
          { transform: `translateY(${y}px)` }, { transform: "translateY(0)" },
        ], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
        animacoes.current.set(el, animacao);
        animacao.onfinish = () => { if (animacoes.current.get(el) === animacao) animacoes.current.delete(el); };
      }
    });
    anteriores.current.clear();
  }, [alvo, arrasto]);

  const terminar = useCallback(() => {
    if (inicioPendente.current) clearTimeout(inicioPendente.current);
    capturar();
    atual.current = null;
    destino.current = null;
    setArrasto(null);
    setAlvo(null);
  }, [capturar]);

  const comecar = (negocio: Deal, elemento: HTMLElement) => {
    const retangulo = elemento.getBoundingClientRect();
    const novo = { negocio, altura: retangulo.height, largura: retangulo.width };
    atual.current = novo;
    const antesDeId = elemento.parentElement?.nextElementSibling?.getAttribute("data-cartao-id") ?? null;
    // Deixa o navegador capturar a imagem nativa antes de tirar a origem do fluxo.
    inicioPendente.current = setTimeout(() => {
      setArrasto(novo);
      marcar({ etapaId: negocio.stageId, antesDeId });
    }, 0);
  };

  useEffect(() => {
    const ativas = animacoes.current;
    return () => {
      if (inicioPendente.current) clearTimeout(inicioPendente.current);
      ativas.forEach((animacao) => animacao.cancel());
      ativas.clear();
    };
  }, []);

  useEffect(() => {
    if (!arrasto) return;
    let ponteiro: { x: number; y: number } | null = null;
    let quadro = 0;
    let anterior = 0;
    const localizar = () => {
      const raiz = quadroRef.current;
      if (!raiz || !ponteiro) return;
      const coluna = document.elementFromPoint(ponteiro.x, ponteiro.y)?.closest<HTMLElement>("[data-etapa-id]");
      if (!coluna || !raiz.contains(coluna)) { marcar(null); return; }
      const corpo = coluna.querySelector<HTMLElement>("[data-corpo-etapa]")!;
      const topo = corpo.getBoundingClientRect().top - corpo.scrollTop;
      const cartoes = [...corpo.querySelectorAll<HTMLElement>("[data-cartao-id]")].filter((el) => el.dataset.cartaoId !== arrasto.negocio.id);
      // offsetTop ignora a transformação da animação, evitando oscilar entre duas posições.
      const antes = cartoes.find((el) => ponteiro!.y < topo + el.offsetTop + el.offsetHeight / 2);
      marcar({ etapaId: coluna.dataset.etapaId!, antesDeId: antes?.dataset.cartaoId ?? null });
      return corpo;
    };
    const mover = (evento: globalThis.DragEvent) => {
      ponteiro = { x: evento.clientX, y: evento.clientY };
      const raiz = quadroRef.current;
      if (raiz?.contains(evento.target as Node)) {
        evento.preventDefault();
        if (evento.dataTransfer) evento.dataTransfer.dropEffect = "move";
      }
      localizar();
    };
    const rolar = (tempo: number) => {
      const raiz = quadroRef.current;
      const segundos = anterior ? Math.min(32, tempo - anterior) / 1000 : 0;
      anterior = tempo;
      if (raiz && ponteiro) {
        const bordas = raiz.getBoundingClientRect();
        if (ponteiro.y >= bordas.top && ponteiro.y <= bordas.bottom) {
          const esquerda = raiz.scrollLeft;
          raiz.scrollLeft += velocidadeNaBorda(ponteiro.x, bordas.left, bordas.right) * segundos;
          if (raiz.scrollLeft !== esquerda) localizar();
          const corpo = destino.current
            ? [...raiz.querySelectorAll<HTMLElement>("[data-etapa-id]")].find((el) => el.dataset.etapaId === destino.current?.etapaId)?.querySelector<HTMLElement>("[data-corpo-etapa]")
            : null;
          if (corpo) {
            const limites = corpo.getBoundingClientRect();
            const topo = corpo.scrollTop;
            corpo.scrollTop += velocidadeNaBorda(ponteiro.y, limites.top, limites.bottom) * segundos;
            if (corpo.scrollTop !== topo) localizar();
          }
        }
      }
      quadro = requestAnimationFrame(rolar);
    };
    const cancelar = (e: KeyboardEvent) => { if (e.key === "Escape") terminar(); };
    const pausar = () => { ponteiro = null; };
    document.addEventListener("dragover", mover, true);
    document.addEventListener("drop", pausar, true);
    document.addEventListener("dragend", terminar);
    document.addEventListener("keydown", cancelar);
    window.addEventListener("blur", terminar);
    quadro = requestAnimationFrame(rolar);
    return () => {
      cancelAnimationFrame(quadro);
      document.removeEventListener("dragover", mover, true);
      document.removeEventListener("drop", pausar, true);
      document.removeEventListener("dragend", terminar);
      document.removeEventListener("keydown", cancelar);
      window.removeEventListener("blur", terminar);
    };
  }, [arrasto, quadroRef, marcar, terminar]);

  return { arrasto, alvo, comecar, terminar };
}
