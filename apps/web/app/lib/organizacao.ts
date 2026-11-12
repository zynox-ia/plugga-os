import {
  alcancaDepartamento,
  alcancaTela,
  type Tela,
  companyKeys,
  departamentos as idsDosDepartamentos,
  papelDoAcesso,
  type Acesso,
  type CompanyKey,
  type Departamento as DepartamentoId,
  type PapelDaEquipe,
} from "@plugga/shared";

import type { IconName } from "../components/plugga-shell";
import { podeAbrirPagina } from "./acesso-paginas.ts";

/**
 * Organização do plugga-os: Departamento → Processo.
 *
 * Fonte da navegação lateral e do mapa em /estrutura. Mudar um processo de
 * departamento é mover uma linha.
 *
 * Os 7 departamentos são os do acesso (`@plugga/shared`, `acesso.ts`): a
 * barra lateral mostra só os que a pessoa alcança. Plugga e Waze não são
 * departamentos nem fronteira de acesso; são etiqueta dos registros (pedido,
 * obra, pipeline) e filtro das telas.
 */

export const EMPRESAS = companyKeys;
export type EmpresaId = CompanyKey;

export const EMPRESA_PADRAO: EmpresaId = "plugga";

export function isEmpresaId(value: string | null | undefined): value is EmpresaId {
  return EMPRESAS.includes(value as EmpresaId);
}

/** Nome e descrição de cada empresa, para a etiqueta dos registros. */
export const EMPRESAS_POR_ID: Record<EmpresaId, { id: EmpresaId; nome: string; descricao: string }> = {
  plugga: { id: "plugga", nome: "Plugga", descricao: "Consultoria: gestão de energia, OPM e eletromobilidade" },
  waze: { id: "waze", nome: "Waze Energia", descricao: "Engenharia e obras: projetos, instalações e serviços" },
};

/**
 * `pronto` tem tela ligada a dado real; `parcial` tem tela, mas ainda é
 * mock ou incompleta; `em-breve` só existe no desenho. A navegação usa o
 * status para desabilitar processos sem tela, sem exibir etiquetas de status.
 */
export type ProcessoStatus = "pronto" | "parcial" | "em-breve";

export type Processo = {
  id?: Tela;
  label: string;
  /** Ausente enquanto o processo não tem tela. */
  rota?: string;
  status: ProcessoStatus;
};

export type Departamento = {
  id: DepartamentoId;
  label: string;
  icon: IconName;
  processos: Processo[];
};

/**
 * Os departamentos na ordem da barra lateral (aprovada pelo André em
 * 25/10/2026). O CRM é um só para as duas empresas (ADR-0013); configurar
 * pipelines é um botão na tela de Pipelines, não item de menu (19/10/2026).
 * Suprimentos nasce com Compras, que saiu do Financeiro.
 */
export const DEPARTAMENTOS: Departamento[] = [
  {
    id: "crm",
    label: "CRM",
    icon: "users",
    processos: [
      { id: "crm.pipelines", label: "Pipelines", rota: "/comercial/pipelines", status: "parcial" },
      { id: "crm.clientes", label: "Clientes", rota: "/clientes", status: "pronto" },
      { id: "crm.propostas", label: "Propostas", status: "em-breve" },
      { id: "crm.contratos", label: "Contratos", rota: "/comercial/contratos", status: "parcial" },
    ],
  },
  {
    id: "energia-opm",
    label: "Energia",
    icon: "bolt",
    processos: [
      { id: "energia-opm.ciclos", label: "Ciclos mensais", status: "em-breve" },
      { id: "energia-opm.auditoria", label: "Auditoria de faturas", status: "em-breve" },
      { id: "energia-opm.migracao", label: "Migração Mercado Livre", status: "em-breve" },
      { id: "energia-opm.relatorios", label: "Relatórios de economia", status: "em-breve" },
      { id: "energia-opm.demanda", label: "Demanda contratada", status: "em-breve" },
    ],
  },
  {
    id: "produto-tecnologia",
    label: "Eletromobilidade",
    icon: "pulse",
    processos: [
      { id: "produto-tecnologia.pluggamob", label: "PluggaMob", status: "em-breve" },
      { id: "produto-tecnologia.eletropostos", label: "EV Point · eletropostos", status: "em-breve" },
      { id: "produto-tecnologia.recargas", label: "Recargas", status: "em-breve" },
      { id: "produto-tecnologia.parceiros", label: "Parceiros", status: "em-breve" },
      { id: "produto-tecnologia.dashboards", label: "Dashboards do produto", status: "em-breve" },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: "wallet",
    processos: [
      { id: "financeiro.pagar", label: "Contas a pagar", status: "em-breve" },
      { id: "financeiro.receber", label: "Contas a receber", status: "em-breve" },
      { id: "financeiro.conciliacao", label: "Conciliação", status: "em-breve" },
      { id: "financeiro.fiscal", label: "Fiscal", status: "em-breve" },
    ],
  },
  {
    id: "suprimentos",
    label: "Suprimentos",
    icon: "package",
    processos: [
      { id: "suprimentos.compras", label: "Compras", status: "em-breve" },
      { id: "suprimentos.fornecedores", label: "Fornecedores", status: "em-breve" },
      { id: "suprimentos.estoque", label: "Estoque", status: "em-breve" },
    ],
  },
  {
    id: "engenharia-obras",
    label: "Engenharia e Obras",
    icon: "hardhat",
    processos: [
      { id: "engenharia-obras.obras", label: "Obras", status: "em-breve" },
      { id: "engenharia-obras.projetos", label: "Projetos elétricos", status: "em-breve" },
      { id: "engenharia-obras.os", label: "Ordens de serviço", status: "em-breve" },
      { id: "engenharia-obras.instalacoes", label: "Instalações", status: "em-breve" },
      { id: "engenharia-obras.manutencao", label: "Manutenção", status: "em-breve" },
      { id: "engenharia-obras.visitas", label: "Visitas técnicas", status: "em-breve" },
      { id: "engenharia-obras.usinas", label: "Usinas solares · BESS", status: "em-breve" },
      { id: "engenharia-obras.relatorios", label: "Relatórios de campo · fotos e aceite", status: "em-breve" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: "megaphone",
    processos: [{ id: "marketing.campanhas", label: "Campanhas", status: "em-breve" }],
  },
];

/** Departamentos que a pessoa alcança, na ordem da barra. Sem acesso conhecido, todos. */
export function departamentosPermitidos(acesso: Acesso | null): Departamento[] {
  if (!acesso) {
    return DEPARTAMENTOS;
  }
  return DEPARTAMENTOS.filter((departamento) => alcancaDepartamento(acesso, departamento.id)).map((departamento) => ({
    ...departamento, processos: departamento.processos.filter((processo) => !processo.id || alcancaTela(acesso, processo.id)),
  }));
}

/**
 * Início é só o Dashboard. A Central de Pendências saiu do menu e do código em
 * 25/10/2026: era uma tela de exemplo, e a pendência passa a viver dentro de
 * cada departamento, junto dos indicadores do próprio processo.
 */
export const VISAO_GERAL: Processo[] = [
  { label: "Dashboard", rota: "/", status: "parcial" },
];

/**
 * Ferramentas atravessam todos os departamentos e fecham a barra lateral.
 * Configurações é o último item: a entrada aparece para todos e a página
 * filtra as seções pelo papel (`configuracoesParaAcesso`).
 */
export const FERRAMENTAS: Processo[] = [
  { label: "Agentes IA", rota: "/agentes-ia", status: "parcial" },
  { label: "Configurações", rota: "/configuracoes", status: "pronto" },
];

/**
 * Telas que existem mas não têm item no menu. Ficam aqui só para o título do
 * topo e o destaque de rota as resolverem: Atividades saiu do CRM no sitemap
 * aprovado em 25/10/2026, e `/comercial/atividades` continua acessível por URL.
 */
export const ROTAS_FORA_DO_MENU: Processo[] = [
  { label: "Atividades", rota: "/comercial/atividades", status: "parcial" },
  { label: "Documentos", rota: "/documentos", status: "parcial" },
];

/** Como cada papel aparece na tela. */
export const ROTULO_DO_PAPEL: Record<PapelDaEquipe, string> = {
  desenvolvedor: "Desenvolvedor",
  admin: "Admin",
  gerente: "Gerente",
  membro: "Membro",
};

/** Degraus da escada, do menor para o maior. */
const DEGRAUS: readonly PapelDaEquipe[] = ["membro", "gerente", "admin", "desenvolvedor"];

/**
 * Configurações: o que se ajusta uma vez, não o que se usa todo dia. Entra
 * como **um** item no rodapé da barra, abrindo uma página com as seções
 * abaixo. `minimo` é o menor papel que enxerga a seção: o gerente vê Equipe
 * (só do próprio departamento), o admin vê o que faz a plataforma funcionar e
 * o desenvolvedor vê também as telas técnicas. A entrada em si aparece sempre:
 * esconder o menu inteiro faz quem não tem acesso procurar onde não existe.
 */
export type SecaoConfiguracao = Omit<Processo, "id"> & {
  descricao: string;
  minimo: PapelDaEquipe;
  /** Marca a seção que tem tela própria dentro de Configurações. */
  id?: "perfil" | "seguranca" | "notificacoes" | "equipe" | "integracoes" | "chave-llm" | "desenvolvedor";
};

export const CONFIGURACOES: SecaoConfiguracao[] = [
  {
    id: "perfil",
    label: "Perfil",
    descricao: "Identificação, foto e dados de contato da sua conta.",
    status: "pronto",
    minimo: "membro",
  },
  {
    id: "seguranca",
    label: "Segurança",
    descricao: "Autenticação em duas etapas e senha de acesso à sua conta.",
    status: "pronto",
    minimo: "membro",
  },
  {
    id: "notificacoes",
    label: "Notificações",
    descricao: "Preferências de alertas no CRM, prazos de tarefas e notificações por e-mail.",
    status: "em-breve",
    minimo: "membro",
  },
  {
    id: "equipe",
    label: "Equipe e Acessos",
    descricao:
      "Quem entra e o que alcança: membro ou gerente por departamento, admin ou desenvolvedor na plataforma.",
    status: "pronto",
    minimo: "gerente",
  },
  {
    id: "integracoes",
    label: "Integrações",
    descricao: "Conexões da empresa com outros sistemas, usadas pelo back-end e pelas telas do Plugga OS.",
    rota: "/integracoes",
    status: "pronto",
    minimo: "admin",
  },
  {
    id: "chave-llm",
    label: "Chave de IA",
    descricao: "Chave usada pelos agentes de IA, guardada no cofre da plataforma.",
    status: "pronto",
    minimo: "admin",
  },
  {
    id: "desenvolvedor",
    label: "Desenvolvedor",
    descricao: "Execu\u00e7\u00f5es dos jobs e ferramentas t\u00e9cnicas.",
    status: "pronto",
    minimo: "desenvolvedor",
  },
];

/**
 * Seções visíveis para o acesso. Sem nenhuma, nenhuma — e a tela diz isso em
 * vez de mostrar uma lista vazia sem explicação.
 */
export function configuracoesParaAcesso(acesso: Acesso): SecaoConfiguracao[] {
  const degrau = DEGRAUS.indexOf(papelDoAcesso(acesso));
  return CONFIGURACOES.filter((secao) =>
    degrau >= DEGRAUS.indexOf(secao.minimo)
    && (secao.id !== "desenvolvedor" || acesso.plataforma === "desenvolvedor")
    && (!secao.rota || podeAbrirPagina(acesso, secao.rota)),
  );
}

/**
 * Globais: não pertencem a um departamento. Job, integração e agente servem a
 * todos; o desenho dos processos também mora aqui.
 */
export const GLOBAIS: Processo[] = [
  { label: "Estrutura do sistema", rota: "/estrutura", status: "pronto" },
  // Rota herdada do Bloco A; o conteúdo dela mora em Configurações → Equipe.
  { label: "Administração", rota: "/administracao", status: "parcial" },
];

// Falha no carregamento se um departamento do acesso ficar sem item de menu (ou
// o contrário): seria um acesso concedido que não aparece na tela.
const _catalogoCasaComAcesso =
  JSON.stringify(DEPARTAMENTOS.map((departamento) => departamento.id).sort()) ===
  JSON.stringify([...idsDosDepartamentos].sort());
if (!_catalogoCasaComAcesso) {
  throw new Error("os departamentos de organizacao.ts divergem dos de @plugga/shared (acesso.ts)");
}
