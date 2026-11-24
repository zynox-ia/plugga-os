import {
  alcancaTela,
  departamentosDosProtocolos,
  protocoloEncerrado,
  somarDias,
  type Acesso,
  type DepartamentoDoProtocolo,
  type SituacaoDoProtocolo,
  type Tela,
} from "@plugga/shared";

import { RequisicaoInvalida } from "../common/errors/dominio";

/** Regras dos protocolos na distribuidora (PLU-348), puras. */

export const telaDosProtocolos = (departamento: DepartamentoDoProtocolo): Tela => `${departamento}.protocolos` as Tela;

/** Os departamentos cujos protocolos a pessoa alcança (a tela de protocolos de cada um, o mesmo `tela_de_protocolos` do RLS). */
export function departamentosDosProtocolosDe(acesso: Acesso | undefined): DepartamentoDoProtocolo[] {
  return departamentosDosProtocolos.filter((d) => alcancaTela(acesso, telaDosProtocolos(d)));
}

export const alcancaProtocolos = (acesso: Acesso | undefined, departamento: DepartamentoDoProtocolo): boolean => alcancaTela(acesso, telaDosProtocolos(departamento));

/** O catálogo de distribuidoras muda com o gerente que tem uma das telas de protocolos (`tem_tela(..., true)` do RLS). */
export function gerenteDosProtocolos(acesso: Acesso | undefined): boolean {
  if (!acesso) return false;
  if (acesso.plataforma !== null) return true;
  return acesso.departamentos.some((d) =>
    (departamentosDosProtocolos as readonly string[]).includes(d.departamento)
    && d.nivel === "gerente"
    && (d.telas === undefined || d.telas.includes(telaDosProtocolos(d.departamento as DepartamentoDoProtocolo))),
  );
}

/** Dias do calendário de `de` até `ate` (negativo quando `ate` já passou). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/** Aberto e com a verificação para hoje ou atrasada. */
export function verificaHoje(situacao: SituacaoDoProtocolo, proximaVerificacao: string | null, hoje: string): boolean {
  return !protocoloEncerrado(situacao) && proximaVerificacao !== null && proximaVerificacao <= hoje;
}

/** Vence em até 7 dias, contando hoje; vencido quando a data-limite já passou. */
export function prazoDoProtocolo(situacao: SituacaoDoProtocolo, dataLimite: string, hoje: string): "vencido" | "vence_em_7_dias" | "no_prazo" | "encerrado" {
  if (protocoloEncerrado(situacao)) return "encerrado";
  if (dataLimite < hoje) return "vencido";
  return dataLimite <= somarDias(hoje, 7) ? "vence_em_7_dias" : "no_prazo";
}

/** Sem datas no passado, nem digitadas:data-limite e próxima verificação a partir de hoje; abertura até hoje. */
export function conferirDatas(datas: { abertoEm?: string; dataLimite?: string; proximaVerificacao?: string | null }, hoje: string): void {
  const problemas: { campo: string; problema: string }[] = [];
  if (datas.abertoEm !== undefined && datas.abertoEm > hoje) problemas.push({ campo: "abertoEm", problema: "A abertura não pode estar no futuro." });
  if (datas.dataLimite !== undefined && datas.dataLimite < hoje) problemas.push({ campo: "dataLimite", problema: "A data-limite não pode estar no passado." });
  if (datas.proximaVerificacao && datas.proximaVerificacao < hoje) problemas.push({ campo: "proximaVerificacao", problema: "A próxima verificação não pode estar no passado." });
  if (problemas.length > 0) throw new RequisicaoInvalida("Confira as datas do protocolo.", problemas);
}

/** "Amazonas Energia" → "amazonas-energia". */
export function idDaDistribuidora(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
