import {
  alcancaDepartamento,
  alcancaTela,
  type Tela,
  companyKeys,
  departamentos as idsDosDepartamentos,
  papelDoAcesso,
  telasPorDepartamento,
  type Acesso,
  type CompanyKey,
  type Departamento as DepartamentoId,
  type PapelDaEquipe,
} from "@plugga/shared";

import type { IconName } from "../components/plugga-shell";
import { podeAbrirPagina, TELAS_DAS_ORDENS_DE_SERVICO, TELAS_DOS_LANCAMENTOS } from "./acesso-paginas.ts";
import { engenhariaHabilitado, financeiroHabilitado } from "./recursos.ts";

/**
 * Organização do plugga-os: Departamento → Processo.
 *
 * Fonte da navegação lateral e do mapa em /estrutura. Mudar um processo de
 * departamento é mover uma linha.
 *
 * Os 6 departamentos são os do acesso (`@plugga/shared`, `acesso.ts`): a
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
  /**
   * O processo abre com qualquer uma destas telas, quando não corresponde a uma
   * tela só (Lançamentos do Financeiro: contas a pagar ou a receber). Exclusivo
   * com `id`: um processo declara um ou outro.
   */
  telas?: readonly Tela[];
  label: string;
  /** Ausente enquanto o processo não tem tela. */
  rota?: string;
  status: ProcessoStatus;
  /**
   * A tela também serve a outro departamento (Compras para o Financeiro, que
   * aprova e paga): aparece na barra para quem abre a página, mesmo sem o
   * departamento dono.
   */
  compartilhado?: true;
};

export type Departamento = {
  id: DepartamentoId;
  label: string;
  icon: IconName;
  processos: Processo[];
  /**
   * As telas que se concedem no editor de acesso, quando não são uma por item
   * do menu. Ausente, valem os processos com `id`.
   */
  telas?: readonly { id: Tela; label: string }[];
};

/** Telas do departamento, com o rótulo, como o editor de acesso e a ficha do membro as mostram. */
export function telasDoDepartamento(departamento: Departamento): { id: Tela; label: string }[] {
  return departamento.telas
    ? [...departamento.telas]
    : departamento.processos.flatMap((processo) => (processo.id ? [{ id: processo.id, label: processo.label }] : []));
}

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
    // Menu aprovado pelo André em 23/11/2026 (PLU-336). Os ids de tela não
    // mudaram: as saídas dos Lançamentos exigem `financeiro.pagar` e as
    // entradas, `financeiro.receber`; Tarefas abre com qualquer tela do
    // Financeiro. Fiscal segue como tela concedível, sem item no menu (P2).
    processos: [
      { label: "Visão geral", telas: TELAS_DOS_LANCAMENTOS, status: "em-breve" },
      // Com o portão do Financeiro fechado (build de produção), o item segue em breve.
      { label: "Lançamentos", telas: TELAS_DOS_LANCAMENTOS, ...(financeiroHabilitado() ? { rota: "/financeiro/lancamentos", status: "parcial" as const } : { status: "em-breve" as const }) },
      // As antigas "Rotinas do dia": a tela compartilhada de Tarefas (PLU-340).
      { label: "Tarefas", telas: telasPorDepartamento.financeiro, ...(financeiroHabilitado() ? { rota: "/financeiro/tarefas", status: "parcial" as const } : { status: "em-breve" as const }) },
      { id: "financeiro.conciliacao", label: "Conciliação", status: "em-breve" },
    ],
    telas: [
      { id: "financeiro.pagar", label: "Contas a pagar" },
      { id: "financeiro.receber", label: "Contas a receber" },
      { id: "financeiro.conciliacao", label: "Conciliação" },
      { id: "financeiro.fiscal", label: "Fiscal" },
    ],
  },
  {
    id: "suprimentos",
    label: "Suprimentos",
    icon: "package",
    processos: [
      { id: "suprimentos.compras", label: "Compras", rota: "/suprimentos/compras", status: "pronto", compartilhado: true },
      { id: "suprimentos.fornecedores", label: "Fornecedores", rota: "/suprimentos/fornecedores", status: "pronto" },
      { id: "suprimentos.estoque", label: "Estoque", rota: "/suprimentos/estoque", status: "pronto" },
    ],
  },
  {
    id: "engenharia-obras",
    label: "Engenharia e Obras",
    icon: "hardhat",
    processos: [
      // Visão geral do dia da Engenharia (PLU-349), atrás do portão.
      { label: "Visão geral", telas: telasPorDepartamento["engenharia-obras"], ...(engenhariaHabilitado() ? { rota: "/engenharia/visao-geral", status: "parcial" as const } : { status: "em-breve" as const }) },
      { id: "engenharia-obras.obras", label: "Obras", status: "em-breve" },
      { id: "engenharia-obras.projetos", label: "Projetos elétricos", status: "em-breve" },
      // Com o portão da Engenharia fechado (build de produção), o item segue em breve (PLU-345).
      { label: "Ordens de serviço", telas: TELAS_DAS_ORDENS_DE_SERVICO, ...(engenhariaHabilitado() ? { rota: "/engenharia/ordens-de-servico", status: "parcial" as const } : { status: "em-breve" as const }) },
      // Agenda de campo (PLU-346), atrás do portão.
      { label: "Agenda de campo", telas: TELAS_DAS_ORDENS_DE_SERVICO, ...(engenhariaHabilitado() ? { rota: "/engenharia/agenda", status: "parcial" as const } : { status: "em-breve" as const }) },
      { label: "Tarefas", telas: telasPorDepartamento["engenharia-obras"], ...(engenhariaHabilitado() ? { rota: "/engenharia/tarefas", status: "parcial" as const } : { status: "em-breve" as const }) },
      { id: "engenharia-obras.instalacoes", label: "Instalações", status: "em-breve" },
      { id: "engenharia-obras.manutencao", label: "Manutenção", status: "em-breve" },
      { id: "engenharia-obras.visitas", label: "Visitas técnicas", status: "em-breve" },
      // Usinas e o monitoramento do dia (PLU-347), atrás do portão.
      { label: "Usinas", telas: telasPorDepartamento["engenharia-obras"], ...(engenhariaHabilitado() ? { rota: "/engenharia/usinas", status: "parcial" as const } : { status: "em-breve" as const }) },
      { id: "engenharia-obras.relatorios", label: "Relatórios de campo · fotos e aceite", status: "em-breve" },
    ],
    // Ordens de serviço abre com qualquer uma de quatro telas; o editor de acesso segue concedendo as oito.
    telas: [
      { id: "engenharia-obras.obras", label: "Obras" },
      { id: "engenharia-obras.projetos", label: "Projetos elétricos" },
      { id: "engenharia-obras.os", label: "Ordens de serviço" },
      { id: "engenharia-obras.instalacoes", label: "Instalações" },
      { id: "engenharia-obras.manutencao", label: "Manutenção" },
      { id: "engenharia-obras.visitas", label: "Visitas técnicas" },
      { id: "engenharia-obras.usinas", label: "Usinas solares · BESS" },
      { id: "engenharia-obras.relatorios", label: "Relatórios de campo · fotos e aceite" },
    ],
  },
];

/** Departamentos que a pessoa alcança, na ordem da barra. Sem acesso conhecido, todos. */
export function departamentosPermitidos(acesso: Acesso | null): Departamento[] {
  if (!acesso) {
    return DEPARTAMENTOS;
  }
  const visivel = (departamento: Departamento, processo: Processo) =>
    (alcancaDepartamento(acesso, departamento.id) && (processo.telas
      ? processo.telas.some((tela) => alcancaTela(acesso, tela))
      : !processo.id || alcancaTela(acesso, processo.id)))
    || Boolean(processo.compartilhado && processo.rota && podeAbrirPagina(acesso, processo.rota));
  return DEPARTAMENTOS.map((departamento) => ({ ...departamento, processos: departamento.processos.filter((processo) => visivel(departamento, processo)) }))
    .filter((departamento) => alcancaDepartamento(acesso, departamento.id) || departamento.processos.length > 0);
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
  id?: "perfil" | "seguranca" | "notificacoes" | "equipe" | "integracoes" | "desenvolvedor";
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
    descricao: "Conexões da sua conta com outros sistemas, como a agenda do Google.",
    rota: "/integracoes",
    status: "pronto",
    minimo: "membro",
  },
  {
    id: "desenvolvedor",
    label: "Desenvolvedor",
    descricao: "Integra\u00e7\u00f5es da plataforma e execu\u00e7\u00f5es dos jobs.",
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
