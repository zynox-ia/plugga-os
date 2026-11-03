"use client";

import { dealDetailSchema, updateLeadRequestSchema, type Deal, type DealDetail } from "@plugga/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { enviar, lerErro } from "../../lib/clientes";
import { criarRascunhoLead, montarAtualizacaoLead, rascunhosIguais, type RascunhoLead } from "../../lib/rascunho-lead";

export function useDetalhesDoLead(id: string, pipelineId: string, aoAtualizar: (negocio: Deal) => void) {
  const [negocio, setNegocio] = useState<DealDetail | null>(null);
  const [original, setOriginal] = useState<RascunhoLead | null>(null);
  const [rascunho, setRascunho] = useState<RascunhoLead | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [errosCampos, setErrosCampos] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [revisao, setRevisao] = useState(0);
  const callback = useRef(aoAtualizar);
  useEffect(() => { callback.current = aoAtualizar; }, [aoAtualizar]);

  const aplicar = useCallback((atual: DealDetail) => {
    setNegocio(atual);
    const proximo = criarRascunhoLead(atual);
    setOriginal(proximo);
    setRascunho(proximo);
    setConflito(false);
    setErrosCampos({});
    setRevisao((valor) => valor + 1);
    callback.current(atual);
  }, []);

  const carregar = useCallback(async (signal?: AbortSignal) => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/leads/${id}`, { cache: "no-store", signal });
      const corpo: unknown = await resposta.json();
      if (!resposta.ok) throw new Error(lerErro(corpo, "Não foi possível carregar este lead.").mensagem);
      const resultado = dealDetailSchema.safeParse(corpo);
      if (!resultado.success) throw new Error("Os dados recebidos estão incompletos. Tente novamente.");
      if (resultado.data.pipelineId !== pipelineId) throw new Error("Este lead foi movido para outro pipeline. Abra-o no pipeline atual.");
      if (!signal?.aborted) aplicar(resultado.data);
    } catch (falha) {
      if (!signal?.aborted) setErro(falha instanceof Error ? falha.message : "Não foi possível carregar este lead.");
    } finally {
      if (!signal?.aborted) setCarregando(false);
    }
  }, [id, pipelineId, aplicar]);

  useEffect(() => {
    const controller = new AbortController();
    void carregar(controller.signal);
    return () => controller.abort();
  }, [carregar]);

  const alterado = !!original && !!rascunho && !rascunhosIguais(original, rascunho);

  async function salvar() {
    if (!original || !rascunho || !negocio || salvando || conflito || !alterado) return;
    setErro(null);
    setSucesso(false);
    setErrosCampos({});
    let corpo;
    try { corpo = montarAtualizacaoLead(original, rascunho, negocio.version); }
    catch (falha) { setErro(falha instanceof Error ? falha.message : "Confira os dados informados."); return; }
    const validacao = updateLeadRequestSchema.safeParse(corpo);
    if (!validacao.success) {
      setErrosCampos(Object.fromEntries(validacao.error.issues.map((item) => [item.path.join("."), item.message])));
      setErro("Confira os campos destacados nas abas Lead e Oportunidade.");
      return;
    }
    setSalvando(true);
    const resposta = await enviar<unknown>(`/api/leads/${id}`, "PATCH", validacao.data);
    setSalvando(false);
    if (!resposta.ok) {
      setConflito(resposta.erro.codigo === "CONFLITO_ESTADO");
      setErro(Object.values(resposta.erro.porCampo).join(" · ") || resposta.erro.mensagem);
      return;
    }
    const resultado = dealDetailSchema.safeParse(resposta.dados);
    if (!resultado.success) {
      setConflito(true);
      setErro("A resposta do salvamento está incompleta. Seus textos foram preservados; recarregue para conferir os dados.");
      return;
    }
    aplicar(resultado.data);
    setSucesso(true);
  }

  return { negocio, rascunho, setRascunho, carregando, carregar, salvando, salvar, erro, errosCampos, conflito, sucesso, alterado, revisao };
}
