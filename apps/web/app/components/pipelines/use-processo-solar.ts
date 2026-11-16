"use client";

import type { Pipeline, SolarProcessState } from "@plugga/shared";
import { useEffect, useState } from "react";
import { lerSituacaoSolar, processoSolarAtivo } from "../../lib/processo-solar";

/** Situação do lead no processo Solar; relida a cada recarga do lead (`revisao`). */
export function useProcessoSolar(negocioId: string, pipeline: Pick<Pipeline, "processProfile">, revisao: number) {
  const ativo = processoSolarAtivo(pipeline);
  const [situacao, setSituacao] = useState<SolarProcessState | null>(null);
  const [carregando, setCarregando] = useState(ativo);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo) { setSituacao(null); setCarregando(false); return; }
    const controller = new AbortController();
    setCarregando(true); setErro(null);
    void lerSituacaoSolar(negocioId, controller.signal)
      .then((dados) => { if (!controller.signal.aborted) setSituacao(dados); })
      .catch((falha: unknown) => { if (!controller.signal.aborted) setErro(falha instanceof Error ? falha.message : "Não foi possível carregar as pendências."); })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [ativo, negocioId, revisao]);

  return { ativo, situacao, carregando, erro };
}
