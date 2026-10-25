import type { CompanyKey, Pipeline, PipelineMemberRole, UpdatePipelineRequest } from "@plugga/shared";

/**
 * Quem alcança o quê nos pipelines (PLU-269):
 * - o admin e o gerente do CRM veem, criam e configuram todos os pipelines
 *   (o gerente do CRM gere o CRM das duas empresas, por isso `gestorEm` lista
 *   as duas);
 * - o gestor de um pipeline (equipe, papel `gestor`) configura aquele pipeline;
 * - o vendedor (equipe, papel `vendedor`) só vê o pipeline.
 */
export type AcessoComercial = { admin: boolean; gestorEm: readonly CompanyKey[] };

type ComEquipe = { companyId: string; members: readonly { userId: string; role: PipelineMemberRole }[] };

export const podeCriarEm = (acesso: AcessoComercial, empresa: string): boolean =>
  acesso.admin || (acesso.gestorEm as readonly string[]).includes(empresa);

export const podeVer = (acesso: AcessoComercial, pessoaId: string, pipeline: ComEquipe): boolean =>
  podeCriarEm(acesso, pipeline.companyId) || pipeline.members.some((m) => m.userId === pessoaId);

export const podeConfigurar = (acesso: AcessoComercial, pessoaId: string, pipeline: ComEquipe): boolean =>
  podeCriarEm(acesso, pipeline.companyId) || pipeline.members.some((m) => m.userId === pessoaId && m.role === "gestor");

/** Ids enviados que não pertencem ao pipeline: sinal de tela desatualizada ou de requisição forjada. */
export function idsDesconhecidos(existentes: readonly string[], itens: readonly { id?: string }[]): string[] {
  const conhecidos = new Set(existentes);
  return itens.flatMap((item) => (item.id && !conhecidos.has(item.id) ? [item.id] : []));
}

/** Os existentes que saíram da lista e devem ser excluídos. */
export function idsRemovidos(existentes: readonly string[], itens: readonly { id?: string }[]): string[] {
  const mantidos = new Set(itens.flatMap((item) => (item.id ? [item.id] : [])));
  return existentes.filter((id) => !mantidos.has(id));
}

const CAMPOS_GERAIS = ["companyId", "name", "description", "valueLabel", "color", "wonLabel", "lostLabel"] as const;

const assinatura = (valor: unknown) => JSON.stringify(valor);

/**
 * O que mudou, para a auditoria: nomes de campo e de seção, nunca valores.
 * Listas são comparadas na ordem, então reordenar etapas conta como mudança.
 */
export function alteracoes(antes: Pipeline, depois: UpdatePipelineRequest): { campos: string[]; secoes: string[] } {
  const campos = CAMPOS_GERAIS.filter((campo) => antes[campo] !== depois[campo]);
  const secoes: string[] = [];
  if (campos.length > 0) secoes.push("geral");

  const etapas = (lista: readonly { id?: string; name: string; color: string; staleAfterDays: number | null }[]) =>
    lista.map(({ id, name, color, staleAfterDays }) => [id ?? null, name, color, staleAfterDays]);
  if (assinatura(etapas(antes.stages)) !== assinatura(etapas(depois.stages))) secoes.push("etapas");

  const etiquetas = (lista: readonly { id?: string; name: string; color: string }[]) => lista.map(({ id, name, color }) => [id ?? null, name, color]);
  if (assinatura(etiquetas(antes.tags)) !== assinatura(etiquetas(depois.tags))) secoes.push("etiquetas");

  const motivos = (lista: readonly { id?: string; name: string; asksRevisitDate: boolean }[]) =>
    lista.map(({ id, name, asksRevisitDate }) => [id ?? null, name, asksRevisitDate]);
  if (assinatura(motivos(antes.lossReasons)) !== assinatura(motivos(depois.lossReasons))) secoes.push("motivosDePerda");

  const equipe = (lista: readonly { userId: string; role: string }[]) =>
    lista.map(({ userId, role }) => `${userId}:${role}`).sort();
  if (assinatura(equipe(antes.members)) !== assinatura(equipe(depois.members))) secoes.push("equipe");

  return { campos: [...campos], secoes };
}

/**
 * Etapas excluídas que têm negócios precisam de destino: uma etapa mantida, já
 * gravada (com id). Devolve o problema de cada etapa sem destino válido.
 */
export function problemasDosDestinos(
  atuais: readonly { id: string; name: string; dealCount: number }[],
  novas: readonly { id?: string }[],
  destinos: Readonly<Record<string, string>>,
): string[] {
  const mantidas = new Set(novas.flatMap((etapa) => (etapa.id ? [etapa.id] : [])));
  return atuais
    .filter((etapa) => etapa.dealCount > 0 && !mantidas.has(etapa.id))
    .flatMap((etapa) => {
      const destino = destinos[etapa.id];
      if (!destino) return [`Escolha para qual etapa vão os negócios de "${etapa.name}".`];
      if (!mantidas.has(destino)) return [`O destino dos negócios de "${etapa.name}" precisa ser uma etapa mantida.`];
      return [];
    });
}

/** Pipeline com negócios não muda de empresa: os negócios mudariam de dono sem ninguém decidir. */
export const trocaEmpresaComNegocios = (atual: { companyId: string; dealCount: number }, novaEmpresa: string): boolean =>
  atual.dealCount > 0 && atual.companyId !== novaEmpresa;
