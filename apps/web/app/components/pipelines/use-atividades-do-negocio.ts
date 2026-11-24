"use client";

import { listActivitiesResponseSchema, type Activity, type CompleteActivityRequest, type CompleteActivityResponse, type CreateActivityRequest, type UpdateActivityRequest } from "@plugga/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { enviar, lerErro, type ErroDoFormulario } from "../../lib/clientes";

/** `aoConcluirDoProcesso`: tarefa do processo concluída pode ter movido o card; o modal recarrega o lead. */
export function useAtividadesDoNegocio(negocioId: string, aoConcluirDoProcesso?: () => void) {
  const [atividades, setAtividades] = useState<Activity[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [revisao, setRevisao] = useState(0);
  const pendente = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true); setErro(null);
    async function carregar() {
      try {
        const registros = new Map<string, Activity>();
        const cursores = new Set<string>();
        let cursor: string | null = null;
        do {
          const query = new URLSearchParams({ scope: "target", dealId: negocioId, limit: "100" });
          if (cursor) query.set("cursor", cursor);
          const resposta = await fetch(`/api/atividades?${query}`, { cache: "no-store", signal: controller.signal });
          const dados: unknown = await resposta.json().catch(() => null);
          if (!resposta.ok) throw new Error(lerErro(dados, "Não foi possível carregar as atividades.").mensagem);
          const pagina = listActivitiesResponseSchema.safeParse(dados);
          if (!pagina.success) throw new Error("Não foi possível interpretar a lista de atividades. Recarregue e tente novamente.");
          for (const atividade of pagina.data.activities) registros.set(atividade.id, atividade);
          cursor = pagina.data.nextCursor;
          if (cursor && cursores.has(cursor)) throw new Error("Não foi possível completar a lista de atividades. Recarregue e tente novamente.");
          if (cursor) cursores.add(cursor);
        } while (cursor);
        if (!controller.signal.aborted) setAtividades([...registros.values()]);
      } catch (falha) {
        if (!controller.signal.aborted) setErro({ mensagem: falha instanceof Error && !(falha instanceof TypeError) ? falha.message : "Sem conexão para carregar as atividades.", porCampo: {} });
      } finally {
        if (!controller.signal.aborted) setCarregando(false);
      }
    }
    void carregar();
    return () => controller.abort();
  }, [negocioId, revisao]);

  const aplicar = useCallback((recebidas: Activity[]) => setAtividades((atuais) => {
    const porId = new Map(atuais.map((atividade) => [atividade.id, atividade]));
    for (const atividade of recebidas) porId.set(atividade.id, atividade);
    return [...porId.values()];
  }), []);

  async function executar<T>(url: string, metodo: "POST" | "PATCH", dados: unknown): Promise<T | null> {
    if (pendente.current || carregando) return null;
    pendente.current = true; setSalvando(true); setErro(null);
    try {
      const resposta = await enviar<T>(url, metodo, dados);
      if (!resposta.ok) { setErro(resposta.erro); return null; }
      return resposta.dados;
    } finally { pendente.current = false; setSalvando(false); }
  }

  return {
    atividades, carregando, salvando, erro,
    recarregar: () => { if (!pendente.current) setRevisao((valor) => valor + 1); },
    limparErro: () => setErro(null),
    async criar(dados: CreateActivityRequest) {
      const atividade = await executar<Activity>("/api/atividades", "POST", dados);
      if (atividade) aplicar([atividade]);
      return atividade;
    },
    async atualizar(atividade: Activity, dados: Omit<UpdateActivityRequest, "version">) {
      const atualizada = await executar<Activity>(`/api/atividades/${atividade.id}`, "PATCH", { ...dados, version: atividade.version });
      if (atualizada) aplicar([atualizada]);
      return atualizada;
    },
    async concluir(atividade: Activity, dados: Omit<CompleteActivityRequest, "version" | "roundId">) {
      const resultado = await executar<CompleteActivityResponse>(`/api/atividades/${atividade.id}/conclusao`, "POST", { ...dados, version: atividade.version, roundId: atividade.currentRound.id });
      if (resultado) aplicar([resultado.activity, ...(resultado.nextActivity ? [resultado.nextActivity] : [])]);
      if (resultado && atividade.origin === "process") aoConcluirDoProcesso?.();
      return resultado;
    },
  };
}

export type ControleAtividadesDoNegocio = ReturnType<typeof useAtividadesDoNegocio>;
