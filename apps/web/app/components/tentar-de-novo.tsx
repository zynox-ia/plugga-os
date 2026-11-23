"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { destinoAoVoltar } from "../lib/sessao-do-middleware";
import { Button } from "./ui";

/** Espera entre tentativas: começa rápido (a API em modo watch volta em segundos) e sobe até 15 s. */
export const ESPERAS_MS = [3_000, 5_000, 10_000, 15_000] as const;

/**
 * Nova tentativa automática enquanto a API está fora (PLU-343): consulta a
 * sessão pelo espelho da web e, quando a API responde, segue para o destino; se
 * a resposta for 401/403, aí sim a sessão acabou e vai ao login com o destino.
 */
export function TentarDeNovo({ destino }: { destino: string | null }) {
  const [tentativa, setTentativa] = useState(0);
  const [segundos, setSegundos] = useState(Math.round(ESPERAS_MS[0] / 1000));
  const [tentando, setTentando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tentar = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setTentando(true);
    const alvo = destinoAoVoltar(destino, window.location.pathname, window.location.search);
    try {
      const resposta = await fetch("/api/auth/me", { cache: "no-store" });
      if (resposta.ok) { window.location.replace(alvo); return; }
      if (resposta.status === 401 || resposta.status === 403) {
        window.location.replace(`/login${alvo === "/" ? "" : `?redirectTo=${encodeURIComponent(alvo)}`}`);
        return;
      }
    } catch {
      // Sem rede até a web: tenta de novo na próxima volta.
    }
    setTentando(false);
    setTentativa((t) => t + 1);
  }, [destino]);

  useEffect(() => {
    const espera = ESPERAS_MS[Math.min(tentativa, ESPERAS_MS.length - 1)] ?? 15_000;
    setSegundos(Math.round(espera / 1000));
    const relogio = setInterval(() => setSegundos((s) => Math.max(0, s - 1)), 1000);
    timer.current = setTimeout(() => { void tentar(); }, espera);
    return () => { clearInterval(relogio); if (timer.current) clearTimeout(timer.current); };
  }, [tentativa, tentar]);

  return <div className="aviso" role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
    <span>{tentando ? "Tentando falar com o serviço…" : `Você continua conectado. Nova tentativa em ${segundos} s.`}</span>
    <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => void tentar()} disabled={tentando}>Tentar agora</Button>
  </div>;
}
