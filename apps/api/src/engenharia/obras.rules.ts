import { MARCOS_PADRAO_DA_OBRA, alcancaTela, somarDias, type Acesso, type SituacaoDaObra } from "@plugga/shared";

import { RequisicaoInvalida } from "../common/errors/dominio";

/** Regras das obras (PLU-350), puras. */

/** Cadastra, edita, marca marcos e anexa: a tela de Obras. */
export const operaObras = (acesso: Acesso | undefined): boolean => alcancaTela(acesso, "engenharia-obras.obras");

/** O orçamento (CC-D6): o gerente da Engenharia com a tela de Obras (o mesmo `tem_tela(obras, true)` do banco). */
export function gerenteDasObras(acesso: Acesso | undefined): boolean {
  if (!acesso) return false;
  if (acesso.plataforma !== null) return true;
  return acesso.departamentos.some((d) =>
    d.departamento === "engenharia-obras" && d.nivel === "gerente" && (d.telas === undefined || d.telas.includes("engenharia-obras.obras")),
  );
}

const dias = (de: string, ate: string): number => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

/** Os 6 marcos padrão distribuídos por igual: o primeiro no início, o último na entrega. */
export function distribuirMarcos(inicio: string, entrega: string): { ordem: number; nome: string; previstoEm: string }[] {
  const n = MARCOS_PADRAO_DA_OBRA.length;
  const passo = dias(inicio, entrega) / (n - 1);
  return MARCOS_PADRAO_DA_OBRA.map((nome, j) => ({ ordem: j + 1, nome, previstoEm: j === n - 1 ? entrega : somarDias(inicio, Math.round(passo * j)) }));
}

/** Pendente com a data passada, ou feito depois da data prevista. */
export function marcoAtrasado(previstoEm: string, feitoEm: string | null, hoje: string): boolean {
  return feitoEm ? feitoEm > previstoEm : previstoEm < hoje;
}

export function situacaoDaObra(marcos: { feito: boolean }[]): SituacaoDaObra {
  if (marcos.length === 0) return "sem_marcos";
  return marcos.every((m) => m.feito) ? "entregue" : "em_andamento";
}

/** O próximo marco: o pendente de menor ordem. Só ele pode ser marcado como feito. */
export function proximoMarco<T extends { ordem: number; feito: boolean }>(marcos: T[]): T | null {
  return [...marcos].sort((a, b) => a.ordem - b.ordem).find((m) => !m.feito) ?? null;
}

/**
 * Período da obra: a entrega vem pelo menos no dia seguinte ao início e, quando
 * é informada agora, a partir de amanhã. O início pode estar no passado.
 */
export function conferirPeriodo(inicio: string, entrega: string, hoje: string): void {
  const problemas: { campo: string; problema: string }[] = [];
  if (entrega <= inicio) problemas.push({ campo: "entregaPrevistaEm", problema: "A entrega vem pelo menos no dia seguinte ao início." });
  else if (entrega <= hoje) problemas.push({ campo: "entregaPrevistaEm", problema: "A entrega prevista vem a partir de amanhã." });
  if (problemas.length > 0) throw new RequisicaoInvalida("Confira as datas da obra.", problemas);
}

/** Assinatura do arquivo composto da Microsoft (OLE), o formato do .mpp. */
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
export function ehArquivoDoMsProject(buffer: Buffer, nome: string): boolean {
  return /\.mpp$/i.test(nome.trim()) && buffer.length >= OLE.length && OLE.every((b, i) => buffer[i] === b);
}
