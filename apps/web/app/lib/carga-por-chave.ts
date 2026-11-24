export type EstadoDaCarga = "carregando" | "ok" | "erro";
export type Carga<T> = { estado: EstadoDaCarga; dados: T };

/**
 * Deriva o que mostrar no render atual a partir da última carga guardada (concluída por um efeito
 * anterior). Quando a chave guardada não é a chave atual (negócio ou versão mudou e o efeito da
 * nova consulta ainda não concluiu), não existe dado válido para a chave atual ainda: mostra
 * "carregando" (ou "ok" vazio quando desabilitado) em vez do dado do negócio anterior, sem esperar
 * o efeito rodar — a derivação acontece no próprio render, não depois dele.
 */
export function cargaParaRender<T>(chaveGuardada: string, chaveAtual: string, cargaGuardada: Carga<T[]>, habilitado: boolean): Carga<T[]> {
  if (chaveGuardada === chaveAtual) return cargaGuardada;
  return { estado: habilitado ? "carregando" : "ok", dados: [] };
}

/**
 * Inicia a consulta de uma chave e devolve a função de cancelamento (chamada no cleanup do efeito,
 * ao trocar de negócio/versão ou desmontar). Guarda com `AbortController`: se `cancelar` já rodou
 * quando a promessa de `ler` resolver ou falhar — mesmo que a chamada em si não tenha sido
 * interrompida de verdade pela rede —, `aoResolver` nunca é chamado, então uma resposta atrasada da
 * chave anterior nunca sobrescreve o estado da chave atual.
 */
export function iniciarCarga<T>(
  chave: string,
  negocioId: string,
  ler: (id: string, signal: AbortSignal) => Promise<T[]>,
  aoResolver: (resultado: { chave: string; carga: Carga<T[]> }) => void,
): () => void {
  const controller = new AbortController();
  void ler(negocioId, controller.signal)
    .then((dados) => { if (!controller.signal.aborted) aoResolver({ chave, carga: { estado: "ok", dados } }); })
    .catch(() => { if (!controller.signal.aborted) aoResolver({ chave, carga: { estado: "erro", dados: [] } }); });
  return () => controller.abort();
}
