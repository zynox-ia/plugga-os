import type {
  Acesso,
  Departamento as DepartamentoId,
  NivelDeDepartamento,
  PapelDaEquipe,
  UserStatus,
} from "@plugga/shared";

import type { Tone } from "../components/ui";
import { DEPARTAMENTOS } from "../lib/organizacao";

export const STATUS_LABEL: Record<UserStatus, string> = {
  invited: "Convidado",
  active: "Ativo",
  disabled: "Desativado",
};

export const STATUS_TOM: Record<UserStatus, Tone> = {
  invited: "neutral",
  active: "success",
  disabled: "danger",
};

export const NIVEL_LABEL: Record<NivelDeDepartamento, string> = { membro: "Membro", gerente: "Diretor" };

export const DESCRICAO_DO_DEPARTAMENTO: Record<DepartamentoId, string> = {
  crm: "Funil de vendas, clientes, propostas comerciais e contratos.",
  "energia-opm": "Ciclos mensais, auditoria de faturas e migração no Mercado Livre.",
  "produto-tecnologia": "PluggaMob, infraestrutura de recargas e eletropostos.",
  financeiro: "Contas a pagar e receber, fluxo de caixa e conciliação bancária.",
  suprimentos: "Gestão de compras, estoque e homologação de fornecedores.",
  "engenharia-obras": "Projetos elétricos, ordens de serviço, usinas e campo.",
  marketing: "Campanhas, geração de leads, comunicação institucional e eventos.",
};

export const PAPEL_DESCRICAO: Record<PapelDaEquipe, string> = {
  desenvolvedor: "Acesso irrestrito a todas as configurações técnicas, ferramentas de desenvolvimento e dados globais.",
  admin: "Acesso administrativo amplo a todos os departamentos, configurações da organização e equipe.",
  gerente: "Liderança e gestão dos departamentos atribuídos, com visualização gerencial e relatórios.",
  membro: "Acesso operacional restrito aos departamentos e telas específicas liberadas para a função.",
};

export function formatarDataHora(iso: string): string {
  try {
    const data = new Date(iso);
    if (isNaN(data.getTime())) return iso;
    return data.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function departamentoLabel(departamento: DepartamentoId): string {
  return DEPARTAMENTOS.find((entrada) => entrada.id === departamento)?.label ?? departamento;
}

export function departamentosDoAcesso(acesso: Acesso): DepartamentoId[] {
  return acesso.plataforma !== null
    ? DEPARTAMENTOS.map((departamento) => departamento.id)
    : acesso.departamentos.map((entrada) => entrada.departamento);
}
